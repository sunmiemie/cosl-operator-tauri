"""Dual YET serial collector for the sensorless oven test page."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from serial.tools import list_ports

SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from monitor import YetTemperatureMonitor


CONTROL_FILENAME = "capture_control.json"
EVENTS_FILENAME = "events.jsonl"
META_FILENAME = "meta.json"


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now(moment: datetime | None = None) -> str:
    return (moment or utc_now()).isoformat()


def resolve_by_id(device: str) -> str | None:
    by_id_dir = Path("/dev/serial/by-id")
    if not by_id_dir.exists():
        return None
    try:
        target = Path(device).resolve()
        for link in by_id_dir.iterdir():
            try:
                if link.resolve() == target:
                    return str(link)
            except OSError:
                continue
    except OSError:
        return None
    return None


def port_display(item) -> str:
    serial_number = getattr(item, "serial_number", None) or ""
    description = (item.description or "").strip()
    by_id = resolve_by_id(item.device)
    extra = serial_number or by_id or description
    if extra and extra != item.device:
        return f"{item.device} — {extra}"
    return item.device


def list_serial_ports() -> list[dict[str, Any]]:
    ports: list[dict[str, Any]] = []
    for item in list_ports.comports():
        ports.append(
            {
                "device": item.device,
                "description": item.description or "",
                "hwid": item.hwid or "",
                "serial_number": getattr(item, "serial_number", None) or "",
                "manufacturer": getattr(item, "manufacturer", None) or "",
                "vid": item.vid,
                "pid": item.pid,
                "by_id": resolve_by_id(item.device),
                "display": port_display(item),
            }
        )
    ports.sort(key=lambda item: item["device"])
    return ports


def read_control_action(output_dir: Path) -> str:
    path = output_dir / CONTROL_FILENAME
    if not path.exists():
        return ""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return str(payload.get("action") or "").strip().lower()


def write_control_action(output_dir: Path, action: str) -> None:
    path = output_dir / CONTROL_FILENAME
    path.write_text(
        json.dumps({"action": action}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_meta(output_dir: Path, payload: dict[str, Any]) -> None:
    path = output_dir / META_FILENAME
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_event(output_dir: Path, payload: dict[str, Any]) -> None:
    path = output_dir / EVENTS_FILENAME
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def connect_side(port: str) -> YetTemperatureMonitor:
    device = YetTemperatureMonitor(port)
    try:
        device.connect()
        return device
    except Exception:
        device.close()
        raise


def run_monitor(left_port: str, right_port: str, output_dir: Path) -> int:
    left_port = (left_port or "").strip()
    right_port = (right_port or "").strip()
    if not left_port and not right_port:
        emit({"event": "error", "message": "请先在设置中配置无感烘箱左侧或右侧设备"})
        return 1
    if left_port and right_port and left_port == right_port:
        emit({"event": "error", "message": "左右侧串口不能相同"})
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    write_control_action(output_dir, "")
    events_path = output_dir / EVENTS_FILENAME
    if not events_path.exists():
        events_path.write_text("", encoding="utf-8")

    left = None
    right = None
    started_at = utc_now()
    point_count = 0
    warnings: list[str] = []
    try:
        if left_port:
            try:
                left = connect_side(left_port)
            except Exception as error:
                warnings.append(f"左侧设备 {left_port} 连接失败: {error}")
        if right_port:
            try:
                right = connect_side(right_port)
            except Exception as error:
                warnings.append(f"右侧设备 {right_port} 连接失败: {error}")
        if not left and not right:
            emit({"event": "error", "message": "；".join(warnings) or "未连接任何无感烘箱设备"})
            return 1

        devices = [item for item in (left, right) if item]
        meta = {
            "started_at": iso_now(started_at),
            "left": left.metadata if left else None,
            "right": right.metadata if right else None,
            "warnings": warnings,
            "output_dir": str(output_dir),
            "events_path": str(events_path),
        }
        write_meta(output_dir, meta)
        emit(
            {
                "event": "ready",
                "left": left.metadata if left else None,
                "right": right.metadata if right else None,
                "warnings": warnings,
                "output_dir": str(output_dir),
            }
        )
        emit({"event": "status", "phase": "running"})

        paused = False
        last_action = ""
        while True:
            action = read_control_action(output_dir)
            if action and action != last_action:
                last_action = action
                if action == "pause" and not paused:
                    for device in devices:
                        device.pause_stream()
                    paused = True
                    emit({"event": "status", "phase": "paused"})
                    write_control_action(output_dir, "")
                elif action == "resume" and paused:
                    for device in devices:
                        device.resume_stream()
                    paused = False
                    emit({"event": "status", "phase": "running"})
                    write_control_action(output_dir, "")
                elif action == "stop":
                    break

            if not paused:
                moment = utc_now()
                for side, device in (("left", left), ("right", right)):
                    if not device:
                        continue
                    for temperature in device.drain_samples():
                        row = {
                            "event": "point",
                            "timestamp": iso_now(moment),
                            "timestamp_ms": int(moment.timestamp() * 1000),
                            "side": side,
                            "port": device.port,
                            "device_id": device.device_id,
                            "temperature": round(float(temperature), 3),
                        }
                        append_event(output_dir, row)
                        emit(row)
                        point_count += 1
                        moment = utc_now()
            time.sleep(0.02)

        emit({"event": "ended", "point_count": point_count})
        write_meta(
            output_dir,
            {
                **meta,
                "ended_at": iso_now(),
                "point_count": point_count,
            },
        )
        return 0
    except Exception as error:
        emit({"event": "error", "message": str(error)})
        return 1
    finally:
        if left:
            left.close()
        if right:
            right.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Sensorless oven dual YET serial monitor")
    parser.add_argument("--list-ports", action="store_true")
    parser.add_argument("--left-port")
    parser.add_argument("--right-port")
    parser.add_argument("--output-dir")
    args = parser.parse_args()

    if args.list_ports:
        emit({"ports": list_serial_ports()})
        return 0

    if not args.output_dir:
        emit({"event": "error", "message": "需要提供 --output-dir"})
        return 1

    return run_monitor(args.left_port or "", args.right_port or "", Path(args.output_dir))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
