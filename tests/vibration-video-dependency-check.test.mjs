import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const rust = readFileSync(resolve(root, 'src-tauri/src/vibration_video.rs'), 'utf8')

assert.match(
  rust,
  /fn ensure_video_dependencies\(python_program: &str\) -> Result<\(\), String>/,
  'vibration video backend should define a Python dependency preflight check'
)
assert.match(
  rust,
  /\.args\(\["-c", "import av, cv2, numpy; from PIL import Image, ImageDraw, ImageFont"\]\)/,
  'vibration dependency preflight should check PyAV, OpenCV, NumPy and Pillow'
)
assert.match(
  rust,
  /缺少振动视频识别依赖/,
  'vibration dependency preflight should return a clear user-facing dependency message'
)

const extractStart = rust.indexOf('pub fn extract_vibration_video_data')
const streamStart = rust.indexOf('pub fn start_vibration_video_stream')
assert.notEqual(extractStart, -1, 'extract command should exist')
assert.notEqual(streamStart, -1, 'stream command should exist')

const extractBody = rust.slice(extractStart, streamStart)
const streamBody = rust.slice(streamStart, rust.indexOf('pub fn stop_vibration_video_stream', streamStart))

assert.match(
  extractBody,
  /let python_program = resolve_python_program\(python_path\)\?;\s*ensure_video_dependencies\(&python_program\)\?;/,
  'one-shot vibration extraction should check Python dependencies before running the script'
)
assert.match(
  streamBody,
  /let python_program = resolve_python_program\(python_path\)\?;\s*ensure_video_dependencies\(&python_program\)\?;/,
  'streaming vibration extraction should check Python dependencies before running the script'
)

console.log('vibration video dependency check assertions passed')
