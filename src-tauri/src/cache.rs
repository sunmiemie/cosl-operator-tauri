/**
 * 缓存管理模块
 *
 * 提供工艺、临时工单、反馈记录、报告等数据的本地缓存功能
 *
 * 缓存目录结构:
 * {app_data}/cache/
 *   ├── process/     - 工艺数据缓存
 *   ├── temp/        - 临时工单缓存
 *   ├── feedback/    - 反馈记录缓存
 *   └── report/      - 报告缓存
 */
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

/// 获取缓存根目录
fn get_cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    Ok(app_data_dir.join("cache"))
}

/// 获取指定类型的缓存目录
fn get_cache_dir(app: &AppHandle, cache_type: &str) -> Result<PathBuf, String> {
    let cache_root = get_cache_root(app)?;
    let cache_dir = cache_root.join(cache_type);

    // 如果目录不存在，创建它
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;
    }

    Ok(cache_dir)
}

/// 获取缓存文件路径
fn get_cache_file_path(app: &AppHandle, cache_type: &str, id: &str) -> Result<PathBuf, String> {
    let cache_dir = get_cache_dir(app, cache_type)?;
    Ok(cache_dir.join(format!("{}.json", id)))
}

/// 检查缓存是否存在
#[tauri::command]
pub fn cache_exists(app: AppHandle, cache_type: &str, id: &str) -> Result<bool, String> {
    let file_path = get_cache_file_path(&app, cache_type, id)?;
    Ok(file_path.exists())
}

/// 读取缓存
#[tauri::command]
pub fn read_cache(app: AppHandle, cache_type: &str, id: &str) -> Result<String, String> {
    let file_path = get_cache_file_path(&app, cache_type, id)?;

    if !file_path.exists() {
        return Err(format!("缓存文件不存在: {}", id));
    }

    fs::read_to_string(&file_path).map_err(|e| format!("读取缓存文件失败: {}", e))
}

/// 写入缓存
#[tauri::command]
pub fn write_cache(app: AppHandle, cache_type: &str, id: &str, data: &str) -> Result<(), String> {
    let file_path = get_cache_file_path(&app, cache_type, id)?;

    // 确保父目录存在
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建缓存目录失败: {}", e))?;
        }
    }

    fs::write(&file_path, data).map_err(|e| format!("写入缓存文件失败: {}", e))
}

/// 删除单个缓存文件
#[tauri::command]
pub fn delete_cache(app: AppHandle, cache_type: &str, id: &str) -> Result<(), String> {
    let file_path = get_cache_file_path(&app, cache_type, id)?;

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("删除缓存文件失败: {}", e))?;
    }

    Ok(())
}

/// 清除指定类型的所有缓存
#[tauri::command]
pub fn clear_cache(app: AppHandle, cache_type: &str) -> Result<(), String> {
    let cache_dir = get_cache_dir(&app, cache_type)?;

    if cache_dir.exists() {
        // 删除目录下所有文件
        for entry in fs::read_dir(&cache_dir).map_err(|e| format!("读取缓存目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();

            if path.is_file() {
                fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))?;
            }
        }
    }

    Ok(())
}

/// 获取指定类型缓存的总大小（MB）
#[tauri::command]
pub fn get_cache_size(app: AppHandle, cache_type: &str) -> Result<f64, String> {
    let cache_dir = get_cache_dir(&app, cache_type)?;

    if !cache_dir.exists() {
        return Ok(0.0);
    }

    let mut total_size: u64 = 0;

    for entry in fs::read_dir(&cache_dir).map_err(|e| format!("读取缓存目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;

        if metadata.is_file() {
            total_size += metadata.len();
        }
    }

    // 转换为 MB，保留两位小数
    let size_mb = (total_size as f64) / (1024.0 * 1024.0);
    Ok((size_mb * 100.0).round() / 100.0)
}

/// 获取所有类型缓存的大小
#[tauri::command]
pub fn get_all_cache_sizes(app: AppHandle) -> Result<CacheSizes, String> {
    let cache_types = vec!["process", "temp", "feedback", "report"];

    let mut sizes = CacheSizes {
        process: 0.0,
        temp: 0.0,
        feedback: 0.0,
        report: 0.0,
        total: 0.0,
    };

    for cache_type in cache_types {
        let size = get_cache_size(app.clone(), cache_type)?;
        match cache_type {
            "process" => sizes.process = size,
            "temp" => sizes.temp = size,
            "feedback" => sizes.feedback = size,
            "report" => sizes.report = size,
            _ => {}
        }
        sizes.total += size;
    }

    sizes.total = (sizes.total * 100.0).round() / 100.0;

    Ok(sizes)
}

/// 缓存大小信息
#[derive(serde::Serialize)]
pub struct CacheSizes {
    /// 工艺缓存大小 (MB)
    pub process: f64,
    /// 临时工单缓存大小 (MB)
    pub temp: f64,
    /// 反馈记录缓存大小 (MB)
    pub feedback: f64,
    /// 报告缓存大小 (MB)
    pub report: f64,
    /// 总大小 (MB)
    pub total: f64,
}

/// 清除所有缓存
#[tauri::command]
pub fn clear_all_cache(app: AppHandle) -> Result<(), String> {
    let cache_types = vec!["process", "temp", "feedback", "report"];

    for cache_type in cache_types {
        clear_cache(app.clone(), cache_type)?;
    }

    Ok(())
}

/// 列出指定类型的所有缓存 ID
#[tauri::command]
pub fn list_cache_ids(app: AppHandle, cache_type: &str) -> Result<Vec<String>, String> {
    let cache_dir = get_cache_dir(&app, cache_type)?;

    if !cache_dir.exists() {
        return Ok(vec![]);
    }

    let mut ids = Vec::new();

    for entry in fs::read_dir(&cache_dir).map_err(|e| format!("读取缓存目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            if let Some(file_name) = path.file_stem() {
                if let Some(name) = file_name.to_str() {
                    ids.push(name.to_string());
                }
            }
        }
    }

    Ok(ids)
}
