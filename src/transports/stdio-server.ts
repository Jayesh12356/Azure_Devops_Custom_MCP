// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer } from "../create-mcp-server.js";
import { logger } from "../logger.js";
import type { ServerConfig } from "../server-config.js";

export async function startStdioServer(config: ServerConfig): Promise<void> {
  const server = await createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Azure DevOps MCP stdio server started");
}
