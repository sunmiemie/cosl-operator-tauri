# OCR Models Directory

This directory contains the ONNX models for OCR text recognition.

## Required Models

Please download the following PaddleOCR ONNX models and place them in this directory:

1. **det.onnx** - Text detection model (~4MB)
   - PaddleOCR PP-OCRv4 detection model

2. **rec.onnx** - Text recognition model (~10MB)
   - PaddleOCR PP-OCRv4 recognition model (Chinese + English)

## Download Links

Models can be obtained from:
- PaddlePaddle Model Hub: https://paddlepaddle.github.io/PaddleOCR/
- Or convert from Paddle format to ONNX using paddle2onnx

## Model Placement

After downloading, rename and place the files as:
```
src-tauri/resources/models/
├── det.onnx      # Detection model
├── rec.onnx      # Recognition model
└── README.md     # This file
```
