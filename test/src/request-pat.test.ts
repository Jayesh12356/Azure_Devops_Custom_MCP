// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { extractPatFromHeaders, maskPat } from "../../src/shared/request-pat";

describe("request-pat", () => {
  it("extracts PAT from X-ADO-PAT header", () => {
    expect(extractPatFromHeaders({ "x-ado-pat": "my-secret-pat" })).toBe("my-secret-pat");
  });

  it("extracts PAT from Bearer authorization header", () => {
    expect(extractPatFromHeaders({ authorization: "Bearer abc123token" })).toBe("abc123token");
  });

  it("extracts PAT from Basic authorization header", () => {
    const encoded = Buffer.from(":my-secret-pat").toString("base64");
    expect(extractPatFromHeaders({ authorization: `Basic ${encoded}` })).toBe("my-secret-pat");
  });

  it("returns undefined when no PAT is present", () => {
    expect(extractPatFromHeaders({})).toBeUndefined();
  });

  it("masks PAT values for logs", () => {
    expect(maskPat("abcdefghijklmnop")).toBe("****mnop");
  });
});
