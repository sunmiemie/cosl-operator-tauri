import os
import argparse

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
