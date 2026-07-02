# Frappe Agent Ecosystem + Azure DevOps MCP

This MCP server is the **delivery layer** for [Frappe-Agent-Skills](https://github.com/Jayesh12356/Frappe-Agent-Skills) app packs.

## Flow

```
Download pack → install.sh → prompt (Frappe skills) → git push (terminal) → ADO MCP (PR + pipeline) → human merge
```

## Per-user PAT (recommended)

Each developer sends their own PAT in `mcp.json` headers. ADO audit logs attribute actions to the real user.

```json
{
  "mcpServers": {
    "azure-devops": {
      "url": "https://azure-devops-mcp.example.com/mcp",
      "transport": "streamable-http",
      "headers": { "X-ADO-PAT": "YOUR_PERSONAL_PAT" }
    }
  }
}
```

Local dev: `http://127.0.0.1:3000/mcp` via `npm run start:http`.

## App packs (recommended)

```bash
cd /path/to/Frappe-Agent-Skills
./pack/install.sh budgeting --bench /path/to/frappe-bench --pat "$ADO_PAT"
./pack/install.sh invoice --bench /path/to/frappe-bench --pat "$ADO_PAT"  # merges second app
```

Or download a zip from the static site (`site/`) and run `./install.sh`.

Registry: `<bench>/.frappe-agent/packs.registry.json` — merged APP_REGISTRY for multi-app benches.

## Legacy tenant setup

```bash
./ecosystem/setup.sh procurement_contracting
```

Prefer app packs for New Energy Platform apps (`budgeting`, `invoice`, …).

## Tools used by `seven-hills-azure-delivery`

| Domain         | Tools                                                        |
| -------------- | ------------------------------------------------------------ |
| `repositories` | `repo_create_pull_request`, `repo_get_repo_by_name_or_id`, … |
| `pipelines`    | `pipelines_get_builds`, `pipelines_get_build_status`, …      |
| `work-items`   | `wit_create_work_item`, `wit_link_work_item_to_pull_request` |
| `core`         | `core_list_projects`                                         |

Filter: `-d core repositories pipelines work-items`

## Production (AKS)

1. Set ingress hostname in `deploy/kubernetes/ingress.yaml` and `configmap.yaml` (`MCP_ALLOWED_HOSTS`).
2. Apply manifests: `kubectl apply -f deploy/kubernetes/`
3. Set `MCP_AUTHENTICATION=request-pat` (already in configmap).
4. Wire production URL into `Frappe-Agent-Skills/packs/project.nep.json` and `site/config.js`.

See [DEPLOYMENT.md](./DEPLOYMENT.md).

## PAT scopes

Code (Read & Write), Pull Request (Read & Write), Build (Read).
