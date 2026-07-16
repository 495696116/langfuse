import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { GetObservationsV1Response } from "@/src/features/public-api/types/observations";
import {
  OBSERVATIONS_V1_DEPRECATION,
  SCORES_DEPRECATION,
  SESSIONS_DEPRECATION,
  TRACES_DEPRECATION,
} from "@/src/features/public-api/server/deprecations";

// LFE-10895: legacy (v3-data-model) endpoints attach a top-level `_deprecation`
// object so coding agents get a self-correcting migration signal.
describe("public API deprecation signal", () => {
  let auth: string;

  beforeAll(async () => {
    const fixture = await createOrgProjectAndApiKey();
    auth = fixture.auth;
  });

  it("attaches `_deprecation` to the legacy GET /observations list response", async () => {
    const response = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect(response.body._deprecation).toEqual(OBSERVATIONS_V1_DEPRECATION);
    expect(response.body._deprecation?.replacement).toBe(
      "GET /api/public/v2/observations",
    );
  });

  it("omits optional `_deprecation` fields that have no value", async () => {
    const response = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations",
      undefined,
      auth,
    );

    // docsUrl / sunsetAt are omitted, never emitted as null.
    expect(response.body._deprecation).not.toHaveProperty("docsUrl");
    expect(response.body._deprecation).not.toHaveProperty("sunsetAt");
  });

  // Scores v2 uses a non-strict response schema, so this also proves the
  // injection works without a schema edit on the response type.
  it("attaches `_deprecation` to the legacy GET /v2/scores list response", async () => {
    const response = await makeAPICall(
      "GET",
      "/api/public/v2/scores",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect((response.body as Record<string, unknown>)._deprecation).toEqual(
      SCORES_DEPRECATION,
    );
  });

  // Traces is being removed; it points at observations v2 as a soft
  // replacement for reading span/trace data in v4.
  it("attaches `_deprecation` with the observations-v2 soft replacement to legacy GET /traces", async () => {
    const response = await makeAPICall(
      "GET",
      "/api/public/traces",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    const deprecation = (response.body as Record<string, unknown>)._deprecation;
    expect(deprecation).toEqual(TRACES_DEPRECATION);
    expect((deprecation as Record<string, unknown>).replacement).toBe(
      "GET /api/public/v2/observations",
    );
  });

  // Sessions is deprecated and not replaced, so `_deprecation` is message-only.
  it("attaches a replacement-less `_deprecation` to legacy GET /sessions", async () => {
    const response = await makeAPICall(
      "GET",
      "/api/public/sessions",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    const deprecation = (response.body as Record<string, unknown>)._deprecation;
    expect(deprecation).toEqual(SESSIONS_DEPRECATION);
    expect(deprecation).not.toHaveProperty("replacement");
  });
});
