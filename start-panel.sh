#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST="127.0.0.1"
PORT="3000"
CONFIG=""
NO_BUILD=0

usage() {
  cat <<'EOF'
用法: ./start-panel.sh [--host <地址>] [--port <端口>] [--config <路径>] [--no-build]

默认绑定 127.0.0.1:3000。面板没有身份认证，暴露到非回环地址前请自行增加访问控制。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      [[ $# -ge 2 ]] || { echo "缺少 --host 的值" >&2; exit 1; }
      HOST="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { echo "缺少 --port 的值" >&2; exit 1; }
      PORT="$2"
      shift 2
      ;;
    --config)
      [[ $# -ge 2 ]] || { echo "缺少 --config 的值" >&2; exit 1; }
      CONFIG="$2"
      shift 2
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 18 或更高版本。" >&2
  exit 1
fi

if [[ ! -f "node_modules/typescript/bin/tsc" ]]; then
  echo "依赖尚未安装，请先在项目目录执行 npm install。" >&2
  exit 1
fi

NEEDS_BUILD=0
if [[ ! -f "dist/server.js" ]]; then
  NEEDS_BUILD=1
elif [[ -n "$(find src -type f -name '*.ts' -newer dist/server.js -print -quit)" ]]; then
  NEEDS_BUILD=1
fi

if [[ "$NO_BUILD" -eq 0 && "$NEEDS_BUILD" -eq 1 ]]; then
  echo "正在编译 TypeScript..."
  node node_modules/typescript/bin/tsc -p tsconfig.json
fi

ARGS=(dist/server.js --host "$HOST" --port "$PORT")
if [[ -n "$CONFIG" ]]; then
  ARGS+=(--config "$CONFIG")
fi

if [[ ! "$HOST" =~ ^127\. && "$HOST" != "localhost" && "$HOST" != "::1" && "$HOST" != "[::1]" ]]; then
  echo "警告: 面板没有身份认证。绑定到 $HOST 后，同一网络中的其他设备可能访问控制面板。" >&2
fi

echo "启动面板，按 Ctrl+C 停止。"
exec node "${ARGS[@]}"
