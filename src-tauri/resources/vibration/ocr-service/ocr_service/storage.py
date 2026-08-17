from __future__ import annotations

import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from .domain import CycleRecord, FieldResult, ReadingStatus


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


class OcrRepository:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._initialization_lock = threading.Lock()
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")
        return connection

    def initialize(self) -> None:
        with self._initialization_lock:
            if self._initialized:
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as connection:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("PRAGMA synchronous=NORMAL")
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS sample_cycles (
                        id TEXT PRIMARY KEY,
                        scheduled_at TEXT NOT NULL,
                        started_at TEXT NOT NULL,
                        completed_at TEXT NOT NULL,
                        status TEXT NOT NULL,
                        frame_count INTEGER NOT NULL,
                        duration_ms REAL NOT NULL,
                        screen_score REAL,
                        error TEXT
                    );

                    CREATE TABLE IF NOT EXISTS field_results (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        cycle_id TEXT NOT NULL REFERENCES sample_cycles(id) ON DELETE CASCADE,
                        field_id TEXT NOT NULL,
                        captured_at TEXT NOT NULL,
                        status TEXT NOT NULL,
                        accepted_text TEXT,
                        numeric_value TEXT,
                        candidate_text TEXT,
                        confidence REAL,
                        change_score REAL,
                        reason TEXT,
                        source_timestamp_ms REAL
                    );

                    CREATE INDEX IF NOT EXISTS idx_field_results_field_time
                        ON field_results(field_id, captured_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_field_results_status_time
                        ON field_results(status, captured_at DESC);

                    CREATE TABLE IF NOT EXISTS latest_readings (
                        field_id TEXT PRIMARY KEY,
                        cycle_id TEXT NOT NULL,
                        text TEXT NOT NULL,
                        numeric_value TEXT NOT NULL,
                        confidence REAL NOT NULL,
                        captured_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS incidents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        cycle_id TEXT NOT NULL,
                        field_id TEXT NOT NULL,
                        status TEXT NOT NULL,
                        path TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_incidents_created
                        ON incidents(created_at DESC);
                    """
                )
                columns = {
                    row["name"]
                    for row in connection.execute(
                        "PRAGMA table_info(field_results)"
                    ).fetchall()
                }
                if "source_timestamp_ms" not in columns:
                    connection.execute(
                        "ALTER TABLE field_results ADD COLUMN source_timestamp_ms REAL"
                    )
            self._initialized = True

    def writable(self) -> bool:
        try:
            self.initialize()
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    "CREATE TEMP TABLE IF NOT EXISTS write_probe(value INT)"
                )
                connection.rollback()
            return True
        except sqlite3.Error:
            return False

    def persist_cycle(self, cycle: CycleRecord, results: list[FieldResult]) -> None:
        self.initialize()
        now = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT INTO sample_cycles (
                    id, scheduled_at, started_at, completed_at, status,
                    frame_count, duration_ms, screen_score, error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cycle.id,
                    _iso(cycle.scheduled_at),
                    _iso(cycle.started_at),
                    _iso(cycle.completed_at),
                    cycle.status,
                    cycle.frame_count,
                    cycle.duration_ms,
                    cycle.screen_score,
                    cycle.error,
                ),
            )
            connection.executemany(
                """
                INSERT INTO field_results (
                    cycle_id, field_id, captured_at, status, accepted_text,
                    numeric_value, candidate_text, confidence, change_score, reason,
                    source_timestamp_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        result.cycle_id,
                        result.field_id,
                        _iso(result.captured_at),
                        result.status.value,
                        result.accepted_text,
                        str(result.numeric_value)
                        if result.numeric_value is not None
                        else None,
                        result.candidate_text,
                        result.confidence,
                        result.change_score,
                        result.reason,
                        result.source_timestamp_ms,
                    )
                    for result in results
                ],
            )
            for result in results:
                if result.status is not ReadingStatus.ACCEPTED:
                    continue
                assert result.accepted_text is not None
                assert result.numeric_value is not None
                assert result.confidence is not None
                connection.execute(
                    """
                    INSERT INTO latest_readings (
                        field_id, cycle_id, text, numeric_value, confidence,
                        captured_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(field_id) DO UPDATE SET
                        cycle_id=excluded.cycle_id,
                        text=excluded.text,
                        numeric_value=excluded.numeric_value,
                        confidence=excluded.confidence,
                        captured_at=excluded.captured_at,
                        updated_at=excluded.updated_at
                    """,
                    (
                        result.field_id,
                        result.cycle_id,
                        result.accepted_text,
                        str(result.numeric_value),
                        result.confidence,
                        _iso(result.captured_at),
                        _iso(now),
                    ),
                )
                if result.incident_path:
                    connection.execute(
                        """
                        INSERT INTO incidents (
                            cycle_id, field_id, status, path, created_at
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            result.cycle_id,
                            result.field_id,
                            result.status.value,
                            result.incident_path,
                            _iso(now),
                        ),
                    )
            for result in results:
                if not result.incident_path or result.status is ReadingStatus.ACCEPTED:
                    continue
                connection.execute(
                    """
                    INSERT INTO incidents (
                        cycle_id, field_id, status, path, created_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        result.cycle_id,
                        result.field_id,
                        result.status.value,
                        result.incident_path,
                        _iso(now),
                    ),
                )
            connection.commit()

    def restore_latest(self) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM latest_readings ORDER BY field_id"
            ).fetchall()
        return [
            {
                "field_id": row["field_id"],
                "text": row["text"],
                "value": Decimal(row["numeric_value"]),
                "captured_at": _parse_time(row["captured_at"]),
            }
            for row in rows
        ]

    def latest_snapshot(self) -> dict[str, dict[str, Any]]:
        self.initialize()
        with self._connect() as connection:
            latest_attempts = connection.execute(
                """
                SELECT fr.*
                FROM field_results fr
                INNER JOIN (
                    SELECT field_id, MAX(id) AS max_id
                    FROM field_results
                    GROUP BY field_id
                ) latest ON latest.max_id = fr.id
                """
            ).fetchall()
            accepted = connection.execute("SELECT * FROM latest_readings").fetchall()

        result: dict[str, dict[str, Any]] = {}
        for row in latest_attempts:
            result[row["field_id"]] = {
                "field_id": row["field_id"],
                "cycle_id": row["cycle_id"],
                "status": row["status"],
                "candidate_text": row["candidate_text"],
                "confidence": row["confidence"],
                "change_score": row["change_score"],
                "reason": row["reason"],
                "attempted_at": row["captured_at"],
                "text": None,
                "numeric_value": None,
                "accepted_at": None,
            }
        for row in accepted:
            entry = result.setdefault(
                row["field_id"],
                {
                    "field_id": row["field_id"],
                    "cycle_id": row["cycle_id"],
                    "status": "accepted",
                    "candidate_text": row["text"],
                    "confidence": row["confidence"],
                    "change_score": None,
                    "reason": None,
                    "attempted_at": row["captured_at"],
                },
            )
            entry["text"] = row["text"]
            entry["numeric_value"] = row["numeric_value"]
            entry["accepted_at"] = row["captured_at"]
        return result

    def history(
        self,
        *,
        field_id: str | None = None,
        status: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        self.initialize()
        conditions: list[str] = []
        parameters: list[Any] = []
        if field_id:
            conditions.append("field_id = ?")
            parameters.append(field_id)
        if status:
            conditions.append("status = ?")
            parameters.append(status)
        if start:
            conditions.append("captured_at >= ?")
            parameters.append(_iso(start))
        if end:
            conditions.append("captured_at <= ?")
            parameters.append(_iso(end))
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        parameters.extend([limit, offset])
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT cycle_id, field_id, captured_at, status, accepted_text,
                       numeric_value, candidate_text, confidence, change_score, reason,
                       source_timestamp_ms
                FROM field_results
                {where}
                ORDER BY captured_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                parameters,
            ).fetchall()
        return [dict(row) for row in rows]

    def cleanup(self, retention_hours: int) -> int:
        self.initialize()
        cutoff = datetime.now(UTC) - timedelta(hours=retention_hours)
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM sample_cycles WHERE completed_at < ?", (_iso(cutoff),)
            )
            connection.commit()
            return cursor.rowcount

    def counts(self) -> dict[str, int]:
        self.initialize()
        with self._connect() as connection:
            cycles = connection.execute(
                "SELECT COUNT(*) FROM sample_cycles"
            ).fetchone()[0]
            results = connection.execute(
                "SELECT COUNT(*) FROM field_results"
            ).fetchone()[0]
            incidents = connection.execute("SELECT COUNT(*) FROM incidents").fetchone()[
                0
            ]
        return {"cycles": cycles, "results": results, "incidents": incidents}
