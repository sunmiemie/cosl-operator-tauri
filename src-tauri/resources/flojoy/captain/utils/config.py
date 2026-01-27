from captain.internal.manager import Manager, TSManager

manager = Manager()
"""
MANAGER INSTANCE
___________________
Used for storing the current topology and websocket connections,
bridge between workers, topology, and more.
"""

ts_manager = TSManager()
"""
TEST SEQUENCER MANAGER INSTANCE
___________________
Used for communicating with the Test Sequencer UI
"""

# TODO - get from env variables
# 注意: allow_credentials=True 时不能使用 "*"，必须明确指定允许的源
origins = [
    "http://localhost:5391",
    "http://localhost:1420",   # Tauri 开发模式
    "http://127.0.0.1:1420",
    "http://localhost:5173",   # Vite 默认端口
    "tauri://localhost",       # Tauri 生产模式（Windows/Linux）
    "https://tauri.localhost", # Tauri 生产模式（macOS）
]
"""
CORS CONFIG
___________________
Used for CORS configuration
"""
