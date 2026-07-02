// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer } from "../create-mcp-server.js";
import { logger } from "../logger.js";
import { logMcpSessionAudit } from "../session-audit.js";
import type { ServerConfig, TransportMode } from "../server-config.js";
import { InMemoryEventStore } from "../shared/in-memory-event-store.js";
import { extractPatFromHeaders } from "../shared/request-pat.js";

type ActiveTransport = StreamableHTTPServerTransport | SSEServerTransport;

function shouldEnableStreamableHttp(mode: TransportMode): boolean {
  return mode === "streamable-http" || mode === "all";
}

function shouldEnableSse(mode: TransportMode): boolean {
  return mode === "sse" || mode === "all";
}

function requiresUserPat(config: ServerConfig): boolean {
  return config.authentication === "request-pat";
}

function jsonRpcError(res: import("express").Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message,
    },
    id: null,
  });
}

function unauthorizedPatResponse(res: import("express").Response): void {
  jsonRpcError(res, 401, "Unauthorized: Provide your Azure DevOps PAT via Authorization: Bearer <pat>, Authorization: Basic <base64(:pat)>, or X-ADO-PAT header.");
}

export async function startHttpServer(config: ServerConfig): Promise<Server> {
  const app = createMcpExpressApp({
    host: config.host,
    allowedHosts: config.allowedHosts,
  });

  const transports: Record<string, ActiveTransport> = {};

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "azure-devops-mcp",
      transport: config.transport,
      authentication: config.authentication,
      userPatRequired: requiresUserPat(config),
    });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({ status: "ready" });
  });

  if (shouldEnableStreamableHttp(config.transport)) {
    app.all("/mcp", async (req, res) => {
      logger.debug(`Received ${req.method} request to /mcp`);
      try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport | undefined;

        if (sessionId && transports[sessionId]) {
          const existingTransport = transports[sessionId];
          if (existingTransport instanceof StreamableHTTPServerTransport) {
            transport = existingTransport;
          } else {
            jsonRpcError(res, 400, "Bad Request: Session exists but uses a different transport protocol");
            return;
          }
        } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
          const userPat = extractPatFromHeaders(req.headers);
          if (requiresUserPat(config) && !userPat) {
            unauthorizedPatResponse(res);
            return;
          }

          let pendingPat = userPat;
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore: new InMemoryEventStore(),
            onsessioninitialized: (initializedSessionId) => {
              logger.info(`Streamable HTTP session initialized: ${initializedSessionId}`);
              if (transport) {
                transports[initializedSessionId] = transport;
              }
              if (pendingPat) {
                void logMcpSessionAudit(config.orgUrl, pendingPat, initializedSessionId, "streamable-http");
                pendingPat = undefined;
              }
            },
          });

          transport.onclose = () => {
            const sid = transport?.sessionId;
            if (sid && transports[sid]) {
              logger.info(`Closing streamable HTTP transport for session ${sid}`);
              delete transports[sid];
            }
          };

          const server = await createMcpServer(config, userPat ? { userPat } : {});
          await server.connect(transport);
        } else {
          jsonRpcError(res, 400, "Bad Request: No valid session ID provided");
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error("Error handling streamable HTTP MCP request:", error);
        if (!res.headersSent) {
          jsonRpcError(res, 500, "Internal server error");
        }
      }
    });
  }

  if (shouldEnableSse(config.transport)) {
    const ssePath = config.transport === "sse" ? "/mcp" : "/sse";
    const messagesPath = config.transport === "sse" ? "/messages" : "/messages";

    app.get(ssePath, async (req, res) => {
      logger.debug(`Received GET request to ${ssePath} (legacy SSE transport)`);
      try {
        const userPat = extractPatFromHeaders(req.headers);
        if (requiresUserPat(config) && !userPat) {
          res.status(401).send("Unauthorized: Provide your Azure DevOps PAT in request headers.");
          return;
        }

        const transport = new SSEServerTransport(messagesPath, res);
        transports[transport.sessionId] = transport;

        transport.onclose = () => {
          logger.info(`Closing legacy SSE transport for session ${transport.sessionId}`);
          delete transports[transport.sessionId];
        };

        res.on("close", () => {
          delete transports[transport.sessionId];
        });

        const server = await createMcpServer(config, userPat ? { userPat } : {});
        await server.connect(transport);

        if (userPat) {
          void logMcpSessionAudit(config.orgUrl, userPat, transport.sessionId, "sse");
        }

        logger.info(`Established legacy SSE stream with session ID: ${transport.sessionId}`);
      } catch (error) {
        logger.error("Error establishing legacy SSE stream:", error);
        if (!res.headersSent) {
          res.status(500).send("Error establishing SSE stream");
        }
      }
    });

    app.post(messagesPath, async (req, res) => {
      const sessionId = req.query.sessionId as string | undefined;
      if (!sessionId) {
        res.status(400).send("Missing sessionId parameter");
        return;
      }

      const existingTransport = transports[sessionId];
      if (!(existingTransport instanceof SSEServerTransport)) {
        if (existingTransport) {
          jsonRpcError(res, 400, "Bad Request: Session exists but uses a different transport protocol");
          return;
        }
        res.status(404).send("Session not found");
        return;
      }

      try {
        await existingTransport.handlePostMessage(req, res, req.body);
      } catch (error) {
        logger.error("Error handling legacy SSE POST request:", error);
        if (!res.headersSent) {
          res.status(500).send("Error handling request");
        }
      }
    });
  }

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const server = app.listen(config.port, config.host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(server);
    });
  });

  logger.info("Azure DevOps MCP HTTP server listening", {
    host: config.host,
    port: config.port,
    transport: config.transport,
    authentication: config.authentication,
    userPatRequired: requiresUserPat(config),
    endpoints: {
      health: "/health",
      ready: "/ready",
      streamableHttp: shouldEnableStreamableHttp(config.transport) ? "/mcp" : undefined,
      legacySse: shouldEnableSse(config.transport) ? (config.transport === "sse" ? "/mcp" : "/sse") : undefined,
      legacyMessages: shouldEnableSse(config.transport) ? "/messages" : undefined,
    },
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down HTTP server`);
    for (const sessionId of Object.keys(transports)) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        logger.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  return httpServer;
}
