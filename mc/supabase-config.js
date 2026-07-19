/* ---------------------------------------------------------------------------
 * lgr-mc (Lead Gen Rentals - Mission Control) Supabase configuration.
 *
 * PUBLIC values only. The URL + ANON (publishable) key are safe in the browser:
 * access is enforced by Row Level Security. The admin panel signs in with a
 * real Supabase Auth user (an "authenticated" session), and RLS grants that
 * session full CRUD. NEVER put the service_role key here - it bypasses RLS and
 * would hand the whole database to anyone who views source.
 *
 * This is a SEPARATE deployment from the public site. It points
 * at the same LGR Supabase project (tgujjtllrrhpwkcmmqap) as the public lgr
 * site - intentional (one business, one database) - but it is its own app, its
 * own hosting, and its own auth (admin users, not anon).
 *
 * For local dev / a different project, override url + anonKey below (or inject
 * them at deploy time - see mc/README.md).
 * ------------------------------------------------------------------------- */
window.LGR_MC_SUPABASE = {
  url:     "https://tgujjtllrrhpwkcmmqap.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWpqdGxscnJocHdrY21tcWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDIwNTksImV4cCI6MjA5OTk3ODA1OX0.Fu31FBRmqXXc14hjABpmKU0ctlj1CX8fgVhDYZ4yjJA"
};
