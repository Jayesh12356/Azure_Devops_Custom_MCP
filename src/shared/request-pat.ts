// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { IncomingHttpHeaders } from "node:http";

/**
 * Extracts an Azure DevOps PAT from incoming MCP HTTP request headers.
 *
 * Supported headers:
 * - Authorization: Bearer <pat>
 * - Authorization: Basic <base64(:pat)>
 * - X-ADO-PAT: <pat>
 * - X-Azure-DevOps-PAT: <pat>
 */
export function extractPatFromHeaders(headers: IncomingHttpHeaders): string | undefined {
  const customHeader = headers["x-ado-pat"] ?? headers["x-azure-devops-pat"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }

  const authorization = headers.authorization;
  if (!authorization || typeof authorization !== "string") {
    return undefined;
  }

  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token || undefined;
  }

  if (authorization.startsWith("Basic ")) {
    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const token = decoded.includes(":") ? decoded.split(":").slice(1).join(":") : decoded;
    return token.trim() || undefined;
  }

  return undefined;
}

export function maskPat(pat: string): string {
  if (pat.length <= 4) {
    return "****";
  }
  return `****${pat.slice(-4)}`;
}
