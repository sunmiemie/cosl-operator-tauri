from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
OCR_SERVICE_DIR = (
    ROOT / "src-tauri" / "resources" / "high-temp-pressure" / "ocr-service"
)
sys.path.insert(0, str(OCR_SERVICE_DIR))

from run_high_temp_pressure_ocr import write_compact_outputs  # noqa: E402


class FakeJournal:
    def __init__(self, records: list[dict[str, object]]) -> None:
        self._records = records
        self.count = len(records)

    def records(self):
        yield from self._records


class CompactOutputTests(unittest.TestCase):
    def test_compact_json_keeps_curve_values_and_csv_keeps_all_measurements(self) -> None:
        records = [
            {
                "record_index": 1,
                "time_sec": 0.5,
                "captured_at": "2026-09-18T09:20:00.500+08:00",
                "screen_detected": True,
                "measurements": [
                    {"id": "vessel_250_upper_water_temp", "value": 52, "raw": "52"},
                    {"id": "vessel_480_upper_water_temp", "value": 99, "raw": "99"},
                    {"id": "vessel_250_lower_water_temp", "value": 50, "raw": "50"},
                    {"id": "vessel_250_pressure", "value": 80.5, "raw": "80.5"},
                    {"id": "oil_tank_level", "value": 70, "raw": "70"},
                ],
            },
            {
                "record_index": 2,
                "time_sec": 1.0,
                "captured_at": "2026-09-18T09:20:01.000+08:00",
                "screen_detected": False,
                "measurements": [
                    {"id": "vessel_250_upper_water_temp", "value": None},
                    {"id": "vessel_480_upper_water_temp", "value": 53},
                    {"id": "vessel_480_lower_water_temp", "value": 51},
                    {"id": "cylinder_pressure", "value": 81.0},
                    {"id": "oil_tank_level", "value": 71},
                ],
            },
        ]
        regions = [
            SimpleNamespace(id="vessel_250_upper_water_temp", enabled=True),
            SimpleNamespace(id="vessel_480_upper_water_temp", enabled=True),
            SimpleNamespace(id="vessel_250_lower_water_temp", enabled=True),
            SimpleNamespace(id="vessel_480_lower_water_temp", enabled=True),
            SimpleNamespace(id="vessel_250_pressure", enabled=True),
            SimpleNamespace(id="cylinder_pressure", enabled=True),
            SimpleNamespace(id="oil_tank_level", enabled=True),
        ]

        with tempfile.TemporaryDirectory() as directory:
            json_path = Path(directory) / "ocr_readings_0.5s.json"
            csv_path = Path(directory) / "ocr_readings.csv"
            write_compact_outputs(
                json_path,
                csv_path,
                FakeJournal(records),  # type: ignore[arg-type]
                regions,  # type: ignore[arg-type]
            )

            payload = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], 2)
            self.assertEqual(payload["field_count"], 3)
            self.assertEqual(payload["record_count"], 2)
            self.assertNotIn("measurements", payload["records"][0])
            self.assertNotIn("raw", payload["records"][0])
            self.assertEqual(payload["records"][0]["upper_temp"], 52)
            self.assertEqual(payload["records"][0]["lower_temp"], 50)
            self.assertEqual(payload["records"][0]["pressure"], 80.5)
            self.assertEqual(payload["records"][1]["upper_temp"], 53)
            self.assertEqual(payload["records"][1]["lower_temp"], 51)
            self.assertEqual(payload["records"][1]["pressure"], 81.0)

            with csv_path.open(encoding="utf-8", newline="") as handle:
                csv_rows = list(csv.reader(handle))
            self.assertIn("oil_tank_level", csv_rows[0])
            self.assertEqual(csv_rows[1][-1], "70")
            self.assertEqual(csv_rows[2][-1], "71")


if __name__ == "__main__":
    unittest.main()
