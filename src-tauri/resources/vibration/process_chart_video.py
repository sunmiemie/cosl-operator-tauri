import argparse
import json
import math
import re
import shutil
import sys
from pathlib import Path

import av
import cv2
import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    Image = None
    ImageDraw = None
    ImageFont = None


DEFAULT_VIDEO = ""
CHART_ROI = [74, 229, 1364, 591]
REFERENCE_FRAME_SIZE = (553, 245)
CHART_REFERENCE_SIZE = (1364, 591)
READING_FIELDS = [
    {"id": "target", "label": "目标", "unit": "g rms", "roi": [36, 162, 151, 54]},
    {"id": "level", "label": "量级", "unit": "dB", "roi": [198, 162, 149, 54]},
    {"id": "response", "label": "响应", "unit": "g rms", "roi": [360, 162, 149, 54]},
]
CHART_LEGEND_FIELDS = [
    {"id": "response", "label": "响应", "unit": "g rms", "roi": [1024, 80, 68, 16]},
    {"id": "target", "label": "目标", "unit": "g rms", "roi": [1024, 116, 68, 16]},
]
TEMPLATE_CHARS = "0123456789."
TEMPLATE_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\tahoma.ttf",
]
_CHAR_TEMPLATES = None
SEGMENT_DIGITS = {
    (1, 1, 1, 1, 1, 1, 0): "0",
    (0, 0, 1, 0, 0, 1, 0): "1",
    (1, 0, 1, 1, 1, 0, 1): "2",
    (1, 0, 1, 1, 0, 1, 1): "3",
    (0, 1, 1, 0, 0, 1, 1): "4",
    (1, 1, 0, 1, 0, 1, 1): "5",
    (1, 1, 0, 1, 1, 1, 1): "6",
    (1, 0, 1, 0, 0, 1, 0): "7",
    (1, 1, 1, 1, 1, 1, 1): "8",
    (1, 1, 1, 1, 0, 1, 1): "9",
}


def emit_event(event, **payload):
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)
    sys.stdout.flush()


def bgr_from_frame(frame):
    return frame.to_ndarray(format="bgr24")


def format_clock(total_seconds):
    total_seconds = max(0, int(total_seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours}:{minutes:02d}:{seconds:02d}"


def empty_values(target_sec, duration_sec):
    remaining = max(0.0, duration_sec - target_sec)
    return {
        "target": {"label": "目标", "raw": "", "value": None, "unit": "g rms", "confidence": 0.0},
        "level": {"label": "截图状态", "raw": "", "value": None, "unit": "", "confidence": 1.0},
        "response": {"label": "响应", "raw": "", "value": None, "unit": "g rms", "confidence": 0.0},
        "drive": {"label": "输出目录", "raw": "", "value": None, "unit": "", "confidence": 1.0},
        "elapsed_time": {
            "label": "试验历经时间",
            "raw": format_clock(target_sec),
            "value": target_sec,
            "unit": "h:mm:ss",
            "confidence": 1.0,
        },
        "remaining_time": {
            "label": "剩余时间",
            "raw": format_clock(remaining),
            "value": remaining,
            "unit": "h:mm:ss",
            "confidence": 1.0,
        },
    }


def scaled_roi(image, roi):
    return scaled_roi_for_size(image, roi, REFERENCE_FRAME_SIZE)


def scaled_roi_for_size(image, roi, reference_size):
    ref_w, ref_h = REFERENCE_FRAME_SIZE
    if reference_size:
        ref_w, ref_h = reference_size
    h, w = image.shape[:2]
    sx = w / ref_w
    sy = h / ref_h
    x, y, rw, rh = roi
    x1 = max(0, min(int(round(x * sx)), w - 1))
    y1 = max(0, min(int(round(y * sy)), h - 1))
    x2 = max(x1 + 1, min(int(round((x + rw) * sx)), w))
    y2 = max(y1 + 1, min(int(round((y + rh) * sy)), h))
    return x1, y1, x2 - x1, y2 - y1


def crop_roi(image, roi, reference_size):
    x, y, w, h = scaled_roi_for_size(image, roi, reference_size)
    return image[y : y + h, x : x + w]


def green_digit_mask(crop):
    b, g, r = cv2.split(crop)
    mask = (g > 90) & (g > r * 1.25) & (g > b * 1.15)
    mask = mask.astype("uint8") * 255
    kernel = np.ones((2, 2), dtype="uint8")
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)


def character_groups(mask):
    columns = np.where(mask.any(axis=0))[0]
    if columns.size == 0:
        return []

    groups = []
    start = int(columns[0])
    prev = int(columns[0])
    max_gap = max(1, int(round(mask.shape[1] * 0.015)))
    for col in columns[1:]:
        col = int(col)
        if col - prev > max_gap:
            groups.append((start, prev))
            start = col
        prev = col
    groups.append((start, prev))
    return groups


def segment_on(char_mask, y1, y2, x1, x2):
    h, w = char_mask.shape[:2]
    yy1 = max(0, min(int(round(y1 * h)), h - 1))
    yy2 = max(yy1 + 1, min(int(round(y2 * h)), h))
    xx1 = max(0, min(int(round(x1 * w)), w - 1))
    xx2 = max(xx1 + 1, min(int(round(x2 * w)), w))
    region = char_mask[yy1:yy2, xx1:xx2]
    return 1 if (np.count_nonzero(region) / max(1, region.size)) > 0.16 else 0


def classify_seven_segment(char_mask):
    rows = np.where(char_mask.any(axis=1))[0]
    cols = np.where(char_mask.any(axis=0))[0]
    if rows.size == 0 or cols.size == 0:
        return "", 0.0

    tight = char_mask[int(rows[0]) : int(rows[-1]) + 1, int(cols[0]) : int(cols[-1]) + 1]
    if tight.shape[0] <= 4 and tight.shape[1] <= 6:
        return ".", 1.0

    segments = (
        segment_on(tight, 0.00, 0.22, 0.18, 0.82),
        segment_on(tight, 0.12, 0.50, 0.00, 0.38),
        segment_on(tight, 0.12, 0.50, 0.62, 1.00),
        segment_on(tight, 0.78, 1.00, 0.18, 0.82),
        segment_on(tight, 0.50, 0.88, 0.00, 0.38),
        segment_on(tight, 0.50, 0.88, 0.62, 1.00),
        segment_on(tight, 0.39, 0.61, 0.18, 0.82),
    )
    if segments in SEGMENT_DIGITS:
        return SEGMENT_DIGITS[segments], 1.0

    best_digit = ""
    best_score = -1
    for pattern, digit in SEGMENT_DIGITS.items():
        score = sum(1 for a, b in zip(segments, pattern) if a == b)
        if score > best_score:
            best_digit = digit
            best_score = score
    return best_digit, best_score / 7


def read_numeric_field(image, field):
    crop = crop_roi(image, field["roi"], REFERENCE_FRAME_SIZE)
    if crop.size == 0:
        return {"raw": "", "value": None, "confidence": 0.0}

    mask = green_digit_mask(crop)
    chars = []
    scores = []
    for x1, x2 in character_groups(mask):
        char_mask = mask[:, x1 : x2 + 1] > 0
        char, score = classify_seven_segment(char_mask)
        if char:
            chars.append(char)
            scores.append(score)

    raw = "".join(chars)
    raw = re.sub(r"(?<=\.)\.", "", raw)
    if raw.count(".") > 1:
        first = raw.find(".")
        raw = raw[: first + 1] + raw[first + 1 :].replace(".", "")
    if raw.startswith("."):
        raw = f"0{raw}"

    value = None
    if raw and raw not in {".", "-"}:
        try:
            value = float(raw)
        except ValueError:
            value = None

    return {
        "raw": raw,
        "value": value,
        "confidence": round(min(scores), 3) if scores else 0.0,
    }


def dark_digit_mask(crop):
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    mask = (gray < 145).astype("uint8") * 255
    kernel = np.ones((1, 1), dtype="uint8")
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)


def normalize_mask(mask, size=(12, 18)):
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    if rows.size == 0 or cols.size == 0:
        return None
    tight = mask[int(rows[0]) : int(rows[-1]) + 1, int(cols[0]) : int(cols[-1]) + 1]
    resized = cv2.resize(tight.astype("uint8") * 255, size, interpolation=cv2.INTER_AREA)
    return resized > 80


def render_char_template(char, font_path, size):
    if Image is None or ImageDraw is None or ImageFont is None:
        return None
    try:
        font = ImageFont.truetype(font_path, size)
    except Exception:
        return None
    canvas = Image.new("L", (24, 24), 255)
    draw = ImageDraw.Draw(canvas)
    draw.text((1, -1), char, font=font, fill=0)
    mask = np.array(canvas) < 180
    return normalize_mask(mask)


def get_char_templates():
    global _CHAR_TEMPLATES
    if _CHAR_TEMPLATES is not None:
        return _CHAR_TEMPLATES

    templates = {}
    for font_path in TEMPLATE_FONT_CANDIDATES:
        for size in range(8, 15):
            for char in TEMPLATE_CHARS:
                template = render_char_template(char, font_path, size)
                if template is not None:
                    templates.setdefault(char, []).append(template)
    _CHAR_TEMPLATES = templates
    return templates


def classify_template_char(char_mask):
    normalized = normalize_mask(char_mask)
    if normalized is None:
        return "", 0.0

    best_char = ""
    best_score = -1.0
    for char, templates in get_char_templates().items():
        for template in templates:
            score = float((normalized == template).mean())
            if score > best_score:
                best_char = char
                best_score = score
    return best_char, best_score


def read_template_numeric_field(image, field):
    crop = crop_roi(image, field["roi"], CHART_REFERENCE_SIZE)
    if crop.size == 0:
        return {"raw": "", "value": None, "confidence": 0.0}

    mask = dark_digit_mask(crop)
    chars = []
    scores = []
    for x1, x2 in character_groups(mask):
        char_mask = mask[:, x1 : x2 + 1] > 0
        if np.count_nonzero(char_mask) < 3:
            continue
        char, score = classify_template_char(char_mask)
        if char and score >= 0.55:
            chars.append(char)
            scores.append(score)

    raw = "".join(chars)
    if raw.count(".") > 1:
        first = raw.find(".")
        raw = raw[: first + 1] + raw[first + 1 :].replace(".", "")
    if raw.startswith("."):
        raw = f"0{raw}"

    value = None
    if raw and raw not in {".", "-"}:
        try:
            value = float(raw)
        except ValueError:
            value = None

    return {
        "raw": raw,
        "value": value,
        "confidence": round(min(scores), 3) if scores else 0.0,
    }


def read_vibration_values(image, target_sec, duration_sec):
    values = empty_values(target_sec, duration_sec)
    for field in READING_FIELDS:
        reading = read_numeric_field(image, field)
        values[field["id"]] = {
            "label": field["label"],
            "raw": reading["raw"],
            "value": reading["value"],
            "unit": field["unit"],
            "confidence": reading["confidence"],
        }
    h, w = image.shape[:2]
    chart_image = image if (w, h) == CHART_REFERENCE_SIZE else chart_crop(image)
    for field in CHART_LEGEND_FIELDS:
        current = values.get(field["id"]) or {}
        if current.get("raw"):
            continue
        reading = read_template_numeric_field(chart_image, field)
        values[field["id"]] = {
            "label": field["label"],
            "raw": reading["raw"],
            "value": reading["value"],
            "unit": field["unit"],
            "confidence": reading["confidence"],
        }
    return values


def video_duration_seconds(video_path):
    with av.open(str(video_path)) as container:
        if container.duration:
            return float(container.duration / av.time_base)
        stream = container.streams.video[0]
        if stream.duration is None:
            return 0.0
        return float(stream.duration * stream.time_base)


def chart_crop(image):
    x, y, width, height = CHART_ROI
    if width <= 0 or height <= 0:
        return image
    h, w = image.shape[:2]
    x1 = max(0, min(x, w))
    y1 = max(0, min(y, h))
    x2 = max(x1, min(x + width, w))
    y2 = max(y1, min(y + height, h))
    cropped = image[y1:y2, x1:x2]
    return cropped if cropped.size else image


def clear_output(output_dir):
    json_path = output_dir / "top_readings_0.5s.json"
    summary_path = output_dir / "experiment_summary.json"
    csv_path = output_dir / "experiment_data.csv"
    progress_path = output_dir / "capture_progress.json"
    screenshots_dir = output_dir / "chart_screenshots"
    for path in [json_path, summary_path, csv_path, progress_path]:
        if path.exists():
            path.unlink()
    if screenshots_dir.exists():
        shutil.rmtree(screenshots_dir)


def write_progress(output_dir, payload):
    progress_path = output_dir / "capture_progress.json"
    progress_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json_file(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def load_existing_records(output_dir):
    payload = read_json_file(output_dir / "top_readings_0.5s.json", {})
    records = payload.get("records")
    return records if isinstance(records, list) else []


def write_snapshot(output_dir, source_video, interval, duration, records, screenshot_dir):
    payload = {
        "source_video": str(source_video),
        "sample_interval_seconds": interval,
        "duration_seconds": round(duration, 3),
        "frame_selection": "nearest decoded video frame to each sample timestamp",
        "chart_roi_xywh": CHART_ROI,
        "record_count": len(records),
        "records": records,
    }
    json_path = output_dir / "top_readings_0.5s.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = build_summary(records, source_video, interval, duration, screenshot_dir)
    summary_path = output_dir / "experiment_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = output_dir / "experiment_data.csv"
    csv_path.write_text(build_csv(records), encoding="utf-8")
    return json_path, summary_path, csv_path, summary


def build_summary(records, source_video, interval, duration_seconds, screenshot_dir):
    response_values = [
        float(((record.get("values") or {}).get("response") or {}).get("value"))
        for record in records
        if ((record.get("values") or {}).get("response") or {}).get("value") is not None
    ]
    return {
        "source_video": str(source_video),
        "sample_interval_seconds": interval,
        "duration_seconds": round(duration_seconds, 3),
        "record_count": len(records),
        "screen_detected_count": len(records),
        "avg_response": round(sum(response_values) / len(response_values), 4) if response_values else 0,
        "max_drive": 0,
        "last_elapsed_time": records[-1]["values"]["elapsed_time"]["raw"] if records else "0:00:00",
        "screenshot_dir": str(screenshot_dir),
    }


def build_csv(records):
    header = ["time_sec", "frame_time_sec", "target", "response", "level", "chart_screenshot", "elapsed_time", "remaining_time"]
    rows = [",".join(header)]
    for record in records:
        values = record.get("values") or {}
        rows.append(
            ",".join(
                [
                    str(record.get("time_sec", "")),
                    str(record.get("frame_time_sec", "")),
                    str(((values.get("target") or {}).get("raw")) or ""),
                    str(((values.get("response") or {}).get("raw")) or ""),
                    str(((values.get("level") or {}).get("raw")) or ""),
                    str(record.get("chart_screenshot", "")),
                    str(((values.get("elapsed_time") or {}).get("raw")) or ""),
                    str(((values.get("remaining_time") or {}).get("raw")) or ""),
                ]
            )
        )
    return "\n".join(rows) + "\n"


def extract(video_path, output_dir, interval, event_callback=None, resume=False):
    output_dir.mkdir(parents=True, exist_ok=True)
    if not resume:
        clear_output(output_dir)
    screenshots_dir = output_dir / "chart_screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    duration = max(0.0, video_duration_seconds(video_path))
    safe_interval = max(0.1, float(interval))
    total_targets = max(1, int(math.floor(duration / safe_interval)) + 1)
    records = load_existing_records(output_dir) if resume else []
    target_index = len(records)

    if event_callback:
        event_callback("status", phase="bootstrap", message="正在初始化截图采集" if not resume else "正在恢复截图采集")
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
            "source_video": str(video_path),
            "duration_seconds": round(duration, 3),
            "interval": safe_interval,
            "total_targets": total_targets,
            "current": target_index,
            "progress_pct": round((target_index / total_targets) * 100) if total_targets else 0,
            "latest_screenshot": str(output_dir / records[-1]["chart_screenshot"]) if records else "",
            "latest_time_sec": records[-1]["time_sec"] if records else 0,
            "complete": False,
            "paused": False,
            "record_count": len(records),
            "screenshot_dir": str(screenshots_dir),
        },
    )
    previous = None

    with av.open(str(video_path)) as container:
        stream = container.streams.video[0]
        if target_index > 0:
            resume_sec = max(0.0, (target_index * safe_interval) - 1.0)
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

                screenshot_name = f"capture_{target_index + 1:05d}_{int(round(target * 1000)):09d}ms.jpg"
                screenshot_path = screenshots_dir / screenshot_name
                cv2.imwrite(str(screenshot_path), chart_crop(chosen[1]), [int(cv2.IMWRITE_JPEG_QUALITY), 90])

                record = {
                    "time_sec": target,
                    "frame_time_sec": round(chosen[0], 3),
                    "screen_detected": True,
                    "chart_screenshot": str(Path("chart_screenshots") / screenshot_name).replace("\\", "/"),
                    "values": read_vibration_values(chosen[1], target, duration),
                }
                records.append(record)
                json_path, summary_path, csv_path, summary = write_snapshot(
                    output_dir,
                    video_path,
                    safe_interval,
                    duration,
                    records,
                    screenshots_dir,
                )

                if event_callback:
                    event_callback(
                        "sample",
                        current=target_index + 1,
                        total=total_targets,
                        progress_pct=round(((target_index + 1) / total_targets) * 100),
                        record=record,
                    )
                write_progress(
                    output_dir,
                    {
                        "source_video": str(video_path),
                        "duration_seconds": round(duration, 3),
                        "interval": safe_interval,
                        "total_targets": total_targets,
                        "current": target_index + 1,
                        "progress_pct": round(((target_index + 1) / total_targets) * 100),
                        "latest_screenshot": str(screenshot_path),
                        "latest_time_sec": target,
                        "complete": False,
                        "paused": False,
                        "record_count": len(records),
                        "screenshot_dir": str(screenshots_dir),
                        "latest_record": record,
                    },
                )

                target_index += 1
            previous = current

    json_path, summary_path, csv_path, summary = write_snapshot(
        output_dir,
        video_path,
        safe_interval,
        duration,
        records,
        screenshots_dir,
    )
    write_progress(
        output_dir,
        {
            "source_video": str(video_path),
            "duration_seconds": round(duration, 3),
            "interval": safe_interval,
            "total_targets": total_targets,
            "current": len(records),
            "progress_pct": 100,
            "latest_screenshot": str((screenshots_dir / Path(records[-1]["chart_screenshot"]).name)) if records else "",
            "latest_time_sec": records[-1]["time_sec"] if records else 0,
            "complete": True,
            "paused": False,
            "record_count": len(records),
            "output_dir": str(output_dir),
            "json_path": str(json_path),
            "summary_path": str(summary_path),
            "csv_path": str(csv_path),
            "screenshot_dir": str(screenshots_dir),
        },
    )

    if event_callback:
        event_callback(
            "complete",
            output_dir=str(output_dir),
            json_path=str(json_path),
            summary_path=str(summary_path),
            csv_path=str(csv_path),
            screenshot_dir=str(screenshots_dir),
            summary=summary,
            record_count=len(records),
        )

    return json_path, summary_path, csv_path, screenshots_dir, len(records)


def main():
    parser = argparse.ArgumentParser(description="Extract screenshots from WMV video at fixed intervals.")
    parser.add_argument("--video", default=DEFAULT_VIDEO)
    parser.add_argument("--output-dir", default="video_capture_output")
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--emit-events", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    output_dir = Path(args.output_dir).resolve()
    callback = emit_event if args.emit_events else None
    json_path, summary_path, csv_path, screenshots_dir, count = extract(
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
        print(f"Wrote screenshots to {screenshots_dir}")


if __name__ == "__main__":
    main()
