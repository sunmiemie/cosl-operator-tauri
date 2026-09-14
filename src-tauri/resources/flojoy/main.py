import os
import sys
import argparse

# Flojoy 在开发环境直接从 src-tauri/resources 运行。运行测试流时若 Python
# 在该目录生成/更新 __pycache__，Tauri dev 会把它误判为资源代码变化并重启
# 整个客户端。这里在任何 Flojoy/captain 模块导入前禁用字节码落盘，确保无论
# 后端由客户端还是调试脚本启动，都不会因执行节点触发客户端热重启。
sys.dont_write_bytecode = True

import uvicorn

from captain.utils.logger import load_log_level_from_config

__ignore_list = ["venv"]


if __name__ == "__main__":
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="Flojoy Backend Server")
    parser.add_argument("--port", type=int, default=5392, help="Server port")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Server host")
    args = parser.parse_args()
    
    log_level = load_log_level_from_config().lower()
    is_dev = os.environ.get("DEPLOY_STATUS", "prod") == "dev"
    
    print(f"[Flojoy] Starting backend on {args.host}:{args.port}")
    
    uvicorn.run(
        "captain.main:app",
        host=args.host,
        port=args.port,
        log_level=log_level,
        reload=is_dev,
        reload_excludes=[
            os.path.join(os.getcwd(), p)
            for p in __ignore_list
            if os.path.exists(os.path.join(os.getcwd(), p))
        ],
    )
