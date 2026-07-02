# Azure DevOps MCP - Kubernetes / Azure Deployment

Deploy the MCP server on Azure Kubernetes Service (AKS) with Streamable HTTP and legacy SSE support.

## Per-user PAT model (recommended)

Each developer generates their own Azure DevOps PAT and sends it to the shared MCP server on every new session. The server never stores a shared service account key.

**Benefits:**

- ADO audit logs show the real user for every tool call
- Permissions follow each user's PAT scopes
- You can revoke individual access without redeploying the server

**Server config:** `MCP_AUTHENTICATION=request-pat` (default for HTTP when no server PAT is set)

**Client config:** each user adds their PAT in `mcp.json` headers:

```json
{
  "mcpServers": {
    "azure-devops": {
      "url": "https://azure-devops-mcp.yourcompany.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "X-ADO-PAT": "YOUR_PERSONAL_PAT"
      }
    }
  }
}
```

Supported client headers:

- `X-ADO-PAT: <pat>`
- `Authorization: Bearer <pat>`
- `Authorization: Basic <base64(:pat)>`

The server logs session start events with the resolved ADO username (never the full PAT).

## Transport modes

| Mode              | CLI / env                                | Endpoints                                        |
| ----------------- | ---------------------------------------- | ------------------------------------------------ |
| `stdio` (default) | `--transport stdio`                      | stdin/stdout                                     |
| `streamable-http` | `--transport streamable-http`            | `GET/POST/DELETE /mcp`                           |
| `sse`             | `--transport sse`                        | `GET /mcp`, `POST /messages`                     |
| `all`             | `--transport all` or `MCP_TRANSPORT=all` | Streamable HTTP at `/mcp` + legacy SSE at `/sse` |

## Local HTTP test (per-user PAT)

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm install && npm run build

export ADO_ORG="https://dev.azure.com/your-org"
export MCP_TRANSPORT=streamable-http
export MCP_AUTHENTICATION=request-pat
export MCP_HOST=127.0.0.1
export MCP_PORT=3000
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Server has NO shared PAT
node dist/index.js

# Client sends their own PAT
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-ADO-PAT: YOUR_PERSONAL_PAT" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

Run automated checks: `npm run test:transports`

## Build and push container image (Azure Container Registry)

```bash
az login
az acr login --name YOUR_ACR_NAME

docker build -t YOUR_ACR_NAME.azurecr.io/azure-devops-mcp:latest .
docker push YOUR_ACR_NAME.azurecr.io/azure-devops-mcp:latest
```

## Deploy to AKS

1. Edit `deploy/kubernetes/configmap.yaml` — set `ADO_ORG`, `MCP_ALLOWED_HOSTS`, and keep `MCP_AUTHENTICATION=request-pat`.
2. Edit `deploy/kubernetes/deployment.yaml` — set your ACR image.
3. Edit `deploy/kubernetes/ingress.yaml` — set your hostname and TLS secret.
4. Do **not** put a shared PAT in Kubernetes secrets for per-user mode.

```bash
kubectl apply -f deploy/kubernetes/namespace.yaml
kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f deploy/kubernetes/secret.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/service.yaml
kubectl apply -f deploy/kubernetes/ingress.yaml
```

## Cursor client examples

**Shared HTTP server (each user uses their own PAT):**

```json
{
  "mcpServers": {
    "azure-devops": {
      "url": "https://azure-devops-mcp.example.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "X-ADO-PAT": "YOUR_PERSONAL_PAT"
      }
    }
  }
}
```

**Local stdio (PAT in env):**

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "/path/to/node",
      "args": ["/path/to/azure-devops-mcp/dist/index.js", "https://dev.azure.com/your-org", "--transport", "stdio", "--authentication", "envvar"],
      "env": {
        "ADO_MCP_AUTH_TOKEN": "YOUR_PERSONAL_PAT",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

See `mcp.json.example` in the repo root.

## Environment variables

| Variable                       | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `ADO_ORG`                      | Organization name or on-prem collection URL                       |
| `MCP_TRANSPORT`                | `stdio`, `streamable-http`, `sse`, or `all`                       |
| `MCP_HOST`                     | Bind address (`0.0.0.0` for containers)                           |
| `MCP_PORT`                     | HTTP port (default `3000`)                                        |
| `MCP_AUTHENTICATION`           | `request-pat` (per-user), `envvar`, `pat`, `azcli`, `interactive` |
| `MCP_REQUIRE_USER_PAT`         | Set `true` to force per-user PAT on HTTP                          |
| `ADO_MCP_AUTH_TOKEN`           | Server-side PAT only for shared `envvar` mode                     |
| `MCP_ALLOWED_HOSTS`            | Comma-separated allowed Host headers                              |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Set `0` for on-prem self-signed TLS                               |
| `LOG_LEVEL`                    | `error`, `warning`, `info`, `debug`, `verbose`                    |

## Notes

- **Per-user PAT** is the default for HTTP deployments without a server-side `ADO_MCP_AUTH_TOKEN`.
- Use **HTTPS** in production so user PATs are encrypted in transit.
- `MCP_TRANSPORT=all` is recommended for maximum client compatibility.
- Event resumability uses in-memory storage; run a single replica or add shared storage for HA.
- ADO audit trails attribute actions to each user's PAT; server logs also record session start with ADO username.

## Shared service-account mode (optional)

If you intentionally want one PAT for all users, set on the server:

```
MCP_AUTHENTICATION=envvar
ADO_MCP_AUTH_TOKEN=<shared-pat>
```

Clients then only need the URL with no PAT headers. This is **not** recommended when you need per-user monitoring.
