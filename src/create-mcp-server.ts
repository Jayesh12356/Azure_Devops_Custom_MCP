// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBearerHandler, getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";

import { createAuthenticator } from "./auth.js";
import { logger } from "./logger.js";
import { getOrgTenant } from "./org-tenants.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import type { ServerConfig } from "./server-config.js";

export interface CreateMcpServerOptions {
  /** Per-session PAT supplied by the MCP client (HTTP request-pat mode). */
  userPat?: string;
}

export async function createMcpServer(config: ServerConfig, options: CreateMcpServerOptions = {}): Promise<McpServer> {
  const usesUserPat = !!options.userPat;
  const effectiveAuthentication = usesUserPat ? "envvar" : config.authentication;

  if (config.authentication === "request-pat" && !usesUserPat) {
    throw new Error("request-pat authentication requires a user PAT for the session.");
  }

  logger.info("Creating Azure DevOps MCP Server", {
    organization: config.organization,
    organizationUrl: config.orgUrl,
    authentication: usesUserPat ? "request-pat" : config.authentication,
    tenant: config.tenant,
    domains: config.domains,
    enabledDomains: Array.from(config.enabledDomains),
    transport: config.transport,
    version: packageVersion,
    userSuppliedPat: usesUserPat,
  });

  const server = new McpServer({
    name: "Azure DevOps MCP Server",
    version: packageVersion,
    icons: [
      {
        src: "https://cdn.vsassets.io/content/icons/favicon.ico",
      },
    ],
  });

  const userAgentComposer = new UserAgentComposer(packageVersion);
  server.server.oninitialized = () => {
    userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
  };

  const tenantId = (await getOrgTenant(config.organization)) ?? config.tenant;
  const authenticator = usesUserPat ? async () => options.userPat! : createAuthenticator(config.authentication, tenantId);

  if (effectiveAuthentication === "pat") {
    const basicValue = await authenticator();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers) {
        const headers = new Headers(init.headers as HeadersInit);
        if (headers.get("Authorization")?.startsWith("Bearer ")) {
          headers.set("Authorization", `Basic ${basicValue}`);
          init = { ...init, headers };
        }
      }
      return originalFetch(input, init);
    };
    logger.debug("PAT mode: global fetch interceptor installed to rewrite Bearer -> Basic auth headers");
  }

  configureAllTools(server, authenticator, getAzureDevOpsClient(config, authenticator, userAgentComposer, effectiveAuthentication), () => userAgentComposer.userAgent, config.enabledDomains);

  return server;
}

function getAzureDevOpsClient(config: ServerConfig, getAzureDevOpsToken: () => Promise<string>, userAgentComposer: UserAgentComposer, authentication: string): () => Promise<WebApi> {
  return async () => {
    const accessToken = await getAzureDevOpsToken();
    const authHandler =
      authentication === "pat"
        ? getPersonalAccessTokenHandler(Buffer.from(accessToken, "base64").toString("utf8").split(":").slice(1).join(":"))
        : authentication === "envvar" || config.isOnPremise
          ? getPersonalAccessTokenHandler(accessToken)
          : getBearerHandler(accessToken);

    return new WebApi(config.orgUrl, authHandler, undefined, {
      productName: "AzureDevOps.MCP",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
  };
}
