use std::collections::HashSet;
use std::path::{Path, PathBuf};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const OCR_PYTHON_ENV: &str = "COSL_OCR_PYTHON";

fn looks_like_path(value: &str) -> bool {
    value.contains('\\') || value.contains('/') || value.contains(':')
}

fn runtime_python_candidates(root: impl AsRef<Path>) -> Vec<PathBuf> {
    let root = root.as_ref();
    vec![
        root.join("python.exe"),
        root.join("Scripts").join("python.exe"),
        root.join("bin").join("python3"),
        root.join("bin").join("python"),
    ]
}

fn append_runtime_candidates(candidates: &mut Vec<PathBuf>, root: impl AsRef<Path>) {
    candidates.extend(runtime_python_candidates(root));
}

fn resolve_explicit_python(value: String, label: &str) -> Result<Option<String>, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    if looks_like_path(&value) && !Path::new(&value).exists() {
        return Err(format!("{}不存在: {}", label, value));
    }
    Ok(Some(value))
}

/// 解析 OCR 专用 Python。优先使用显式配置和安装包内运行时，避免误用 Flojoy Python。
pub fn resolve_ocr_python(
    app: &AppHandle,
    explicit_python: Option<String>,
) -> Result<String, String> {
    if let Some(value) =
        resolve_explicit_python(explicit_python.unwrap_or_default(), "OCR Python解释器路径")?
    {
        return Ok(value);
    }

    if let Ok(value) = std::env::var(OCR_PYTHON_ENV) {
        if let Some(value) = resolve_explicit_python(value, OCR_PYTHON_ENV)? {
            return Ok(value);
        }
    }

    let mut candidates = Vec::new();

    // Tauri 安装包资源。Windows 构建会将完整运行时放在此目录。
    if let Ok(root) = app
        .path()
        .resolve("resources/ocr-runtime", BaseDirectory::Resource)
    {
        append_runtime_candidates(&mut candidates, root);
    }

    // 支持首次启动时将运行时释放到用户应用数据目录的后续扩展。
    if let Ok(root) = app
        .path()
        .resolve("ocr-runtime", BaseDirectory::AppLocalData)
    {
        append_runtime_candidates(&mut candidates, root);
    }

    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            append_runtime_candidates(
                &mut candidates,
                parent.join("resources").join("ocr-runtime"),
            );
        }
    }

    // 开发环境：支持项目专用虚拟环境和待打包运行时。
    if let Ok(current_dir) = std::env::current_dir() {
        for root in [
            current_dir.join(".venv-ocr"),
            current_dir.join("..").join(".venv-ocr"),
            current_dir
                .join("src-tauri")
                .join("resources")
                .join("ocr-runtime"),
            current_dir.join("resources").join("ocr-runtime"),
        ] {
            append_runtime_candidates(&mut candidates, root);
        }
    }

    let mut visited = HashSet::new();
    for candidate in candidates {
        let normalized = candidate.to_string_lossy().to_string();
        if visited.insert(normalized.clone()) && candidate.is_file() {
            println!("[OCR] 使用自动定位的 Python: {}", normalized);
            return Ok(normalized);
        }
    }

    // 保留系统 Python 作为开发兜底；依赖检查会给出明确缺包信息。
    Ok(if cfg!(target_os = "windows") {
        "python".to_string()
    } else {
        "python3".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::runtime_python_candidates;
    use std::path::Path;

    #[test]
    fn runtime_candidates_cover_portable_python_and_virtualenv_layouts() {
        let candidates = runtime_python_candidates(Path::new("ocr-runtime"));
        assert!(candidates.iter().any(|item| item.ends_with("python.exe")));
        assert!(candidates
            .iter()
            .any(|item| item.ends_with(Path::new("Scripts").join("python.exe"))));
        assert!(candidates
            .iter()
            .any(|item| item.ends_with(Path::new("bin").join("python3"))));
    }
}
