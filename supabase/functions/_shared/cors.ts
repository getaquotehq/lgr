// CORS origin is configurable via the ALLOWED_ORIGIN env var.
// Defaults to "*" so the public REST API remains accessible.
const _origin =
  (typeof Deno !== "undefined" && Deno.env?.get?.("ALLOWED_ORIGIN")) || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": _origin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
