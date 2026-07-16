import { type ApiDeprecationInfo } from "@langfuse/shared";

// Family-level deprecation signals for legacy (pre-v4-data-model) public API
// endpoints. Attach one via the `deprecation` field on
// createAuthedProjectAPIRoute; the response gets a top-level `_deprecation`
// key. `docsUrl`/`sunsetAt` are omitted until they have values. See LFE-10895.

export const OBSERVATIONS_V1_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated. Use GET /api/public/v2/observations instead.",
  replacement: "GET /api/public/v2/observations",
};

// Traces are being removed; observations v2 is the closest v4 read surface.
export const TRACES_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated and will be removed in a future release. In Langfuse v4, read span and trace data via GET /api/public/v2/observations.",
  replacement: "GET /api/public/v2/observations",
};

// Sessions are being removed with no replacement.
export const SESSIONS_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated and will be removed in a future release. It has no replacement.",
};

export const SCORES_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated. Use GET /api/public/v3/scores instead.",
  replacement: "GET /api/public/v3/scores",
};

export const METRICS_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated. Use GET /api/public/v2/metrics instead.",
  replacement: "GET /api/public/v2/metrics",
};

export const DATASET_RUNS_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated. Dataset runs are replaced by experiments; use GET /api/public/experiments instead.",
  replacement: "GET /api/public/experiments",
};

export const DATASET_RUN_ITEMS_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated. Dataset run items are replaced by experiment items; use GET /api/public/experiment-items instead.",
  replacement: "GET /api/public/experiment-items",
};

// Legacy create/update endpoints (trace, generation, span, event) → OpenTelemetry.
export const LEGACY_INGESTION_DEPRECATION: ApiDeprecationInfo = {
  message:
    "This endpoint is deprecated. Send data via the OpenTelemetry endpoint at POST /api/public/otel/v1/traces instead.",
  replacement: "POST /api/public/otel/v1/traces",
};

// Stamp a deprecation signal onto a JSON response body as the top-level
// `_deprecation` key. Non-object bodies (arrays, null, primitives) pass through
// unchanged so array/primitive responses are never corrupted.
export function attachDeprecation(
  body: unknown,
  deprecation: ApiDeprecationInfo | undefined,
): unknown {
  if (
    !deprecation ||
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return body;
  }
  return { ...body, _deprecation: deprecation };
}
