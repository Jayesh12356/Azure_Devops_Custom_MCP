#!/usr/bin/env bash
# Check Azure DevOps MCP streamable-http is up; optionally start it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${MCP_HOST:-127.0.0.1}"
PORT="${MCP_PORT:-3000}"
URL="http://${HOST}:${PORT}"

if curl -sf "${URL}/health" >/dev/null 2>&1; then
  echo "OK: MCP running at ${URL}/mcp"
  curl -sf "${URL}/health" | python3 -m json.tool 2>/dev/null || curl -sf "${URL}/health"
  exit 0
fi

echo "MCP not running on ${URL} (ECONNREFUSED — this is what Cursor shows)"
if [[ "${1:-}" == "--start" ]]; then
  echo "Starting in background..."
  nohup bash "$ROOT/scripts/start-streamable.sh" >> "$ROOT/mcp-server.log" 2>&1 &
  sleep 2
  if curl -sf "${URL}/health" >/dev/null; then
    echo "OK: started — ${URL}/mcp"
    exit 0
  fi
  echo "Failed to start — see $ROOT/mcp-server.log"
  exit 1
fi

echo ""
echo "Cursor: enable azure-devops-streamable (needs this server), or azure-devops-stdio (no server — disable streamable if unused)"
echo "Start manually:"
echo "  cd $ROOT && npm run start:streamable"
echo "Or auto-start:"
echo "  $0 --start"
exit 1
