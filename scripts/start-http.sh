#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${ADO_ORG:?ADO_ORG is required}"

export MCP_TRANSPORT="${MCP_TRANSPORT:-streamable-http}"
export MCP_AUTHENTICATION="${MCP_AUTHENTICATION:-request-pat}"
export NODE_TLS_REJECT_UNAUTHORIZED="${NODE_TLS_REJECT_UNAUTHORIZED:-0}"
export MCP_HOST="${MCP_HOST:-127.0.0.1}"
export MCP_PORT="${MCP_PORT:-3000}"

if [[ "${MCP_AUTHENTICATION}" == "request-pat" ]]; then
  unset ADO_MCP_AUTH_TOKEN 2>/dev/null || true
else
  : "${ADO_MCP_AUTH_TOKEN:?ADO_MCP_AUTH_TOKEN is required when MCP_AUTHENTICATION is not request-pat}"
fi

NODE_BIN="${NODE_BIN:-$(command -v node)}"

echo "Starting Azure DevOps MCP (${MCP_TRANSPORT}) at http://${MCP_HOST}:${MCP_PORT}"
echo "Streamable endpoint: http://${MCP_HOST}:${MCP_PORT}/mcp"
echo "Health: http://${MCP_HOST}:${MCP_PORT}/health"

exec "$NODE_BIN" "$ROOT/dist/index.js"
