import argparse
import csv
import io
import json
import math
import re
import shutil
import sys
from pathlib import Path

import av
import cv2
import numpy as np


TEMPLATE_TIMES = ("0.0", "3000.0")
SCHEMA_VERSION = 2

FIELDS = [
    {
        "id": "oil_tank_level",
        "part": "油箱",
        "data": "油位",
        "roi": [127, 193, 37, 25],
        "decimal_places": 0,
        "known": {"0.0": "175", "3000.0": "174"},
    },
    {
        "id": "oil_tank_oil_temp",
        "part": "油箱",
        "data": "油温",
        "roi": [324, 193, 37, 25],
        "decimal_places": 0,
        "known": {"0.0": "55", "3000.0": "50"},
    },
    {
        "id": "top_outlet_oil_temp",
        "part": "高位油箱",
        "data": "出口油温",
        "roi": [399, 193, 40, 26],
        "decimal_places": 0,
        "known": {"0.0": "59", "3000.0": "56"},
    },
    {
        "id": "vessel_250_upper_water_temp",
        "part": "250试验容器",
        "data": "上部水温",
        "roi": [857, 238, 47, 23],
        "decimal_places": 0,
        "known": {"0.0": "27", "3000.0": "27"},
    },
    {
        "id": "air_source_pressure",
        "part": "气源",
        "data": "压力",
        "roi": [1035, 252, 45, 22],
        "decimal_places": 2,
        "known": {"0.0": "0.56", "3000.0": "0.56"},
    },
    {
        "id": "vessel_250_upper_inlet_oil_temp",
        "part": "250试验容器",
        "data": "上进口油温",
        "roi": [781, 288, 46, 23],
        "decimal_places": 0,
        "known": {"0.0": "61", "3000.0": "58"},
    },
    {
        "id": "vessel_250_pressure",
        "part": "250试验容器",
        "data": "压力",
        "roi": [922, 332, 47, 21],
        "decimal_places": 1,
        "known": {"0.0": "0.0", "3000.0": "0.0"},
    },
    {
        "id": "low_pressure_pump_outlet_pressure",
        "part": "低压泵",
        "data": "出口压力",
        "roi": [1167, 343, 45, 24],
        "decimal_places": 0,
        "known": {"0.0": "00", "3000.0": "00"},
    },
    {
        "id": "cooling_tank_outlet_water_temp",
        "part": "冷却水箱",
        "data": "出口水温",
        "roi": [495, 344, 35, 23],
        "decimal_places": 0,
        "known": {"0.0": "23", "3000.0": "28"},
    },
    {
        "id": "cooler_outlet_oil_temp",
        "part": "冷却器",
        "data": "出口油温",
        "roi": [581, 344, 47, 23],
        "decimal_places": 0,
        "known": {"0.0": "42", "3000.0": "45"},
    },
    {
        "id": "cooling_tank_water_temp",
        "part": "冷却水箱",
        "data": "水温",
        "roi": [341, 354, 37, 23],
        "decimal_places": 0,
        "known": {"0.0": "12", "3000.0": "12"},
    },
    {
        "id": "cooling_tank_inlet_water_temp",
        "part": "冷却水箱",
        "data": "进口水温",
        "roi": [390, 454, 42, 24],
        "decimal_places": 0,
        "known": {"0.0": "9999", "3000.0": "9999"},
    },
    {
        "id": "vessel_250_lower_inlet_oil_temp",
        "part": "250试验容器",
        "data": "下进口油温",
        "roi": [786, 510, 47, 23],
        "decimal_places": 0,
        "known": {"0.0": "42", "3000.0": "45"},
    },
    {
        "id": "oil_gas_separator_inlet_oil_temp",
        "part": "油气分离器",
        "data": "进口油温",
        "roi": [249, 513, 46, 23],
        "decimal_places": 0,
        "known": {"0.0": "106", "3000.0": "102"},
    },
    {
        "id": "vessel_250_lower_water_temp",
        "part": "250试验容器",
        "data": "下部水温",
        "roi": [857, 530, 45, 24],
        "decimal_places": 0,
        "known": {"0.0": "76", "3000.0": "71"},
    },
    {
        "id": "oil_gas_separator_outlet_oil_temp",
        "part": "油气分离器",
        "data": "出口油温",
        "roi": [250, 544, 46, 23],
        "decimal_places": 0,
        "known": {"0.0": "103", "3000.0": "99"},
    },
    {
        "id": "vessel_480_upper_water_temp",
        "part": "480试验容器",
        "data": "上部水温",
        "roi": [857, 556, 45, 23],
        "decimal_places": 0,
        "known": {"0.0": "25", "3000.0": "25"},
    },
    {
        "id": "high_pressure_pump_outlet_pressure",
        "part": "高压泵",
        "data": "出口压力",
        "roi": [1176, 567, 46, 24],
        "decimal_places": 1,
        "known": {"0.0": "0.1", "3000.0": "0.4"},
    },
    {
        "id": "vessel_480_upper_inlet_oil_temp",
        "part": "480试验容器",
        "data": "上进口油温",
        "roi": [786, 579, 46, 23],
        "decimal_places": 0,
        "known": {"0.0": "16", "3000.0": "16"},
    },
    {
        "id": "vessel_480_upper_outlet_oil_temp",
        "part": "480试验容器",
        "data": "上出口油温",
        "roi": [790, 773, 46, 23],
        "decimal_places": 0,
        "known": {"0.0": "13", "3000.0": "13"},
    },
    {
        "id": "cylinder_pressure",
        "part": "筒内",
        "data": "压力",
        "roi": [928, 816, 47, 21],
        "decimal_places": 1,
        "known": {"0.0": "0.5", "3000.0": "0.4"},
    },
    {
        "id": "vessel_480_lower_water_temp",
        "part": "480试验容器",
        "data": "下部水温",
        "roi": [862, 889, 45, 23],
        "decimal_places": 0,
        "known": {"0.0": "26", "3000.0": "26"},
    },
    {
        "id": "high_temp_chamber_room_temp",
        "part": "高温室",
        "data": "室温",
        "roi": [379, 894, 38, 23],
        "decimal_places": 0,
        "known": {"0.0": "19", "3000.0": "19"},
    },
]

MIN_SCREEN_FIELD_COUNT = 6
LEGACY_FIELD_ALIASES = {
    "vessel_250_unlabeled_yellow_value": "vessel_250_pressure",
    "vessel_480_upper_water_temp": "vessel_250_lower_water_temp",
    "vessel_480_stacked_value_25": "vessel_480_upper_water_temp",
}


def emit_event(event, **payload):
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)
    sys.stdout.flush()


def bgr_from_frame(frame):
    return frame.to_ndarray(format="bgr24")


def nearest_frame(video_path, target_sec):
    best = None
    with av.open(str(video_path)) as container:
        stream = container.streams.video[0]
        if target_sec > 0:
            container.seek(int(max(0, target_sec - 2) / stream.time_base), any_frame=False, stream=stream)
        for frame in container.decode(stream):
            frame_time = float(frame.time or 0.0)
            if best is None or abs(frame_time - target_sec) < abs(best[0] - target_sec):
                best = (frame_time, bgr_from_frame(frame))
            if frame_time >= target_sec + 0.5:
                break
    if best is None:
        raise RuntimeError(f"No frame decoded near {target_sec}s")
    return best


def digit_components(crop):
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    inner = gray[2:-2, 2:-2]
    mask = (inner < 80).astype("uint8")
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    components = []
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        if area >= 2 and h >= 3 and w >= 1:
            component = ((labels == i).astype("uint8") * 255)[y : y + h, x : x + w]
            components.append((x + 2, component))
    return [component for _, component in sorted(components, key=lambda item: item[0])]


def normalize_component(component):
    height, width = component.shape
    scale = min(12 / width, 18 / height)
    new_width = max(1, int(round(width * scale)))
    new_height = max(1, int(round(height * scale)))
    resized = cv2.resize(component, (new_width, new_height), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((18, 12), dtype="uint8")
    left = (12 - new_width) // 2
    top = (18 - new_height) // 2
    canvas[top : top + new_height, left : left + new_width] = resized
    return canvas > 0


def digits_only(text):
    return re.sub(r"[^0-9]", "", text)


def field_by_id():
    return {field["id"]: field for field in FIELDS}


def discover_fields(video_path):
    template_images = []
    for target_text in TEMPLATE_TIMES:
        _, image = nearest_frame(video_path, float(target_text))
        template_images.append(image)

    active_fields = [
        field
        for field in FIELDS
        if all(field_background_ok(image, field) for image in template_images)
    ]
    if len(active_fields) < MIN_SCREEN_FIELD_COUNT:
        return FIELDS, template_images
    return active_fields, template_images


def build_templates(fields, template_images):
    templates = {}
    for target_text, image in zip(TEMPLATE_TIMES, template_images):
        for field in fields:
            expected_digits = digits_only(field["known"][target_text])
            x, y, w, h = field["roi"]
            components = digit_components(image[y : y + h, x : x + w])
            if len(components) != len(expected_digits):
                raise RuntimeError(
                    f"Template count mismatch for {field['id']} at {target_text}s: "
                    f"expected {expected_digits}, got {len(components)} components"
                )
            for char, component in zip(expected_digits, components):
                templates.setdefault(char, []).append(normalize_component(component))
    return templates


def classify_digit(component, templates):
    normalized = normalize_component(component)
    best_char = None
    best_score = -1.0
    for char, candidates in templates.items():
        for template in candidates:
            intersection = np.logical_and(normalized, template).sum()
            union = np.logical_or(normalized, template).sum()
            score = float(intersection / union) if union else 0.0
            if score > best_score:
                best_char = char
                best_score = score
    return best_char, best_score


def apply_decimal(digits, decimal_places):
    if not digits:
        return ""
    if decimal_places <= 0:
        return digits
    if len(digits) <= decimal_places:
        digits = "0" * (decimal_places + 1 - len(digits)) + digits
    return f"{digits[:-decimal_places]}.{digits[-decimal_places:]}"


def parse_value(text):
    if not text:
        return None
    if "." in text:
        return float(text)
    return int(text)


def read_field(image, field, templates):
    x, y, w, h = field["roi"]
    components = digit_components(image[y : y + h, x : x + w])
    chars = []
    scores = []
    for component in components:
        char, score = classify_digit(component, templates)
        chars.append(char)
        scores.append(score)
    raw_text = apply_decimal("".join(chars), field["decimal_places"])
    return {
        "id": field["id"],
        "part": field["part"],
        "data": field["data"],
        "raw": raw_text,
        "value": parse_value(raw_text),
        "confidence": round(min(scores), 3) if scores else 0.0,
    }


def expected_background(field):
    if "yellow" in field["id"] or "pressure" in field["id"]:
        return "yellow"
    return "cyan"


def field_background_ok(image, field):
    x, y, w, h = field["roi"]
    crop = image[y + 3 : y + h - 3, x + 3 : x + w - 3]
    blue, green, red = np.median(crop.reshape(-1, 3), axis=0)
    if expected_background(field) == "yellow":
        return blue < 40 and green > 220 and red > 220
    return blue > 220 and green > 150 and red < 60


def screen_detected(image, fields):
    ok_count = sum(1 for field in fields if field_background_ok(image, field))
    threshold = max(MIN_SCREEN_FIELD_COUNT, math.ceil(len(fields) * 0.75))
    return ok_count >= threshold


def null_field(field):
    return {
        "id": field["id"],
        "part": field["part"],
        "data": field["data"],
        "raw": None,
        "value": None,
        "confidence": None,
    }


def video_duration_seconds(video_path):
    with av.open(str(video_path)) as container:
        if container.duration:
            return float(container.duration / av.time_base)
        stream = container.streams.video[0]
        return float(stream.duration * stream.time_base)


def read_json_file(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def has_legacy_field_ids(records):
    legacy_markers = {"vessel_250_unlabeled_yellow_value", "vessel_480_stacked_value_25"}
    for record in records:
        if not isinstance(record, dict):
            continue
        for item in record.get("measurements", []):
            if isinstance(item, dict) and item.get("id") in legacy_markers:
                return True
    return False


def migrate_measurement(item, legacy_schema, field_lookup):
    if not isinstance(item, dict):
        return item
    migrated = dict(item)
    item_id = migrated.get("id")
    if legacy_schema and item_id in LEGACY_FIELD_ALIASES:
        migrated["id"] = LEGACY_FIELD_ALIASES[item_id]

    field = field_lookup.get(migrated.get("id"))
    if field:
        migrated["part"] = field["part"]
        migrated["data"] = field["data"]
    return migrated


def migrate_records(records, schema_version):
    if schema_version == SCHEMA_VERSION:
        return records
    legacy_schema = has_legacy_field_ids(records)
    field_lookup = field_by_id()
    migrated_records = []
    for record in records:
        if not isinstance(record, dict):
            migrated_records.append(record)
            continue
        migrated_record = dict(record)
        measurements = record.get("measurements", [])
        if isinstance(measurements, list):
            migrated_record["measurements"] = [
                migrate_measurement(item, legacy_schema, field_lookup)
                for item in measurements
            ]
        migrated_records.append(migrated_record)
    return migrated_records


def load_existing_records(output_dir):
    payload = read_json_file(output_dir / "video_readings_0.5s.json", {})
    records = payload.get("records")
    if not isinstance(records, list):
        return []
    return migrate_records(records, payload.get("schema_version"))


def clear_output(output_dir):
    for file_name in [
        "video_readings_0.5s.json",
        "video_readings.csv",
        "experiment_summary.json",
        "capture_progress.json",
        "latest_frame.jpg",
    ]:
        path = output_dir / file_name
        if path.exists():
            path.unlink()
    frames_dir = output_dir / "sample_frames"
    if frames_dir.exists():
        shutil.rmtree(frames_dir)


def output_field_metadata(fields):
    return [
        {
            "id": field["id"],
            "part": field["part"],
            "data": field["data"],
        }
        for field in fields
    ]


def build_summary(source_video, interval, duration, records, fields):
    latest = records[-1] if records else None
    return {
        "schema_version": SCHEMA_VERSION,
        "source_video": str(source_video),
        "sample_interval_seconds": interval,
        "duration_seconds": round(duration, 3),
        "field_count": len(fields),
        "fields": output_field_metadata(fields),
        "record_count": len(records),
        "screen_detected_count": sum(1 for record in records if record.get("screen_detected")),
        "latest_time_sec": latest.get("time_sec") if latest else 0,
        "latest_measurements": latest.get("measurements") if latest else [],
    }


def build_csv(records, fields):
    output = io.StringIO()
    field_ids = [field["id"] for field in fields]
    writer = csv.writer(output)
    writer.writerow(["time_sec", "frame_time_sec", "screen_detected", *field_ids])
    for record in records:
        value_map = {
            item.get("id"): item.get("value")
            for item in record.get("measurements", [])
            if isinstance(item, dict)
        }
        writer.writerow(
            [
                record.get("time_sec", ""),
                record.get("frame_time_sec", ""),
                1 if record.get("screen_detected") else 0,
                *[value_map.get(field_id, "") for field_id in field_ids],
            ]
        )
    return output.getvalue()


def write_outputs(output_dir, source_video, interval, duration, records, fields):
    json_path = output_dir / "video_readings_0.5s.json"
    summary_path = output_dir / "experiment_summary.json"
    csv_path = output_dir / "video_readings.csv"
    payload = {
        "schema_version": SCHEMA_VERSION,
        "source_video": str(source_video),
        "sample_interval_seconds": interval,
        "duration_seconds": round(duration, 3),
        "frame_selection": "nearest decoded video frame to each sample timestamp",
        "field_count": len(fields),
        "fields": output_field_metadata(fields),
        "record_count": len(records),
        "records": records,
    }
    summary = build_summary(source_video, interval, duration, records, fields)
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    csv_path.write_text(build_csv(records, fields), encoding="utf-8")
    return json_path, summary_path, csv_path, summary


def write_progress(output_dir, payload):
    progress_path = output_dir / "capture_progress.json"
    progress_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_latest_frame(output_dir, image):
    preview_path = output_dir / "latest_frame.jpg"
    cv2.imwrite(str(preview_path), image, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    return preview_path


def extract(video_path, output_dir, interval, event_callback=None, resume=False):
    output_dir.mkdir(parents=True, exist_ok=True)
    if not resume:
        clear_output(output_dir)

    safe_interval = max(0.1, float(interval))
    duration = video_duration_seconds(video_path)
    total_targets = max(1, int(math.floor(duration / safe_interval)) + 1)
    records = load_existing_records(output_dir) if resume else []
    target_index = len(records)

    if event_callback:
        event_callback(
            "status",
            phase="bootstrap",
            message="正在从视频模板帧识别有效字段",
        )
    fields, template_images = discover_fields(video_path)
    if event_callback:
        event_callback(
            "status",
            phase="bootstrap",
            message=f"已从视频画面识别 {len(fields)} 个有效字段，正在构建数字模板",
            field_count=len(fields),
            fields=output_field_metadata(fields),
        )
    templates = build_templates(FIELDS, template_images)
    if event_callback:
        event_callback(
            "start",
            source_video=str(video_path),
            duration_seconds=round(duration, 3),
            interval=safe_interval,
            total_targets=total_targets,
            current=target_index,
            resume=resume,
        )

    write_progress(
        output_dir,
        {
            "schema_version": SCHEMA_VERSION,
            "source_video": str(video_path),
            "duration_seconds": round(duration, 3),
            "interval": safe_interval,
            "total_targets": total_targets,
            "current": target_index,
            "progress_pct": round((target_index / total_targets) * 100) if total_targets else 0,
            "latest_time_sec": records[-1]["time_sec"] if records else 0,
            "latest_frame": str(output_dir / "latest_frame.jpg") if records else "",
            "complete": False,
            "paused": False,
            "record_count": len(records),
            "output_dir": str(output_dir),
        },
    )

    previous = None
    with av.open(str(video_path)) as container:
        stream = container.streams.video[0]
        if target_index > 0:
            resume_sec = max(0.0, target_index * safe_interval - 1.0)
            container.seek(int(resume_sec / stream.time_base), any_frame=False, stream=stream)
        for frame in container.decode(stream):
            current = (float(frame.time or 0.0), bgr_from_frame(frame))
            while target_index < total_targets:
                target = round(target_index * safe_interval, 3)
                if target > current[0] and not math.isclose(target, current[0], abs_tol=1e-9):
                    break

                chosen = current
                if previous is not None and abs(previous[0] - target) < abs(current[0] - target):
                    chosen = previous

                has_screen = screen_detected(chosen[1], fields)
                measurements = [read_field(chosen[1], field, templates) for field in fields] if has_screen else [null_field(field) for field in fields]
                preview_path = write_latest_frame(output_dir, chosen[1])
                record = {
                    "time_sec": target,
                    "frame_time_sec": round(chosen[0], 3),
                    "screen_detected": has_screen,
                    "measurements": measurements,
                }
                records.append(record)
                current_count = target_index + 1
                progress_pct = round((current_count / total_targets) * 100) if total_targets else 100

                if current_count % 10 == 0:
                    write_outputs(output_dir, video_path, safe_interval, duration, records, fields)

                if event_callback:
                    event_callback(
                        "sample",
                        current=current_count,
                        total=total_targets,
                        progress_pct=progress_pct,
                        record=record,
                        preview_path=str(preview_path),
                    )

                write_progress(
                    output_dir,
                    {
                        "schema_version": SCHEMA_VERSION,
                        "source_video": str(video_path),
                        "duration_seconds": round(duration, 3),
                        "interval": safe_interval,
                        "total_targets": total_targets,
                        "current": current_count,
                        "progress_pct": progress_pct,
                        "latest_time_sec": target,
                        "latest_frame": str(preview_path),
                        "complete": False,
                        "paused": False,
                        "record_count": len(records),
                        "output_dir": str(output_dir),
                    },
                )
                target_index += 1
            previous = current

    json_path, summary_path, csv_path, summary = write_outputs(
        output_dir,
        video_path,
        safe_interval,
        duration,
        records,
        fields,
    )
    latest_frame = output_dir / "latest_frame.jpg"
    write_progress(
        output_dir,
        {
            "schema_version": SCHEMA_VERSION,
            "source_video": str(video_path),
            "duration_seconds": round(duration, 3),
            "interval": safe_interval,
            "total_targets": total_targets,
            "current": len(records),
            "progress_pct": 100,
            "latest_time_sec": records[-1]["time_sec"] if records else 0,
            "latest_frame": str(latest_frame) if latest_frame.exists() else "",
            "complete": True,
            "paused": False,
            "record_count": len(records),
            "output_dir": str(output_dir),
            "json_path": str(json_path),
            "summary_path": str(summary_path),
            "csv_path": str(csv_path),
        },
    )

    if event_callback:
        event_callback(
            "complete",
            output_dir=str(output_dir),
            json_path=str(json_path),
            summary_path=str(summary_path),
            csv_path=str(csv_path),
            latest_frame=str(latest_frame) if latest_frame.exists() else "",
            summary=summary,
            record_count=len(records),
        )
    return json_path, summary_path, csv_path, len(records)


def main():
    parser = argparse.ArgumentParser(description="Extract high-temperature high-pressure readings from a recorded WMV video.")
    parser.add_argument("--video", required=True)
    parser.add_argument("--output-dir", default="high_temp_pressure_video_output")
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--emit-events", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    output_dir = Path(args.output_dir).resolve()
    callback = emit_event if args.emit_events else None
    try:
        json_path, summary_path, csv_path, count = extract(
            video_path,
            output_dir,
            args.interval,
            event_callback=callback,
            resume=args.resume,
        )
        if not args.emit_events:
            print(f"Wrote {count} records to {json_path}")
            print(f"Wrote summary to {summary_path}")
            print(f"Wrote CSV to {csv_path}")
    except Exception as exc:
        if args.emit_events:
            emit_event("error", message=str(exc))
        raise


if __name__ == "__main__":
    main()
