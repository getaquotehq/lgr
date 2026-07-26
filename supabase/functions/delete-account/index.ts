import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(deletionPageHtml("Missing token", true), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(token)) {
      return new Response(deletionPageHtml("Invalid token", true), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: profile, error: lookupErr } = await adminClient
      .from("profiles")
      .select("id, full_name, deletion_notice_sent_at")
      .eq("deletion_token", token)
      .maybeSingle();

    if (lookupErr || !profile) {
      return new Response(
        deletionPageHtml(
          "This deletion link is invalid or has already been used.",
          true,
        ),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        },
      );
    }

    if (req.method === "GET") {
      return new Response(
        deletionPageHtml(
          `Are you sure you want to permanently delete your account${profile.full_name ? " (" + profile.full_name + ")" : ""}? This cannot be undone. All your data and leads will be permanently removed.`,
          false,
          token,
        ),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        },
      );
    }

    if (req.method === "POST") {
      const body = await req.formData().catch(() => null);
      const confirmToken = body?.get("token")?.toString();
      if (confirmToken !== token) {
        return new Response(deletionPageHtml("Invalid confirmation", true), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      }

      const userId = profile.id;

      const { error: deleteErr } =
        await adminClient.auth.admin.deleteUser(userId);
      if (deleteErr) {
        console.error("delete-account error:", deleteErr.message);
        return new Response(
          deletionPageHtml(
            "Something went wrong deleting your account. Please contact support.",
            true,
          ),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "text/html; charset=utf-8",
            },
          },
        );
      }

      return new Response(
        deletionPageHtml(
          "Your account has been permanently deleted. You can close this page.",
          false,
        ),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        },
      );
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(
      deletionPageHtml("An unexpected error occurred.", true),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
});

function deletionPageHtml(
  message: string,
  isError: boolean,
  confirmToken?: string,
): string {
  const confirmForm = confirmToken
    ? `<form method="POST" style="margin-top:24px">
        <input type="hidden" name="token" value="${confirmToken}">
        <button type="submit" style="background:#b91c1c;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">
          Yes, Delete My Account Forever
        </button>
      </form>
      <p style="margin-top:16px;font-size:13px;color:#888">If you do not want to delete your account, simply close this page.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete Account - LeadGenRentalsHQ</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f3f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
  h1 { font-size: 20px; margin-bottom: 16px; color: ${isError ? "#b91c1c" : "#121826"}; }
  p { font-size: 14px; color: #555; line-height: 1.6; }
</style>
</head>
<body>
<div class="card">
  <h1>${isError ? "Error" : confirmToken ? "Delete Your Account" : "Account Deleted"}</h1>
  <p>${message}</p>
  ${confirmForm}
</div>
</body>
</html>`;
}
