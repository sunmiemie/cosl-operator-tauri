import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import av
import cv2


DEFAULT_VIDEO = ""
CHART_ROI = [74, 229, 1364, 591]


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
        "target": {"label": "截图序号", "raw": "", "value": None, "unit": "", "confidence": 1.0},
        "level": {"label": "截图状态", "raw": "", "value": None, "unit": "", "confidence": 1.0},
        "response": {"label": "采集条数", "raw": "", "value": None, "unit": "", "confidence": 1.0},
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
    return {
        "source_video": str(source_video),
        "sample_interval_seconds": interval,
        "duration_seconds": round(duration_seconds, 3),
        "record_count": len(records),
        "screen_detected_count": len(records),
        "avg_response": 0,
        "max_drive": 0,
        "last_elapsed_time": records[-1]["values"]["elapsed_time"]["raw"] if records else "0:00:00",
        "screenshot_dir": str(screenshot_dir),
    }


def build_csv(records):
    header = ["time_sec", "frame_time_sec", "chart_screenshot", "elapsed_time", "remaining_time"]
    rows = [",".join(header)]
    for record in records:
        rows.append(
            ",".join(
                [
                    str(record.get("time_sec", "")),
                    str(record.get("frame_time_sec", "")),
                    str(record.get("chart_screenshot", "")),
                    str((((record.get("values") or {}).get("elapsed_time") or {}).get("raw")) or ""),
                    str((((record.get("values") or {}).get("remaining_time") or {}).get("raw")) or ""),
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
                    "values": empty_values(target, duration),
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
