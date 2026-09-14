#!/usr/bin/env bash
#
# COSL 高温高压 OCR —— Linux 现场部署脚本
#
# 作用：为高温高压 OCR 准备一个 Python 3.12 运行环境，并让已安装的
#       cosl-operator-tauri 应用通过环境变量 COSL_OCR_PYTHON 使用它。
#
# 完整流程：
#   1. 安装 Python 3.12（Ubuntu/Debian 用 deadsnakes PPA；RHEL 系用 dnf）
#   2. 创建独立虚拟环境
#   3. 在该虚拟环境中安装 OCR 依赖（关键）
#   4. 把 COSL_OCR_PYTHON 写入 /etc/environment（登录级，GUI 程序可读）
#   5. 自检依赖 import 是否全部可用
#
# 用法：
#   sudo bash deploy-ocr-python-linux.sh
#
# 可选环境变量：
#   OCR_VENV_DIR     虚拟环境目录，默认 /opt/cosl-ocr-venv
#   PY_VERSION       Python 版本，默认 3.12
#   PIP_INDEX_URL    pip 镜像源，例如 https://pypi.tuna.tsinghua.edu.cn/simple
#   SKIP_INSTALL_PY  设为 1 则跳过安装 Python（系统已有 python3.12 时）
#
set -euo pipefail

OCR_VENV_DIR="${OCR_VENV_DIR:-/opt/cosl-ocr-venv}"
PY_VERSION="${PY_VERSION:-3.12}"
PY_BIN="python${PY_VERSION}"
ENV_FILE="/etc/environment"
ENV_KEY="COSL_OCR_PYTHON"

# OCR 依赖（与 resources/high-temp-pressure/ocr-service/requirements.txt 保持一致）
REQUIREMENTS=(
  "numpy>=2.1,<2.4"
  "onnxruntime==1.27.0"
  "opencv-contrib-python==4.10.0.84"
  "paddleocr==3.7.0"
  "prometheus-client>=0.22,<1"
  "pydantic>=2.11,<3"
  "PyYAML>=6.0,<7"
)

# 与 Rust 端 ensure_ocr_dependencies 完全一致的导入自检
IMPORT_CHECK="import cv2, numpy, onnxruntime, paddleocr, prometheus_client, pydantic, yaml; print('import OK')"

log()  { printf '\033[0;36m[部署]\033[0m %s\n' "$*"; }
ok()   { printf '\033[0;32m[成功]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[警告]\033[0m %s\n' "$*"; }
err()  { printf '\033[0;31m[错误]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    die "请用 root 运行：sudo bash $0"
  fi
}

detect_pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  else
    echo "unknown"
  fi
}

install_python_apt() {
  log "使用 apt 安装 ${PY_BIN}（deadsnakes PPA）..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y software-properties-common ca-certificates
  # deadsnakes 提供 3.12；若系统源已自带则该 PPA 添加可忽略失败
  add-apt-repository -y ppa:deadsnakes/ppa || warn "添加 deadsnakes PPA 失败，尝试使用系统源"
  apt-get update -y
  apt-get install -y "${PY_BIN}" "${PY_BIN}-venv" "${PY_BIN}-dev"
}

install_python_dnf() {
  local mgr="$1"
  log "使用 ${mgr} 安装 ${PY_BIN} ..."
  "${mgr}" install -y "python${PY_VERSION}" "python${PY_VERSION}-devel" || \
    die "未能通过 ${mgr} 安装 python${PY_VERSION}，请改用源码编译方式安装后重跑（设置 SKIP_INSTALL_PY=1）"
}

ensure_python() {
  if command -v "${PY_BIN}" >/dev/null 2>&1; then
    ok "已检测到 ${PY_BIN}：$("${PY_BIN}" --version 2>&1)"
    return
  fi

  if [[ "${SKIP_INSTALL_PY:-0}" == "1" ]]; then
    die "未找到 ${PY_BIN} 且 SKIP_INSTALL_PY=1，请先手动安装 ${PY_BIN}"
  fi

  local mgr
  mgr="$(detect_pkg_mgr)"
  case "${mgr}" in
    apt)      install_python_apt ;;
    dnf|yum)  install_python_dnf "${mgr}" ;;
    *)        die "无法识别包管理器，请手动安装 ${PY_BIN} 后设置 SKIP_INSTALL_PY=1 重跑" ;;
  esac

  command -v "${PY_BIN}" >/dev/null 2>&1 || die "${PY_BIN} 安装后仍不可用"
  ok "已安装 ${PY_BIN}：$("${PY_BIN}" --version 2>&1)"
}

create_venv() {
  if [[ -x "${OCR_VENV_DIR}/bin/python" ]]; then
    log "虚拟环境已存在，复用：${OCR_VENV_DIR}"
  else
    log "创建虚拟环境：${OCR_VENV_DIR}"
    "${PY_BIN}" -m venv "${OCR_VENV_DIR}" || \
      die "创建虚拟环境失败（Ubuntu 请确认已安装 ${PY_BIN}-venv）"
  fi
  ok "虚拟环境就绪：$("${OCR_VENV_DIR}/bin/python" --version 2>&1)"
}

install_deps() {
  local py="${OCR_VENV_DIR}/bin/python"
  local pip_args=()
  if [[ -n "${PIP_INDEX_URL:-}" ]]; then
    pip_args+=("--index-url" "${PIP_INDEX_URL}")
    log "使用 pip 镜像：${PIP_INDEX_URL}"
  fi

  log "升级 pip ..."
  "${py}" -m pip install "${pip_args[@]}" --upgrade pip

  log "安装 OCR 依赖（联网下载，耗时较长，请勿断网）..."
  "${py}" -m pip install "${pip_args[@]}" "${REQUIREMENTS[@]}"
  ok "OCR 依赖安装完成"
}

self_check() {
  local py="${OCR_VENV_DIR}/bin/python"
  log "自检依赖导入 ..."
  if "${py}" -c "${IMPORT_CHECK}"; then
    ok "依赖自检通过，OCR 运行环境可用"
  else
    die "依赖自检失败，请检查上面的报错并重新安装缺失的包"
  fi
}

set_env_var() {
  local py="${OCR_VENV_DIR}/bin/python"
  log "写入环境变量 ${ENV_KEY} 到 ${ENV_FILE} ..."

  # 备份一次
  cp -a "${ENV_FILE}" "${ENV_FILE}.cosl.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true

  # 删除旧的同名配置，避免重复
  if [[ -f "${ENV_FILE}" ]] && grep -q "^${ENV_KEY}=" "${ENV_FILE}"; then
    sed -i "/^${ENV_KEY}=/d" "${ENV_FILE}"
  fi
  echo "${ENV_KEY}=${py}" >> "${ENV_FILE}"

  # 当前 shell 也导出，方便本次立即用命令行验证
  export "${ENV_KEY}=${py}"
  ok "已设置 ${ENV_KEY}=${py}"
}

main() {
  require_root
  log "开始部署 高温高压 OCR Python 环境"
  log "目标虚拟环境：${OCR_VENV_DIR}，Python 版本：${PY_VERSION}"

  ensure_python
  create_venv
  install_deps
  self_check
  set_env_var

  echo
  ok "全部完成！"
  echo "--------------------------------------------------------------"
  echo "  OCR Python  : ${OCR_VENV_DIR}/bin/python"
  echo "  环境变量    : ${ENV_KEY}=${OCR_VENV_DIR}/bin/python  (已写入 ${ENV_FILE})"
  echo "--------------------------------------------------------------"
  warn "重要：/etc/environment 需要【重新登录】(注销再登录) 才会对桌面程序生效。"
  warn "重新登录后再启动 cosl-operator-tauri，高温高压 OCR 才会用到该 Python。"
  echo
  echo "手动验证命令："
  echo "  ${OCR_VENV_DIR}/bin/python -c \"${IMPORT_CHECK}\""
}

main "$@"
