/* ---------------------------------------------------------------------------
 * Supabase client configuration (PUBLIC values only).
 *
 * The URL and the ANON (publishable) key are safe to ship in the browser -
 * they are protected by Row Level Security. NEVER put the service_role key
 * here or anywhere else on the frontend.
 *
 * These are read by the inline <script> on index.html, solar-leads.html and
 * fleet.html. For local dev you can override them with your own project's
 * values; in production they point at the live `lgr` project.
 * ------------------------------------------------------------------------- */
window.LGR_SUPABASE = {
  url:     "https://tgujjtllrrhpwkcmmqap.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWpqdGxscnJocHdrY21tcWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDIwNTksImV4cCI6MjA5OTk3ODA1OX0.Fu31FBRmqXXc14hjABpmKU0ctlj1CX8fgVhDYZ4yjJA"
};
