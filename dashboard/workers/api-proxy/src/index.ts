// =============================================================================
// Lead Gen Rentals - Cloudflare Worker API Proxy
// =============================================================================
// Reverse-proxy that maps clean URLs to the Supabase Edge Function backend.
//
//   leadgenrentals.com.au/api/v1/leads  →  <supabase>/functions/v1/api/leads
//   leadgenrentals.com.au/api/v1/quotes →  <supabase>/functions/v1/api/quotes
//   ...etc
//
// All headers (Authorization, Content-Type, etc.) are passed through as-is.
// The Supabase URL is never exposed to the end user.
// =============================================================================

export interface Env {
  SUPABASE_FUNCTION_URL: string; // e.g. https://xyz.supabase.co/functions/v1/api
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);

    // --- Health check ---
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: "leadgenrentals-api" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // --- Only allow /v1/* paths ---
    if (!url.pathname.startsWith("/v1/")) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "API routes are available under /v1/. See https://leadgenrentals.com.au/dashboard/api-docs for documentation.",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      );
    }

    // --- Build upstream URL ---
    // Strip "/v1" prefix and append the rest to the Supabase function URL.
    // /v1/leads?page=2  →  <SUPABASE_FUNCTION_URL>/leads?page=2
    const upstreamPath = url.pathname.slice("/v1".length); // e.g. "/leads" or "/leads/abc"
    const upstream = `${env.SUPABASE_FUNCTION_URL}${upstreamPath}${url.search}`;

    // --- Forward request ---
    const headers = new Headers(request.headers);
    // Remove Cloudflare-specific headers the backend doesn't need
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("cf-visitor");

    const upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.body,
    });

    // --- Build response ---
    const responseHeaders = new Headers(upstreamResponse.headers);
    // Ensure CORS headers are always set (even if backend omits them)
    for (const [key, value] of Object.entries(corsHeaders())) {
      responseHeaders.set(key, value);
    }
    // Remove any Supabase-specific headers that leak backend info
    responseHeaders.delete("x-sb-edge-function-id");
    responseHeaders.delete("sb-gateway-version");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}
