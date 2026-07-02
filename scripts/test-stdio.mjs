import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverJs = path.join(root, "dist/index.js");
const org = process.env.ADO_ORG;
const token = process.env.ADO_MCP_AUTH_TOKEN;

if (!org || !token) {
  console.error("ADO_ORG and ADO_MCP_AUTH_TOKEN must be set");
  process.exit(1);
}

const child = spawn(process.execPath, [serverJs, org, "--transport", "stdio", "--authentication", "envvar"], {
  env: {
    ...process.env,
    ADO_MCP_AUTH_TOKEN: token,
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "0",
  },
  stdio: ["pipe", "pipe", "inherit"],
});

const rl = createInterface({ input: child.stdout });
let sawTools = false;

const send = (message) => {
  child.stdin.write(`${JSON.stringify(message)}\n`);
};

const timeout = setTimeout(() => {
  console.error("ERROR: stdio test timed out");
  child.kill();
  process.exit(1);
}, 30000);

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    return;
  }

  if (payload.id === 1 && payload.result) {
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 });
  }

  if (payload.id === 2) {
    const tools = JSON.stringify(payload.result ?? payload);
    sawTools = tools.includes("core_list_project");
    clearTimeout(timeout);
    child.kill();

    if (sawTools) {
      console.log("PASS: stdio tools/list returned Azure DevOps tools");
      process.exit(0);
    }

    console.error("WARN: stdio responded but core_list_projects not found");
    console.error(tools.slice(0, 500));
    process.exit(1);
  }
});

child.on("exit", (code) => {
  if (!sawTools) {
    console.error(`ERROR: stdio server exited early with code ${code ?? "unknown"}`);
    process.exit(code ?? 1);
  }
});

send({
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "transport-test", version: "1.0.0" },
  },
  id: 1,
});
