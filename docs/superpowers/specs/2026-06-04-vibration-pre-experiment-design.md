# Vibration Pre-Experiment Retention Design

## Goal

Retain every vibration-table pre-experiment run and make the records visible from the admin test-order detail page, with image preview and packaged downloads separated by run.

## Confirmed Approach

Use a dedicated pre-experiment record instead of reusing the formal vibration report table. Each pre-experiment belongs to one `VibrationTableOrder`, stores structured summary data and attachments, and can be downloaded by itself or together with all pre-experiments for that order.

## Data Flow

The Tauri vibration client already exports capture output locally when a pre-experiment ends. After local export and report-file generation, the client will submit a pre-experiment payload to the backend with:

- order id and order number
- selected instrument metadata
- capture summary and sampled records
- CSV content, latest image, report text, and exported directory metadata
- a client submit id for retry safety

The backend stores one row per pre-experiment and uploaded files under `MEDIA_ROOT/equipment-pre-experiments/vibration-table/<order>/<experiment>/`.

The management frontend reads `pre_experiments` from `GET /test/vibration-table/order/detail/<id>/`, renders one card per pre-experiment, previews image attachments through `el-image`, and downloads ZIP archives through dedicated download endpoints.

## Interfaces

- `POST /test/vibration-table/pre-experiment/create/`
- `GET /test/vibration-table/pre-experiment/download/<id>/`
- `GET /test/vibration-table/order/pre-experiments/download/<order_id>/`
- Existing `GET /test/vibration-table/order/detail/<id>/` includes `pre_experiments`.

## Scope

This change touches:

- `d:\Users\Desktop\cnooc-backend`
- `d:\Users\Desktop\cosl-operator-tauri`
- `d:\Users\Desktop\cosl-front-rebuild`

It does not change formal report review semantics, order audit flow, or existing vibration report history behavior.
