// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { logger } from "./logger.js";
import { serverConfig } from "./runtime-context.js";
import { startHttpServer } from "./transports/http-server.js";
import { startStdioServer } from "./transports/stdio-server.js";

async function main(): Promise<void> {
  if (serverConfig.transport === "stdio") {
    await startStdioServer(serverConfig);
    return;
  }

  if (serverConfig.authentication === "interactive") {
    logger.warn("Interactive authentication is not supported for HTTP transports. Use request-pat (default), envvar, pat, or azcli.");
  }

  if (serverConfig.authentication === "request-pat") {
    logger.info("HTTP server running in per-user PAT mode. Each client must send its own PAT in request headers.");
  }

  await startHttpServer(serverConfig);
}

main().catch((error) => {
  logger.error("Fatal error in main():", error);
  process.exit(1);
});
