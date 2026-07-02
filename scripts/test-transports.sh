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
: "${ADO_MCP_AUTH_TOKEN:?ADO_MCP_AUTH_TOKEN is required}"

USER_PAT="$ADO_MCP_AUTH_TOKEN"

export MCP_AUTHENTICATION="${MCP_AUTHENTICATION:-envvar}"
export NODE_TLS_REJECT_UNAUTHORIZED="${NODE_TLS_REJECT_UNAUTHORIZED:-0}"
export MCP_HOST="${MCP_HOST:-127.0.0.1}"
export MCP_PORT="${MCP_PORT:-3000}"

NODE_BIN="${NODE_BIN:-$(command -v node)}"
SERVER_JS="$ROOT/dist/index.js"

echo "==> Building (if needed)"
npm run build >/dev/null

echo "==> Testing streamable HTTP on http://${MCP_HOST}:${MCP_PORT}/mcp (per-user PAT via X-ADO-PAT)"
unset ADO_MCP_AUTH_TOKEN
MCP_TRANSPORT=streamable-http MCP_AUTHENTICATION=request-pat "$NODE_BIN" "$SERVER_JS" &
HTTP_PID=$!
trap 'kill "$HTTP_PID" 2>/dev/null || true' EXIT

for _ in {1..20}; do
  if curl -sf "http://${MCP_HOST}:${MCP_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

curl -sf "http://${MCP_HOST}:${MCP_PORT}/health" | tee /tmp/ado-mcp-health.json
echo

INIT_RESPONSE=$(curl -sS -D /tmp/ado-mcp-headers.txt -X POST "http://${MCP_HOST}:${MCP_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-ADO-PAT: ${USER_PAT}" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"transport-test","version":"1.0.0"}},"id":1}')

echo "$INIT_RESPONSE" | sed -n '1,3p'
echo

SESSION_ID=$(grep -i '^mcp-session-id:' /tmp/ado-mcp-headers.txt | awk '{print $2}' | tr -d '\r')
if [[ -z "$SESSION_ID" ]]; then
  echo "ERROR: streamable HTTP initialize did not return mcp-session-id"
  exit 1
fi

echo "Session ID: $SESSION_ID"

TOOLS_RESPONSE=$(curl -sS -X POST "http://${MCP_HOST}:${MCP_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -H "X-ADO-PAT: ${USER_PAT}" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}')

echo "$TOOLS_RESPONSE" | sed -n '1,3p'
echo

if echo "$TOOLS_RESPONSE" | grep -q 'core_list_project'; then
  echo "PASS: streamable HTTP tools/list returned Azure DevOps tools"
else
  echo "WARN: streamable HTTP responded but core_list_projects not found in payload"
fi

kill "$HTTP_PID" 2>/dev/null || true
trap - EXIT

echo "==> Testing stdio transport"
export ADO_MCP_AUTH_TOKEN="$USER_PAT"
export MCP_TRANSPORT=stdio
"$NODE_BIN" "$ROOT/scripts/test-stdio.mjs"

echo "All transport checks completed."
