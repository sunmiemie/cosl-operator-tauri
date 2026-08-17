//! 扫码枪模块 - USB HID 扫码枪驱动
//!
//! 支持 YC200D 等 HID 键盘模拟类型的扫码枪
//! VID: 0x0581, PID: 0x011C

use lazy_static::lazy_static;
use parking_lot::Mutex;
use rusb::{Context, Device, DeviceHandle, UsbContext};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// 扫码枪 VID (Vendor ID)
const SCANNER_VID: u16 = 0x0581;
/// YC200D 扫码枪 PID (Product ID)
const SCANNER_PID_YC200D: u16 = 0x011C;

/// HID 键盘码到 ASCII 字符的映射表
/// (普通字符, Shift 后字符)
fn hid_to_char(keycode: u8, shift: bool) -> Option<char> {
    let chars = match keycode {
        4 => ('a', 'A'),
        5 => ('b', 'B'),
        6 => ('c', 'C'),
        7 => ('d', 'D'),
        8 => ('e', 'E'),
        9 => ('f', 'F'),
        10 => ('g', 'G'),
        11 => ('h', 'H'),
        12 => ('i', 'I'),
        13 => ('j', 'J'),
        14 => ('k', 'K'),
        15 => ('l', 'L'),
        16 => ('m', 'M'),
        17 => ('n', 'N'),
        18 => ('o', 'O'),
        19 => ('p', 'P'),
        20 => ('q', 'Q'),
        21 => ('r', 'R'),
        22 => ('s', 'S'),
        23 => ('t', 'T'),
        24 => ('u', 'U'),
        25 => ('v', 'V'),
        26 => ('w', 'W'),
        27 => ('x', 'X'),
        28 => ('y', 'Y'),
        29 => ('z', 'Z'),
        30 => ('1', '!'),
        31 => ('2', '@'),
        32 => ('3', '#'),
        33 => ('4', '$'),
        34 => ('5', '%'),
        35 => ('6', '^'),
        36 => ('7', '&'),
        37 => ('8', '*'),
        38 => ('9', '('),
        39 => ('0', ')'),
        40 => ('\n', '\n'), // Enter
        44 => (' ', ' '),   // Space
        45 => ('-', '_'),
        46 => ('=', '+'),
        47 => ('[', '{'),
        48 => (']', '}'),
        49 => ('\\', '|'),
        51 => (';', ':'),
        52 => ('\'', '"'),
        53 => ('`', '~'),
        54 => (',', '<'),
        55 => ('.', '>'),
        56 => ('/', '?'),
        _ => return None,
    };
    Some(if shift { chars.1 } else { chars.0 })
}

/// 解码 HID 数据包为字符串
fn decode_hid_data(data: &[u8]) -> String {
    if data.len() < 3 {
        return String::new();
    }

    // 检查 Shift 键状态 (左 Shift: bit 1, 右 Shift: bit 5)
    let shift_pressed = (data[0] & 0x22) != 0;

    let mut result = String::new();
    // 从第3个字节开始是按键数据
    for &byte in &data[2..] {
        if byte > 0 {
            if let Some(ch) = hid_to_char(byte, shift_pressed) {
                result.push(ch);
            }
        }
    }
    result
}

/// 扫码枪状态
struct ScannerState {
    /// 是否正在扫描
    running: Arc<AtomicBool>,
    /// 扫描线程句柄
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl Default for ScannerState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }
}

lazy_static! {
    static ref SCANNER_STATE: Mutex<ScannerState> = Mutex::new(ScannerState::default());
}

/// 查找扫码枪设备
fn find_scanner_device(context: &Context) -> Option<Device<Context>> {
    let devices = context.devices().ok()?;

    for device in devices.iter() {
        if let Ok(desc) = device.device_descriptor() {
            if desc.vendor_id() == SCANNER_VID && desc.product_id() == SCANNER_PID_YC200D {
                return Some(device);
            }
        }
    }
    None
}

/// 检测扫码枪是否连接
#[tauri::command]
pub fn check_scanner() -> Result<bool, String> {
    let context = Context::new().map_err(|e| format!("USB 上下文创建失败: {}", e))?;
    Ok(find_scanner_device(&context).is_some())
}

/// 获取扫码枪设备信息
#[tauri::command]
pub fn get_scanner_info() -> Result<Option<serde_json::Value>, String> {
    let context = Context::new().map_err(|e| format!("USB 上下文创建失败: {}", e))?;

    if let Some(device) = find_scanner_device(&context) {
        if let Ok(desc) = device.device_descriptor() {
            return Ok(Some(serde_json::json!({
                "vendor_id": format!("0x{:04X}", desc.vendor_id()),
                "product_id": format!("0x{:04X}", desc.product_id()),
                "bus": device.bus_number(),
                "address": device.address(),
            })));
        }
    }
    Ok(None)
}

/// 启动扫码枪监听
/// 扫描到的数据会通过 `scanner-data` 事件发送到前端
#[tauri::command]
pub fn start_scanner(app: AppHandle) -> Result<(), String> {
    let mut state = SCANNER_STATE.lock();

    // 如果已经在运行，先停止
    if state.running.load(Ordering::SeqCst) {
        state.running.store(false, Ordering::SeqCst);
        if let Some(handle) = state.thread_handle.take() {
            let _ = handle.join();
        }
    }

    // 创建 USB 上下文
    let context = Context::new().map_err(|e| format!("USB 上下文创建失败: {}", e))?;

    // 查找扫码枪设备
    let device = find_scanner_device(&context).ok_or_else(|| "未找到扫码枪设备".to_string())?;

    // 打开设备
    let mut handle: DeviceHandle<Context> = device
        .open()
        .map_err(|e| format!("打开扫码枪失败: {}", e))?;

    // 设置配置
    handle
        .set_active_configuration(1)
        .map_err(|e| format!("设置配置失败: {}", e))?;

    // 在 Linux 上需要 detach kernel driver
    #[cfg(target_os = "linux")]
    {
        if handle.kernel_driver_active(0).unwrap_or(false) {
            handle
                .detach_kernel_driver(0)
                .map_err(|e| format!("Detach kernel driver 失败: {}", e))?;
        }
    }

    // 声明接口
    handle
        .claim_interface(0)
        .map_err(|e| format!("声明接口失败: {}", e))?;

    // 获取端点地址 (通常 HID 设备使用 endpoint 0x81)
    let endpoint_address = 0x81u8;

    // 设置运行标志
    let running = Arc::clone(&state.running);
    running.store(true, Ordering::SeqCst);

    // 启动扫描线程
    let thread_handle = thread::spawn(move || {
        let mut code_buffer = String::new();
        let mut buf = [0u8; 8]; // HID 键盘报告通常是 8 字节

        while running.load(Ordering::SeqCst) {
            // 尝试读取数据，超时 100ms
            match handle.read_interrupt(endpoint_address, &mut buf, Duration::from_millis(100)) {
                Ok(len) if len > 0 => {
                    let decoded = decode_hid_data(&buf[..len]);
                    code_buffer.push_str(&decoded);

                    // 检查是否有完整的扫描结果（以换行符结束）
                    while let Some(pos) = code_buffer.find('\n') {
                        let code = code_buffer[..pos].to_string();
                        code_buffer = code_buffer[pos + 1..].to_string();

                        if !code.is_empty() {
                            // 发送扫描结果到前端
                            let _ = app.emit(
                                "scanner-data",
                                serde_json::json!({
                                    "code": 0,
                                    "data": code
                                }),
                            );
                        }
                    }
                }
                Ok(_) => {}
                Err(rusb::Error::Timeout) => {
                    // 超时是正常的，继续等待
                }
                Err(e) => {
                    eprintln!("扫码枪读取错误: {}", e);
                    // 发送错误事件
                    let _ = app.emit(
                        "scanner-data",
                        serde_json::json!({
                            "code": 1,
                            "error": format!("读取错误: {}", e)
                        }),
                    );
                    break;
                }
            }
        }

        // 释放接口
        let _ = handle.release_interface(0);

        #[cfg(target_os = "linux")]
        {
            let _ = handle.attach_kernel_driver(0);
        }
    });

    state.thread_handle = Some(thread_handle);

    Ok(())
}

/// 停止扫码枪监听
#[tauri::command]
pub fn stop_scanner() -> Result<(), String> {
    let mut state = SCANNER_STATE.lock();

    state.running.store(false, Ordering::SeqCst);

    if let Some(handle) = state.thread_handle.take() {
        handle
            .join()
            .map_err(|_| "等待扫描线程结束失败".to_string())?;
    }

    Ok(())
}

/// 检查扫码枪是否正在运行
#[tauri::command]
pub fn is_scanner_running() -> bool {
    SCANNER_STATE.lock().running.load(Ordering::SeqCst)
}
