import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, "..")
const runtimeDir = join(projectRoot, "src-tauri", "resources", "ocr-runtime")
const runtimePython = join(runtimeDir, "python.exe")
const manifestPath = join(runtimeDir, "ocr-runtime-manifest.json")
const placeholderName = "runtime-placeholder.txt"
const pythonVersion = process.env.COSL_OCR_PYTHON_VERSION || "3.12.13"
const force = process.env.COSL_OCR_RUNTIME_FORCE === "1"
const requirements = [
  join(projectRoot, "src-tauri", "resources", "high-temp-pressure", "ocr-service", "requirements.txt"),
  join(projectRoot, "src-tauri", "resources", "vibration", "ocr-service", "requirements.txt")
]
const importCheck = "import cv2, numpy, onnxruntime, paddleocr, prometheus_client, pydantic, yaml"

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env
  })?.trim()
}

function checkRuntime(python = runtimePython) {
  if (!existsSync(python)) return false
  try {
    run(python, ["-c", importCheck], { capture: true })
    return true
  } catch {
    return false
  }
}

function requirementsHash() {
  const hash = createHash("sha256")
  for (const requirement of requirements) {
    hash.update(readFileSync(requirement))
  }
  return hash.digest("hex")
}

if (process.platform !== "win32") {
  console.log("[OCR runtime] 非 Windows 构建沿用系统 OCR 环境，跳过内置运行时生成。")
  process.exit(0)
}

const expectedHash = requirementsHash()
if (!force && existsSync(manifestPath) && checkRuntime()) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    if (
      manifest.schemaVersion === 1 &&
      manifest.pythonVersion === pythonVersion &&
      manifest.requirementsSha256 === expectedHash
    ) {
      console.log(`[OCR runtime] 已就绪: ${runtimePython}`)
      process.exit(0)
    }
  } catch {
    // 清单损坏时重新生成。
  }
}

const stagingDir = `${runtimeDir}.staging-${process.pid}`
const stagingPython = join(stagingDir, "python.exe")
rmSync(stagingDir, { recursive: true, force: true })

try {
  console.log(`[OCR runtime] 准备可迁移 Python ${pythonVersion}...`)
  run("uv", ["python", "install", pythonVersion])
  const sourcePython = run("uv", ["python", "find", pythonVersion], { capture: true })
  if (!sourcePython || !existsSync(sourcePython)) {
    throw new Error(`uv 未返回有效的 Python 路径: ${sourcePython || "(empty)"}`)
  }

  const sourceRoot = dirname(sourcePython)
  cpSync(sourceRoot, stagingDir, {
    recursive: true,
    filter(source) {
      const normalized = source.replaceAll("\\", "/")
      return !normalized.includes("/__pycache__/") && !normalized.endsWith(".pyc")
    }
  })

  console.log("[OCR runtime] 安装高温高压与振动 OCR 离线依赖...")
  const installArgs = [
    "pip",
    "install",
    "--python",
    stagingPython,
    "--system",
    "--break-system-packages"
  ]
  for (const requirement of requirements) installArgs.push("-r", requirement)
  run("uv", installArgs)

  if (!checkRuntime(stagingPython)) {
    throw new Error("OCR 运行时依赖导入检查失败")
  }

  writeFileSync(
    join(stagingDir, placeholderName),
    "Windows 打包时由 scripts/prepare-ocr-runtime.mjs 在此生成 Python 3.12 OCR 运行时。\n"
  )
  writeFileSync(
    join(stagingDir, "ocr-runtime-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        platform: process.platform,
        arch: process.arch,
        pythonVersion,
        requirementsSha256: expectedHash,
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  )

  rmSync(runtimeDir, { recursive: true, force: true })
  renameSync(stagingDir, runtimeDir)

  // 从临时目录迁移到最终目录后再验证一次，确保运行时不依赖构建路径。
  if (!checkRuntime()) {
    throw new Error("OCR 运行时移动后校验失败，不能用于安装包")
  }
  console.log(`[OCR runtime] 生成完成: ${runtimeDir}`)
} catch (error) {
  rmSync(stagingDir, { recursive: true, force: true })
  console.error(`[OCR runtime] 生成失败: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
