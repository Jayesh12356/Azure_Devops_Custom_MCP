// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { DomainsManager } from "./shared/domains.js";
import { packageVersion } from "./version.js";

export type TransportMode = "stdio" | "streamable-http" | "sse" | "all";

export type AuthenticationType = "interactive" | "azcli" | "env" | "envvar" | "pat" | "request-pat";

export interface ServerConfig {
  organization: string;
  orgUrl: string;
  isOnPremise: boolean;
  authentication: AuthenticationType;
  tenant?: string;
  domains: string[];
  enabledDomains: Set<string>;
  transport: TransportMode;
  host: string;
  port: number;
  allowedHosts?: string[];
}

function isGitHubCodespaceEnv(): boolean {
  return process.env.CODESPACES === "true" && !!process.env.CODESPACE_NAME;
}

function resolveOrganizationUrl(organization: string): { orgUrl: string; isOnPremise: boolean } {
  const isOnPremise = organization.startsWith("http://") || organization.startsWith("https://");
  const orgUrl = isOnPremise ? organization : `https://dev.azure.com/${organization}`;
  return { orgUrl, isOnPremise };
}

function resolveDefaultAuthentication(transport: TransportMode): AuthenticationType {
  if (process.env.MCP_AUTHENTICATION) {
    return process.env.MCP_AUTHENTICATION as AuthenticationType;
  }
  if (transport !== "stdio") {
    if (process.env.MCP_REQUIRE_USER_PAT === "true" || process.env.MCP_AUTHENTICATION === "request-pat") {
      return "request-pat";
    }
    if (process.env.ADO_MCP_AUTH_TOKEN) {
      return "envvar";
    }
    if (process.env.PERSONAL_ACCESS_TOKEN) {
      return "pat";
    }
    // Default for shared HTTP deployments: each client supplies its own PAT per session.
    return "request-pat";
  }
  return isGitHubCodespaceEnv() ? "azcli" : "interactive";
}

function parseAllowedHosts(): string[] | undefined {
  const value = process.env.MCP_ALLOWED_HOSTS?.trim();
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

export function loadServerConfig(): ServerConfig {
  const defaultTransport = (process.env.MCP_TRANSPORT as TransportMode | undefined) ?? "stdio";
  const defaultHost = process.env.MCP_HOST ?? (defaultTransport === "stdio" ? "127.0.0.1" : "0.0.0.0");
  const defaultPort = process.env.MCP_PORT ? Number.parseInt(process.env.MCP_PORT, 10) : 3000;

  const argv = yargs(hideBin(process.argv))
    .scriptName("mcp-server-azuredevops")
    .usage("Usage: $0 <organization> [options]")
    .version(packageVersion)
    .command("$0 [organization] [options]", "Azure DevOps MCP Server", (yargs) => {
      yargs.positional("organization", {
        describe: "Azure DevOps organization name or on-premise collection URL (or set ADO_ORG)",
        type: "string",
      });
    })
    .option("domains", {
      alias: "d",
      describe: "Domain(s) to enable: 'all' for everything, or specific domains like 'repositories builds work'. Defaults to 'all'.",
      type: "string",
      array: true,
      default: "all",
    })
    .option("authentication", {
      alias: "a",
      describe: "Type of authentication to use. HTTP transports default to envvar/pat when unset.",
      type: "string",
      choices: ["interactive", "azcli", "env", "envvar", "pat", "request-pat"],
    })
    .option("tenant", {
      alias: "t",
      describe: "Azure tenant ID (optional, applied when using 'interactive' and 'azcli' type of authentication)",
      type: "string",
    })
    .option("transport", {
      alias: "T",
      describe: "MCP transport mode: stdio (default), streamable-http, sse, or all (streamable-http + legacy sse)",
      type: "string",
      choices: ["stdio", "streamable-http", "sse", "all"],
      default: defaultTransport,
    })
    .option("host", {
      alias: "H",
      describe: "HTTP bind host (ignored for stdio transport)",
      type: "string",
      default: defaultHost,
    })
    .option("port", {
      alias: "p",
      describe: "HTTP listen port (ignored for stdio transport)",
      type: "number",
      default: defaultPort,
    })
    .help()
    .parseSync();

  const organization = (argv.organization as string | undefined) ?? process.env.ADO_ORG;
  if (!organization) {
    throw new Error("Azure DevOps organization is required. Pass it as an argument or set ADO_ORG.");
  }

  const transport = argv.transport as TransportMode;
  const authentication = (argv.authentication as AuthenticationType | undefined) ?? resolveDefaultAuthentication(transport);
  const { orgUrl, isOnPremise } = resolveOrganizationUrl(organization);
  const domainsManager = new DomainsManager(argv.domains as string[]);

  return {
    organization,
    orgUrl,
    isOnPremise,
    authentication,
    tenant: argv.tenant as string | undefined,
    domains: argv.domains as string[],
    enabledDomains: domainsManager.getEnabledDomains(),
    transport,
    host: argv.host as string,
    port: argv.port as number,
    allowedHosts: parseAllowedHosts(),
  };
}
