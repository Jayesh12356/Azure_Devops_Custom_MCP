#!/usr/bin/env bash
# Start Azure DevOps MCP for Cursor streamable-http (per-user PAT via X-ADO-PAT header).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${ADO_ORG:?ADO_ORG is required — set in .env.local}"

export MCP_TRANSPORT="${MCP_TRANSPORT:-streamable-http}"
export MCP_AUTHENTICATION="${MCP_AUTHENTICATION:-request-pat}"
export NODE_TLS_REJECT_UNAUTHORIZED="${NODE_TLS_REJECT_UNAUTHORIZED:-0}"
export MCP_HOST="${MCP_HOST:-127.0.0.1}"
export MCP_PORT="${MCP_PORT:-3000}"

# request-pat: PAT comes from client headers — server token optional
if [[ "${MCP_AUTHENTICATION}" == "request-pat" ]]; then
  unset ADO_MCP_AUTH_TOKEN 2>/dev/null || true
else
  : "${ADO_MCP_AUTH_TOKEN:?ADO_MCP_AUTH_TOKEN required when MCP_AUTHENTICATION is not request-pat}"
fi

NODE_BIN="${NODE_BIN:-$(command -v node)}"

# Build if needed
if [[ ! -f "$ROOT/dist/index.js" ]]; then
  echo "Building MCP server..."
  npm run build
fi

echo "Azure DevOps MCP (streamable-http + request-pat)"
echo "  URL:    http://${MCP_HOST}:${MCP_PORT}/mcp"
echo "  Health: http://${MCP_HOST}:${MCP_PORT}/health"
echo "  Cursor: set url + headers.X-ADO-PAT in .cursor/mcp.json"
echo ""

DOMAINS="${MCP_DOMAINS:-all}"

exec "$NODE_BIN" "$ROOT/dist/index.js" "$ADO_ORG" -d $DOMAINS
