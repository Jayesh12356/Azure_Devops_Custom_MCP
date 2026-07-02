// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { logger } from "./logger.js";
import { maskPat } from "./shared/request-pat.js";

interface ConnectionDataUser {
  id?: string;
  providerDisplayName?: string;
  customDisplayName?: string;
}

interface ConnectionDataResponse {
  authenticatedUser?: ConnectionDataUser;
}

/**
 * Resolves the Azure DevOps user for a PAT and logs a session audit entry.
 * ADO audit trails still attribute actions to the PAT owner; this adds server-side session logs.
 */
export async function logMcpSessionAudit(orgUrl: string, pat: string, sessionId: string, transport: string): Promise<void> {
  const baseLog = {
    sessionId,
    transport,
    patSuffix: maskPat(pat),
  };

  try {
    const credentials = Buffer.from(`:${pat}`).toString("base64");
    const response = await fetch(`${orgUrl}/_apis/connectionData?api-version=1.0`, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      logger.info("MCP session started (user lookup failed)", {
        ...baseLog,
        lookupStatus: response.status,
      });
      return;
    }

    const data = (await response.json()) as ConnectionDataResponse;
    const user = data.authenticatedUser;

    logger.info("MCP session started", {
      ...baseLog,
      adoUserId: user?.id,
      adoUserName: user?.providerDisplayName ?? user?.customDisplayName,
    });
  } catch (error) {
    logger.info("MCP session started (user lookup error)", {
      ...baseLog,
      lookupError: error instanceof Error ? error.message : String(error),
    });
  }
}
