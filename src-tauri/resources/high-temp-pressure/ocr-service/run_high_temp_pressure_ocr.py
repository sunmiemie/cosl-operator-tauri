from __future__ import annotations

import argparse
import csv
import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any

import cv2

RESOURCE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(RESOURCE_DIR))

from ocr_service.config import RegionConfig, load_config  # noqa: E402
from ocr_service.factory import build_runtime  # noqa: E402


FIELD_METADATA = {
    "oil_tank_level": ("油箱", "油位"),
    "oil_tank_oil_temp": ("油箱", "油温"),
    "top_outlet_oil_temp": ("高位油箱", "出口油温"),
    "vessel_250_upper_water_temp": ("250试验容器", "上部水温"),
    "air_source_pressure": ("气源", "压力"),
    "vessel_250_upper_inlet_oil_temp": ("250试验容器", "上进口油温"),
    "vessel_250_pressure": ("250试验容器", "压力"),
    "cooling_tank_outlet_water_temp": ("冷却水箱", "出口水温"),
    "cooler_outlet_oil_temp": ("冷却器", "出口油温"),
    "low_pressure_pump_outlet_pressure": ("低压泵", "出口压力"),
    "cooling_tank_water_temp": ("冷却水箱", "水温"),
    "cooling_tank_inlet_water_temp": ("冷却水箱", "进口水温"),
    "vessel_250_lower_inlet_oil_temp": ("250试验容器", "下进口油温"),
    "oil_gas_separator_inlet_oil_temp": ("油气分离器", "进口油温"),
    "vessel_250_lower_water_temp": ("250试验容器", "下部水温"),
    "oil_gas_separator_outlet_oil_temp": ("油气分离器", "出口油温"),
    "vessel_480_upper_water_temp": ("480试验容器", "上部水温"),
    "high_pressure_pump_outlet_pressure": ("高压泵", "出口压力"),
    "vessel_480_upper_inlet_oil_temp": ("480试验容器", "上进口油温"),
    "vessel_480_upper_outlet_oil_temp": ("480试验容器", "上出口油温"),
    "cylinder_pressure": ("筒内", "压力"),
    "vessel_480_lower_water_temp": ("480试验容器", "下部水温"),
    "high_temp_chamber_room_temp": ("高温室", "室温"),
}

JOURNAL_FILE_NAME = "ocr_records.ndjson"
RETRYABLE_WINDOWS_ERRORS = {5, 32, 33}
CURVE_OUTPUT_FIELDS = [
    {
        "id": "upper_temp",
        "label": "上部水温",
        "unit": "°C",
        "source_ids": [
            "vessel_250_upper_water_temp",
            "vessel_480_upper_water_temp",
        ],
    },
    {
        "id": "lower_temp",
        "label": "下部水温",
        "unit": "°C",
        "source_ids": [
            "vessel_250_lower_water_temp",
            "vessel_480_lower_water_temp",
        ],
    },
    {
        "id": "pressure",
        "label": "容器压力",
        "unit": "MPa",
        "source_ids": [
            "vessel_250_pressure",
            "cylinder_pressure",
            "high_pressure_pump_outlet_pressure",
        ],
    },
]


def emit_event(event: str, **payload: Any) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def temporary_path_for(path: Path) -> Path:
    suffix = f".{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp"
    return path.with_name(path.name + suffix)


def replace_with_retry(temporary: Path, path: Path, attempts: int = 8) -> None:
    for attempt in range(attempts):
        try:
            os.replace(temporary, path)
            return
        except OSError as exc:
            retryable = isinstance(exc, PermissionError) or getattr(
                exc, "winerror", None
            ) in RETRYABLE_WINDOWS_ERRORS
            if not retryable or attempt == attempts - 1:
                raise
            time.sleep(min(0.02 * (2**attempt), 0.5))


def atomic_write_text(path: Path, text: str) -> None:
    temporary = temporary_path_for(path)
    try:
        with temporary.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
            handle.flush()
        replace_with_retry(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class RecordJournal:
    def __init__(self, output_dir: Path) -> None:
        self.path = output_dir / JOURNAL_FILE_NAME
        self._handle = self.path.open(
            "w", encoding="utf-8", newline="\n", buffering=1
        )
        self.count = 0
        self.screen_detected_count = 0
        self.latest_record: dict[str, Any] | None = None

    def append(self, record: dict[str, Any]) -> dict[str, Any]:
        indexed_record = {**record, "record_index": self.count + 1}
        self._handle.write(
            json.dumps(indexed_record, ensure_ascii=False, separators=(",", ":"))
            + "\n"
        )
        self._handle.flush()
        self.count += 1
        if indexed_record.get("screen_detected"):
            self.screen_detected_count += 1
        self.latest_record = indexed_record
        return indexed_record

    def close(self) -> None:
        if self._handle.closed:
            return
        self._handle.flush()
        self._handle.close()

    def records(self):
        if not self._handle.closed:
            self._handle.flush()
        with self.path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                text = line.strip()
                if not text:
                    continue
                try:
                    record = json.loads(text)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"OCR 增量记录第 {line_number} 行损坏: {exc}"
                    ) from exc
                if isinstance(record, dict):
                    yield record


def measurement_metadata(region: RegionConfig) -> tuple[str, str]:
    return FIELD_METADATA.get(region.id, (region.label, ""))


def numeric_value(raw: Any, region: RegionConfig) -> int | float | None:
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if region.value_type == "integer":
        return int(round(value))
    return value


def build_record(runtime: Any, started_at: float) -> dict[str, Any]:
    snapshot = runtime.repository.latest_snapshot()
    status = runtime.status()
    measurements = []
    for region in runtime.config.regions:
        if not region.enabled:
            continue
        item = snapshot.get(region.id, {})
        part, data = measurement_metadata(region)
        measurements.append(
            {
                "id": region.id,
                "part": part,
                "data": data,
                "raw": item.get("text"),
                "value": numeric_value(item.get("numeric_value"), region),
                "confidence": item.get("confidence"),
                "status": item.get("status", "no_data"),
                "reason": item.get("reason"),
                "accepted_at": item.get("accepted_at"),
            }
        )
    checks = status.get("readiness", {}).get("checks", {})
    return {
        "time_sec": round(time.monotonic() - started_at, 3),
        "captured_at": status.get("realtime", {})
        .get("last_cycle", {})
        .get("completed_at"),
        "screen_detected": bool(checks.get("screen")),
        "measurements": measurements,
    }


def enabled_fields(regions: list[RegionConfig]) -> list[dict[str, str]]:
    return [
        {
            "id": region.id,
            "part": measurement_metadata(region)[0],
            "data": measurement_metadata(region)[1],
        }
        for region in regions
        if region.enabled
    ]


def measurement_values_by_id(record: dict[str, Any]) -> dict[str, int | float | None]:
    return {
        str(item.get("id")): item.get("value")
        for item in record.get("measurements", [])
        if isinstance(item, dict) and item.get("id")
    }


def first_numeric_measurement(
    values: dict[str, int | float | None], source_ids: list[str]
) -> int | float | None:
    for source_id in source_ids:
        value = values.get(source_id)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return value
    return None


def compact_curve_record(
    record: dict[str, Any],
    values: dict[str, int | float | None] | None = None,
) -> dict[str, Any]:
    measurement_values = values if values is not None else measurement_values_by_id(record)
    return {
        "record_index": record.get("record_index"),
        "time_sec": record.get("time_sec"),
        "captured_at": record.get("captured_at"),
        "screen_detected": bool(record.get("screen_detected")),
        **{
            field["id"]: first_numeric_measurement(
                measurement_values, field["source_ids"]
            )
            for field in CURVE_OUTPUT_FIELDS
        },
    }


def write_compact_outputs(
    json_path: Path,
    csv_path: Path,
    journal: RecordJournal,
    regions: list[RegionConfig],
) -> None:
    json_temporary = temporary_path_for(json_path)
    csv_temporary = temporary_path_for(csv_path)
    field_ids = [region.id for region in regions if region.enabled]
    header = {
        "schema_version": 2,
        "source": "live_ocr",
        "sample_interval_seconds": 0.5,
        "field_count": len(CURVE_OUTPUT_FIELDS),
        "fields": CURVE_OUTPUT_FIELDS,
        "record_count": journal.count,
    }
    try:
        with (
            json_temporary.open("w", encoding="utf-8", newline="") as json_handle,
            csv_temporary.open("w", encoding="utf-8", newline="") as csv_handle,
        ):
            encoded_header = json.dumps(
                header, ensure_ascii=False, separators=(",", ":")
            )
            json_handle.write(encoded_header[:-1])
            json_handle.write(',"records":[')
            csv_writer = csv.writer(csv_handle)
            csv_writer.writerow(
                ["time_sec", "captured_at", "screen_detected", *field_ids]
            )
            first = True
            for record in journal.records():
                values = measurement_values_by_id(record)
                if not first:
                    json_handle.write(",")
                json_handle.write(
                    json.dumps(
                        compact_curve_record(record, values),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                )
                csv_writer.writerow(
                    [
                        record.get("time_sec", ""),
                        record.get("captured_at", ""),
                        1 if record.get("screen_detected") else 0,
                        *[values.get(field_id, "") for field_id in field_ids],
                    ]
                )
                first = False
            json_handle.write("]}")
            json_handle.flush()
            csv_handle.flush()
        replace_with_retry(json_temporary, json_path)
        replace_with_retry(csv_temporary, csv_path)
    finally:
        json_temporary.unlink(missing_ok=True)
        csv_temporary.unlink(missing_ok=True)


def write_outputs(
    output_dir: Path, journal: RecordJournal, regions: list[RegionConfig]
) -> None:
    fields = enabled_fields(regions)
    latest = journal.latest_record
    summary = {
        "schema_version": 1,
        "source": "live_ocr",
        "field_count": len(fields),
        "fields": fields,
        "record_count": journal.count,
        "screen_detected_count": journal.screen_detected_count,
        "latest_time_sec": latest.get("time_sec") if latest else 0,
        "latest_measurements": latest.get("measurements") if latest else [],
    }
    write_compact_outputs(
        output_dir / "ocr_readings_0.5s.json",
        output_dir / "ocr_readings.csv",
        journal,
        regions,
    )
    atomic_write_text(
        output_dir / "experiment_summary.json",
        json.dumps(summary, ensure_ascii=False, indent=2),
    )


def readiness_percent(status: dict[str, Any]) -> int:
    checks = status.get("readiness", {}).get("checks", {})
    if not checks:
        return 0
    return round(sum(bool(value) for value in checks.values()) / len(checks) * 100)


def write_progress(
    output_dir: Path,
    runtime: Any,
    record_count: int,
    *,
    paused: bool,
    complete: bool,
    latest_frame: Path | None,
    error: str | None = None,
) -> None:
    status = runtime.status()
    payload = {
        "exists": True,
        "source": "live_ocr",
        "current": record_count,
        "record_count": record_count,
        "ready_pct": readiness_percent(status),
        "latest_frame": str(latest_frame) if latest_frame and latest_frame.exists() else "",
        "complete": complete,
        "paused": paused,
        "error": error,
        "output_dir": str(output_dir),
        "journal_path": str(output_dir / JOURNAL_FILE_NAME),
        "service": status,
    }
    atomic_write_text(
        output_dir / "ocr_progress.json",
        json.dumps(payload, ensure_ascii=False, indent=2),
    )


def write_progress_safely(*args: Any, **kwargs: Any) -> str | None:
    try:
        write_progress(*args, **kwargs)
        return None
    except OSError as exc:
        return str(exc)


def read_control_action(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        action = str(payload.get("action", ""))
    except (OSError, ValueError, TypeError):
        return ""
    path.unlink(missing_ok=True)
    return action


def save_review_frame(runtime: Any, output_dir: Path, cycle_id: str | None) -> tuple[Path | None, str | None]:
    review = runtime.review_snapshot()
    if review is None or review.get("cycle_id") == cycle_id:
        return None, cycle_id
    path = output_dir / "latest_frame.jpg"
    temporary = output_dir / (
        f"latest_frame.{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp.jpg"
    )
    try:
        if not cv2.imwrite(
            str(temporary), review["image"], [int(cv2.IMWRITE_JPEG_QUALITY), 86]
        ):
            return None, cycle_id
        replace_with_retry(temporary, path)
        return path, str(review["cycle_id"])
    except OSError:
        return None, cycle_id
    finally:
        temporary.unlink(missing_ok=True)


def run(device_index: int, output_dir: Path, interval: float) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    config = load_config(RESOURCE_DIR / "config.yaml")
    config.capture.device = str(device_index)
    config.sampling.realtime_interval_seconds = max(0.25, interval)
    config.storage.database_path = output_dir / "ocr.sqlite3"
    config.storage.incidents_dir = output_dir / "incidents"

    runtime = build_runtime(config)
    stop_requested = threading.Event()

    def request_stop(*_: Any) -> None:
        stop_requested.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    emit_event("status", phase="bootstrap", message="正在加载 OCR 模型并连接采集卡")
    runtime.start()
    started_at = time.monotonic()
    journal = RecordJournal(output_dir)
    control_path = output_dir / "ocr_control.json"
    last_realtime_cycle: str | None = None
    last_review_cycle: str | None = None
    latest_frame: Path | None = None
    paused = False
    ready_emitted = False
    last_status_message = ""
    last_progress_error: str | None = None

    def persist_progress(*, complete: bool, error: str | None = None) -> None:
        nonlocal last_progress_error
        progress_error = write_progress_safely(
            output_dir,
            runtime,
            journal.count,
            paused=paused,
            complete=complete,
            latest_frame=latest_frame,
            error=error,
        )
        if progress_error == last_progress_error:
            return
        if progress_error:
            emit_event(
                "status",
                phase="storage",
                message=f"采集状态文件暂时写入失败，OCR 仍在继续: {progress_error}",
            )
        elif last_progress_error:
            emit_event("status", phase="storage", message="采集状态文件写入已恢复")
        last_progress_error = progress_error

    emit_event(
        "start",
        device_index=device_index,
        interval=config.sampling.realtime_interval_seconds,
        field_count=len(config.regions),
        fields=[region.id for region in config.regions if region.enabled],
    )
    persist_progress(complete=False)

    try:
        while not stop_requested.wait(0.1):
            action = read_control_action(control_path)
            if action == "stop":
                break
            if action == "pause" and not paused:
                paused = True
                emit_event("paused", message="OCR 数据采集已暂停")
                persist_progress(complete=False)
            elif action == "resume" and paused:
                paused = False
                emit_event("resumed", message="OCR 数据采集已恢复")
                persist_progress(complete=False)

            status = runtime.status()
            model_error = status.get("readiness", {}).get("model_error")
            if model_error:
                raise RuntimeError(f"OCR 模型不可用: {model_error}")

            source = status.get("source", {})
            source_state = source.get("state", "stopped")
            if source_state != "running":
                message = source.get("last_error") or "正在等待采集卡画面"
                if message != last_status_message:
                    emit_event("status", phase="capture", message=message)
                    last_status_message = message

            if status.get("ready") and not ready_emitted:
                ready_emitted = True
                emit_event("ready", ready_pct=100, message="OCR 已就绪，正在识别实时数据")

            realtime = status.get("realtime", {}).get("last_cycle") or {}
            cycle_id = realtime.get("id")
            if cycle_id and cycle_id != last_realtime_cycle:
                last_realtime_cycle = str(cycle_id)
                latest, last_review_cycle = save_review_frame(
                    runtime, output_dir, last_review_cycle
                )
                if latest is not None:
                    latest_frame = latest
                if not paused:
                    record = journal.append(build_record(runtime, started_at))
                    persist_progress(complete=False)
                    emit_event(
                        "sample",
                        current=journal.count,
                        ready_pct=readiness_percent(status),
                        record=record,
                        preview_path=str(latest_frame) if latest_frame else "",
                    )
    except Exception as exc:
        failure_message = str(exc)
        emit_event("error", message=failure_message)
        return_code = 1
    else:
        failure_message = None
        return_code = 0
    finally:
        try:
            runtime.stop()
        except Exception as exc:
            stop_error = f"停止 OCR 运行时失败: {exc}"
            failure_message = (
                f"{failure_message}；{stop_error}" if failure_message else stop_error
            )
            return_code = 1
            emit_event("error", message=stop_error)
        journal.close()
        try:
            write_outputs(output_dir, journal, config.regions)
        except Exception as exc:
            output_error = f"生成最终 OCR 结果失败: {exc}"
            failure_message = (
                f"{failure_message}；{output_error}" if failure_message else output_error
            )
            return_code = 1
            emit_event("error", message=output_error)
        paused = False
        persist_progress(complete=return_code == 0, error=failure_message)
        if return_code == 0:
            emit_event(
                "complete",
                output_dir=str(output_dir),
                json_path=str(output_dir / "ocr_readings_0.5s.json"),
                summary_path=str(output_dir / "experiment_summary.json"),
                csv_path=str(output_dir / "ocr_readings.csv"),
                latest_frame=str(latest_frame) if latest_frame else "",
                record_count=journal.count,
            )
    return return_code


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Live OCR capture for the high-temperature high-pressure well module"
    )
    parser.add_argument("--device-index", type=int, default=0)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--interval", type=float, default=0.5)
    args = parser.parse_args()
    return run(args.device_index, Path(args.output_dir).resolve(), args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
