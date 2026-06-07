# Vibration Pre-Experiment Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve each vibration-table pre-experiment run, show it in admin order detail, preview images, and download records as ZIP archives separated by run.

**Architecture:** Add a backend `VibrationTablePreExperiment` table and API surface, then have the Tauri vibration workflow submit one record after local pre-experiment export. The admin frontend maps `pre_experiments` from order detail into cards with image preview and per-run/all-run ZIP downloads.

**Tech Stack:** Django 4.2, Vue 3, TypeScript, Tauri 2, Element Plus.

---

### Task 1: Backend Storage And APIs

**Files:**
- Modify: `d:/Users/Desktop/cnooc-backend/shared_models/models.py`
- Create: `d:/Users/Desktop/cnooc-backend/shared_models/migrations/0027_vibration_table_pre_experiment.py`
- Modify: `d:/Users/Desktop/cnooc-backend/test_management_app/serializers.py`
- Modify: `d:/Users/Desktop/cnooc-backend/test_management_app/views.py`
- Modify: `d:/Users/Desktop/cnooc-backend/test_management_app/urls.py`
- Modify: `d:/Users/Desktop/cnooc-backend/test_management_app/tests.py`

- [ ] **Step 1: Write failing Django tests**

Add tests that create a vibration order, POST one pre-experiment with CSV and image uploads, assert order detail returns `pre_experiments`, and assert single/all ZIP downloads contain per-run folders.

- [ ] **Step 2: Run tests and verify RED**

Run: `python manage.py test test_management_app.tests.VibrationTablePreExperimentApiTests -v 2`

Expected: fail because the model, routes, and response fields do not exist.

- [ ] **Step 3: Add model, migration, serializer, routes, create/detail/download views**

Add a `VibrationTablePreExperiment` model with `order`, `experiment_no`, `client_submit_id`, `summary`, `records`, `attachments`, `export_dir`, `tester`, and timestamps. Update order serialization to include ordered pre-experiment records.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run: `python manage.py test test_management_app.tests.VibrationTablePreExperimentApiTests -v 2`

Expected: pass.

### Task 2: Tauri Client Uploads Pre-Experiments

**Files:**
- Modify: `d:/Users/Desktop/cosl-operator-tauri/src/services/equipment-report-api.ts`
- Modify: `d:/Users/Desktop/cosl-operator-tauri/src/views/vibration/types.ts`
- Modify: `d:/Users/Desktop/cosl-operator-tauri/src/views/vibration/composables/useVibrationTesting.ts`
- Modify: `d:/Users/Desktop/cosl-operator-tauri/src/views/vibration/composables/useVibrationReport.ts`
- Modify: `d:/Users/Desktop/cosl-operator-tauri/src/views/vibration/index.vue`

- [ ] **Step 1: Add type-level service test or build-facing type contract**

Add a small exported API function that posts multipart pre-experiment payloads. Verify TypeScript catches the function signature and file metadata shape through `pnpm build`.

- [ ] **Step 2: Run build and verify current missing implementation**

Run: `pnpm build`

Expected before implementation: fail if the new call sites are introduced without the service implementation.

- [ ] **Step 3: Implement upload after report file generation**

When `testMode === "pre"` and report files finish, build a multipart request containing payload JSON, CSV, latest image blob, and report text blob. Use a `vib-pre-...` client submit id. Keep existing local export and stage transitions intact.

- [ ] **Step 4: Run Tauri frontend typecheck/build**

Run: `pnpm build`

Expected: pass.

### Task 3: Admin Detail Display And ZIP Downloads

**Files:**
- Modify: `d:/Users/Desktop/cosl-front-rebuild/src/api/vibration-table/types/index.ts`
- Modify: `d:/Users/Desktop/cosl-front-rebuild/src/api/vibration-table/index.ts`
- Modify: `d:/Users/Desktop/cosl-front-rebuild/src/views/testmanage/testorder/components/VibrationOrder.vue`

- [ ] **Step 1: Add typed mapping for pre-experiments**

Map snake_case backend records to camelCase admin records, preserving file URLs and attachment metadata.

- [ ] **Step 2: Add detail UI**

Add a dedicated `预实验数据` section below instruments. Render one card per pre-experiment with summary stats, attachments, previewable images, and a per-run download button. Add an all-run download button when records exist.

- [ ] **Step 3: Run admin build**

Run: `pnpm build:prod`

Expected: pass.

### Task 4: End-To-End Verification

**Files:**
- All touched files above.

- [ ] **Step 1: Run backend targeted tests**

Run: `python manage.py test test_management_app.tests.VibrationTablePreExperimentApiTests -v 2`

- [ ] **Step 2: Run Tauri build**

Run: `pnpm build` in `d:/Users/Desktop/cosl-operator-tauri`

- [ ] **Step 3: Run admin build**

Run: `pnpm build:prod` in `d:/Users/Desktop/cosl-front-rebuild`

- [ ] **Step 4: Review git diffs**

Run `git diff --stat` in all three repositories and verify only feature-related files changed.
