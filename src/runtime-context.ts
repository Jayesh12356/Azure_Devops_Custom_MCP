// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { loadServerConfig } from "./server-config.js";

const config = loadServerConfig();

export const serverConfig = config;
export const orgName = config.organization;
export const enabledDomains = config.enabledDomains;
