# Simulated Well Instrument Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated-well supporting-tool picker with a template -> template instrument -> internal instrument SN flow, then persist usage data so management pages show usage counts and maintenance reminders.

**Architecture:** The Tauri client stores a structured selection in the existing downhole-work JSON payload. The Django backend treats that JSON as the source of selected `SimInstrument` rows, updates counts in one transaction, and exposes usage/reminder list APIs. The management frontend replaces mock usage-maintenance data with those APIs.

**Tech Stack:** Vue 3 + TypeScript + Element Plus-compatible HTML controls in `cosl-operator-tauri`, Django views/models in `cnooc-backend`, Vue/Element Plus admin pages in `cosl-front-rebuild`.

---

### Task 1: Test Client API Contract

**Files:**
- Create: `src/services/sim-instrument-api.ts`
- Modify: `src/services/simulated-well-downhole-api.ts`

- [ ] Add a `SimInstrumentListItem` interface with `id`, `sn`, `name`, `model_number`, `used_count`, `remain_count`, and `status`.
- [ ] Add `listSimInstruments(params, headers)` calling `GET /data/sim-instrument/list`.
- [ ] Extend downhole payload types so `devices[]` and `supportingTools[]` may contain structured internal instrument fields.
- [ ] Verify with `pnpm build`; expected result is type-check success or unrelated pre-existing errors only.

### Task 2: Test Client Three-Step Picker

**Files:**
- Modify: `src/views/simulation-well/equipment-package.vue`

- [ ] Replace automatic-only template behavior with explicit per-device template selection.
- [ ] Keep automatic matching as the initial default when possible.
- [ ] Display template instruments from `match_instruments`.
- [ ] Allow checking template instruments and selecting one internal `SimInstrument` SN per checked instrument.
- [ ] Query internal instruments by model code first, then fall back to name if no rows are returned.
- [ ] Show option text as `SN (已用 X 次，剩余 Y 次)` and display the selected remaining count.
- [ ] Save structured selections in both `devices[].supportingTools` and top-level `supportingTools`.
- [ ] Validate before save: a checked template instrument must have an internal instrument selected.
- [ ] Verify with `pnpm build`.

### Task 3: Test Client Detail/Edit Compatibility

**Files:**
- Modify: `src/views/simulation-well/downhole-work.vue`
- Modify: `src/views/simulation-well/test-report.vue` if needed

- [ ] Normalize old saved tools and new structured tools in detail/edit flows.
- [ ] In detail view, show template instrument code/name plus selected internal SN and remaining count.
- [ ] Ensure report generation still resolves templates from `devices[].template`.
- [ ] Verify create/edit/detail types with `pnpm build`.

### Task 4: Backend Usage Persistence

**Files:**
- Modify: `D:\Users\Desktop\cnooc-backend\shared_models\models.py`
- Create migrations under `D:\Users\Desktop\cnooc-backend\shared_models\migrations`
- Modify: `D:\Users\Desktop\cnooc-backend\test_management_app\views.py`
- Modify: `D:\Users\Desktop\cnooc-backend\data_management_app\views.py`
- Modify URLs as needed.

- [ ] Add `SimInstrumentUsageRecord` with work id/no, instrument id/SN/name/model, before/after counts, delta, source, and created time.
- [ ] Add `SimInstrumentMaintenanceReminder` with instrument id/SN/model, remain count, threshold, source work id/no, status, and created time.
- [ ] In `simulated_well_downhole_work_create`, inside `transaction.atomic()`, collect selected internal instruments from `devices[].supportingTools`.
- [ ] Lock each `SimInstrument` with `select_for_update()`, increment `used_count`, decrement `remain_count`, and update status.
- [ ] Create one usage record per `(work, instrument)` and one reminder when `remain_count < 5`.
- [ ] Add list APIs for usage records and reminders.
- [ ] Verify with Django checks/tests or targeted API smoke tests.

### Task 5: Management Frontend Usage Pages

**Files:**
- Create: `D:\Users\Desktop\cosl-front-rebuild\src\api\sim-maintenance\index.ts`
- Create: `D:\Users\Desktop\cosl-front-rebuild\src\api\sim-maintenance\types\index.ts`
- Modify: `D:\Users\Desktop\cosl-front-rebuild\src\views\datamanage\simulated-well-data-manage\usage-maintenance.vue`

- [ ] Replace mock usage data with usage-record API loading and filters.
- [ ] Replace mock reminder data with maintenance-reminder API loading and filters.
- [ ] Keep the alert threshold display at 5 unless a backend threshold API exists.
- [ ] Ensure instrument management continues displaying backend-updated `used_count` and `remain_count`.
- [ ] Verify with the admin frontend build or targeted type-check command.

### Task 6: Cross-Project Verification

**Files:**
- No new files unless fixes are required.

- [ ] Build or type-check `cosl-operator-tauri`.
- [ ] Run Django migration/check command for `cnooc-backend`.
- [ ] Build or type-check `cosl-front-rebuild`.
- [ ] Smoke-test the flow: select template, choose template instrument, select internal SN, save downhole work, confirm counts changed, confirm reminder appears below 5.
