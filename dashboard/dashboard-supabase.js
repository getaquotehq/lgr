// =============================================================================
// LeadGenRentalsHQ - Dashboard Client (UPDATED WITH AI SETTINGS FIXES)
// =============================================================================
// This file contains fixes for:
// 1. AI Settings form with all required fields
// 2. User type checking for prompt editing (internal vs external)
// 3. Quote follow-up automation settings
// 4. On-site appointment settings
// 5. Call-back settings
// =============================================================================

const SUPABASE_URL = "https://tgujjtllrrhpwkcmmqap.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWpqdGxscnJocHdrY21tcWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDIwNTksImV4cCI6MjA5OTk3ODA1OX0.Fu31FBRmqXXc14hjABpmKU0ctlj1CX8fgVhDYZ4yjJA";

// ─── SVG Icon Map ─────────────────────────────────────────────────────────────
const ICONS = {
  dashboard:       `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>`,
  briefcase:       `<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>`,
  kanban:          `<rect x="2" y="3" width="5" height="18" rx="1"/><rect x="9" y="3" width="5" height="12" rx="1"/><rect x="16" y="3" width="5" height="8" rx="1"/>`,
  users:           `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  file:            `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`,
  calendar:        `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  chart:           `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
  message:         `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  settings:        `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  spark:           `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  team:            `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  plus:            `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
  search:          `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
  "panel-left":    `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>`,
  "chevron-right": `<polyline points="9 18 15 12 9 6"/>`,
  logout:          `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`,
  menu:            `<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>`,
  sun:             `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`,
  moon:            `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`,
  trash:           `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>`,
  lock:            `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  edit:            `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
  mail:            `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`,
  phone:           `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>`,
  play:            `<polygon points="5 3 19 12 5 21 5 3"/>`,
  pause:           `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`,
  mic:             `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`,
  eye:             `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`,
  "external-link": `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
  clock:           `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  map:             `<polygon points="1 6 1 22 8 18 16 22 21 18 21 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>`,
  "map-pin":       `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>`,
  gift:            `<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`,
  "message-circle": `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
  refresh:           `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`,
  bell:              `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`,
  "arrow-left":      `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
  star:              `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
};

function renderIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const p = ICONS[el.dataset.icon];
    if (p) el.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${p}</svg>`;
  });
}

function updateThemeIcon() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const dark = document.documentElement.dataset.theme === "dark";
  const iconEl = document.getElementById("themeToggleIcon");
  if (iconEl) {
    iconEl.dataset.icon = dark ? "sun" : "moon";
    const p = ICONS[dark ? "sun" : "moon"];
    if (p) iconEl.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${p}</svg>`;
  }
}

// ─── Pipeline stage labels ────────────────────────────────────────────────────
const STAGE_LABELS = {
  new_lead:          "New Lead",
  follow_up:         "Qualifying",
  quote_in_progress: "Quote in Progress",
  quoted:            "Quoted",
  closed_won:        "Closed Won",
  closed_lost:       "Closed Lost",
};

const STAGE_FROM_LABEL = Object.fromEntries(
  Object.entries(STAGE_LABELS).map(([k, v]) => [v, k])
);

const DEFAULT_TAX_RATE = 10;

function stageLabel(dbVal) { return STAGE_LABELS[dbVal] || dbVal || "-"; }
function stageKey(label)   { return STAGE_FROM_LABEL[label] || label; }

// AI status helper: derive heat label from score, or use stored ai_status
function aiStatusFromScore(score) {
  if (score == null) return "new";
  if (score >= 75) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function aiStatusLabel(lead) {
  const status = lead.ai_status || aiStatusFromScore(lead.ai_score);
  const labels = { hot: "Hot", warm: "Warm", cold: "Cold", new: "New" };
  return labels[status] || status;
}

function aiStatusChipClass(lead) {
  const status = lead.ai_status || aiStatusFromScore(lead.ai_score);
  return "chip-" + (status || "new");
}

function aiScoreDisplay(lead) {
  if (lead.ai_score == null) return "-";
  const status = lead.ai_status || aiStatusFromScore(lead.ai_score);
  const labels = { hot: "Hot", warm: "Warm", cold: "Cold", new: "New" };
  return `${labels[status] || status} ${lead.ai_score}/100`;
}


// ─── Auth helper ──────────────────────────────────────────────────────────────
// getSession() returns the cached session and may contain an expired JWT.
// This helper checks expiry and refreshes the token when needed so that
// edge-function fetch() calls never send a stale token.
// Set forceRefresh=true after a 401 to guarantee a fresh token on retry.
async function getAccessToken(forceRefresh = false) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return null;

  if (forceRefresh) {
    const { data: { session: refreshed } } = await sb.auth.refreshSession();
    return refreshed?.access_token || null;
  }

  try {
    const parts = session.access_token.split(".");
    if (parts.length !== 3) throw new Error("malformed");
    // JWT uses base64url encoding; convert to standard base64 for atob()
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    const nowSec  = Math.floor(Date.now() / 1000);
    // If the token expires within the next 60 seconds, force a refresh
    if (payload.exp && payload.exp - nowSec <= 60) {
      const { data: { session: refreshed } } = await sb.auth.refreshSession();
      return refreshed?.access_token || null;
    }
  } catch (e) {
    // Decode failed - token may be corrupt; try refreshing instead of using it as-is
    console.warn("JWT decode check failed, refreshing token:", e);
    const { data: { session: refreshed } } = await sb.auth.refreshSession();
    return refreshed?.access_token || null;
  }

  return session.access_token;
}

// ─── Edge-function caller ─────────────────────────────────────────────────────
// Centralises token refresh, header injection, and response parsing so every
// call-site gets robust error handling with useful messages.
// Automatically retries once with a fresh token on 401 (Invalid JWT).

function edgeFetch(fnName, body, token) {
  return fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey":        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

async function edgeFn(fnName, body) {
  let token = await getAccessToken();
  if (!token) throw new Error("Not authenticated - please log in again.");

  let res = await edgeFetch(fnName, body, token);

  // On 401, force-refresh the token and retry once before giving up
  if (res.status === 401) {
    console.warn(`[edgeFn] ${fnName} returned 401, refreshing token and retrying…`);
    token = await getAccessToken(true);
    if (!token) throw new Error("Not authenticated - please log in again.");

    res = await edgeFetch(fnName, body, token);
  }

  // Read as text first so we can always inspect the raw body
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[edgeFn] ${fnName} returned non-JSON (HTTP ${res.status}):`, text);
    throw new Error(`Server error (HTTP ${res.status}). Check the browser console for details.`);
  }

  if (!res.ok || json.error) {
    const msg =
      (typeof json.error === "string" ? json.error : null) ||
      json.message || json.msg ||
      `Request failed (HTTP ${res.status})`;
    console.error(`[edgeFn] ${fnName} error (HTTP ${res.status}):`, json);
    throw new Error(msg);
  }

  return json;
}

// ─── State ────────────────────────────────────────────────────────────────────
let sb;
let currentUser      = null;
let currentCompanyId = null;
let currentConvId    = null;
let currentLeadId    = null;
let customFields     = [];
let allLeads         = [];
let dragLeadId       = null;
let authInitialized  = false;
let currentUserRole      = null;   // 'owner' | 'admin' | 'member'
let currentUserIsSuperAdmin = false; // platform-level super-admin (is_admin column)
let currentUserPerms = {};    // permissions from sales_reps
let realtimeChannel  = null;  // Supabase realtime subscription
let currentPageId    = null;  // Track which page is currently displayed
// ─── Pagination State ─────────────────────────────────────────────────────────
const PER_PAGE = 20;
let conversationsPage  = 0;
let leadsPage          = 0;
let quotesPage         = 0;
let appointmentsPage   = 0;
let salesPage          = 0;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  renderIcons();

  try {
    await waitFor(() => window.supabase, 10000);
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    toast("Failed to connect to authentication service. Please refresh.", true);
    console.error("Supabase init failed:", err);
    return;
  }

  if (localStorage.getItem("theme") === "dark") {
    document.documentElement.dataset.theme = "dark";
  }
  updateThemeIcon();

  // Set up auth state listener FIRST (before checking session)
  sb.auth.onAuthStateChange((event, session) => {
    // Handle password recovery flow - show reset modal
    if (event === "PASSWORD_RECOVERY") {
      currentUser = session?.user || null;
      showApp();
      // Show password reset modal after app loads
      setTimeout(() => showPasswordResetModal(), 500);
      authInitialized = true;
      return;
    }

    // Always handle explicit sign-in / sign-out events so the UI
    // updates immediately without requiring a page refresh.
    if (event === "SIGNED_IN" && session?.user) {
      // Detect a real sign-in (user was previously signed out) vs a
      // token refresh (user was already signed in).  Only navigate to
      // the dashboard on a real sign-in so token refreshes don't yank
      // the user back to the dashboard page.
      const wasSignedOut = !currentUser;
      currentUser = session.user;
      if (wasSignedOut) {
        authInitialized = true;
        showApp();
      }
      return;
    }

    if (event === "SIGNED_OUT") {
      currentUser = null;
      authInitialized = true;
      showAuth();
      return;
    }

    // Fallback for initial session check (runs only once on page load)
    if (authInitialized) return;
    authInitialized = true;
    
    if (session?.user) { 
      currentUser = session.user; 
      showApp(); 
    } else { 
      currentUser = null; 
      showAuth(); 
    }
  });

  // Then check existing session
  setTimeout(async () => {
    if (authInitialized) return;
    
    try {
      const { data: { session }, error } = await sb.auth.getSession();
      authInitialized = true;
      
      if (error) {
        console.error("Session check error:", error);
        showAuth();
        return;
      }
      
      if (session?.user) { 
        currentUser = session.user; 
        showApp(); 
      } else { 
        showAuth(); 
      }
    } catch (err) {
      console.error("Session check failed:", err);
      authInitialized = true;
      showAuth();
    }
  }, 100);

  // ── Auth ──────────────────────────────────────────────────────────────────

  // ── Turnstile (explicit rendering) ─────────────────────────────────────
  // We use ?render=explicit so Turnstile does NOT auto-render into every
  // .cf-turnstile div on load. Instead we render one widget at a time for
  // whichever auth form is visible, avoiding duplicate iframes and ensuring
  // the token is ready when the user submits.
  const _tsWidgets = {}; // formId → widgetId
  function renderTurnstileFor(formId) {
    const form = document.getElementById(formId);
    if (!form || !window.turnstile) return;
    const container = form.querySelector('.cf-turnstile');
    if (!container) return;
    if (_tsWidgets[formId] != null) {
      try { turnstile.reset(_tsWidgets[formId]); } catch (e) { console.warn('Turnstile reset failed, re-rendering:', e); delete _tsWidgets[formId]; renderTurnstileFor(formId); return; }
    } else {
      _tsWidgets[formId] = turnstile.render(container, {
        sitekey: container.dataset.sitekey,
        theme: container.dataset.theme || 'auto',
      });
    }
  }
  // Render login widget as soon as Turnstile SDK is ready
  window._initTurnstile = () => renderTurnstileFor('loginForm');
  if (window._turnstileReady) window._initTurnstile();

  const loginForm = document.getElementById("loginForm");
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    
    // Get Turnstile token
    const turnstileInput = loginForm.querySelector('[name="cf-turnstile-response"]');
    const cfToken = turnstileInput ? turnstileInput.value : "";
    if (!cfToken) {
      toast("Please complete the CAPTCHA verification.", true);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = "Signing in...";
    }
    emailInput && (emailInput.disabled = true);
    passwordInput && (passwordInput.disabled = true);
    
    try {
      // Verify Turnstile token server-side before authenticating
      const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-turnstile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ cf_turnstile_response: cfToken }),
      });
      if (!verifyRes.ok) {
        const verifyData = await verifyRes.json().catch(() => ({}));
        toast(verifyData.error || "CAPTCHA verification failed.", true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Sign In";
        }
        emailInput && (emailInput.disabled = false);
        passwordInput && (passwordInput.disabled = false);
        if (window.turnstile) turnstile.reset(loginForm.querySelector('.cf-turnstile'));
        return;
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email:    emailInput?.value || "",
        password: passwordInput?.value || "",
      });
      
      if (error) {
        // Map cryptic Supabase errors to user-friendly messages
        let msg = error.message;
        if (/rate.?limit/i.test(msg)) {
          msg = "Too many attempts. Please wait a few minutes and try again.";
        }
        toast(msg, true);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Sign In";
        }
        emailInput && (emailInput.disabled = false);
        passwordInput && (passwordInput.disabled = false);
        if (window.turnstile) turnstile.reset(loginForm.querySelector('.cf-turnstile'));
      } else if (data?.session?.user) {
        // Navigate immediately - don't wait for onAuthStateChange
        currentUser = data.session.user;
        authInitialized = true;
        showApp();
      }
    } catch (err) {
      toast("Login failed. Please try again.", true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || "Sign In";
      }
      emailInput && (emailInput.disabled = false);
      passwordInput && (passwordInput.disabled = false);
      if (window.turnstile) turnstile.reset(loginForm.querySelector('.cf-turnstile'));
    }
  });

  // ── Forgot Password ──────────────────────────────────────────────────────
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const backToLogin = document.getElementById("backToLogin");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");

  forgotPasswordLink?.addEventListener("click", () => {
    loginForm?.classList.add("hidden");
    forgotPasswordForm?.classList.remove("hidden");
    // Pre-fill email if already entered on login form
    const loginEmail = document.getElementById("loginEmail");
    const forgotEmail = document.getElementById("forgotEmail");
    if (loginEmail?.value && forgotEmail) forgotEmail.value = loginEmail.value;
    renderTurnstileFor('forgotPasswordForm');
  });

  backToLogin?.addEventListener("click", () => {
    forgotPasswordForm?.classList.add("hidden");
    loginForm?.classList.remove("hidden");
    renderTurnstileFor('loginForm');
  });

  forgotPasswordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = forgotPasswordForm.querySelector('button[type="submit"]');
    const emailInput = document.getElementById("forgotEmail");
    const email = (emailInput?.value || "").trim();

    if (!email) {
      toast("Please enter your email address.", true);
      return;
    }

    // Get Turnstile token (optional - server skips CAPTCHA verification
    // when CF_TURNSTILE_SECRET is not configured).
    const turnstileInput = forgotPasswordForm.querySelector('[name="cf-turnstile-response"]');
    const cfToken = turnstileInput ? turnstileInput.value : "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }

    const resetTurnstile = () => {
      if (window.turnstile) turnstile.reset(forgotPasswordForm.querySelector('.cf-turnstile'));
    };

    const onSuccess = () => {
      toast("Password reset link sent! Check your email.");
      setTimeout(() => {
        forgotPasswordForm?.classList.add("hidden");
        loginForm?.classList.remove("hidden");
      }, 2000);
    };

    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/dashboard.html",
      });

      if (error) {
        console.error("Password reset error:", error);
        toast(error.message || "Failed to send reset link. Please try again.", true);
        resetTurnstile();
        return;
      }

      onSuccess();
    } catch (err) {
      console.error("Password reset error:", err);
      toast("Failed to send reset link. Please try again.", true);
      resetTurnstile();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Reset Link";
      }
    }
  });

  document.getElementById("logoutButton")?.addEventListener("click", async () => {
    const btn = document.getElementById("logoutButton");
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = `<span>Logging out...</span>`;
    }
    
    try {
      authInitialized = false;
      await sb.auth.signOut();
      // Always navigate to auth screen after signOut resolves,
      // regardless of whether onAuthStateChange already fired.
      currentUser = null;
      authInitialized = true;
      showAuth();
    } catch (err) {
      toast("Logout failed. Please try again.", true);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || `<span class="icon" data-icon="logout"></span><span>Log Out</span>`;
        renderIcons();
      }
    }
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  document.querySelectorAll("[data-page]").forEach((btn) =>
    btn.addEventListener("click", () => navigateTo(btn.dataset.page))
  );
  document.querySelectorAll("[data-page-link]").forEach((btn) =>
    btn.addEventListener("click", () => navigateTo(btn.dataset.pageLink))
  );

  // ── Sidebar ───────────────────────────────────────────────────────────────
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    document.getElementById("appView")?.classList.toggle("collapsed");
  });

  document.getElementById("byTheNumbersToggle")?.addEventListener("click", () => {
    const el = document.getElementById("byTheNumbers");
    if (!el) return;
    el.classList.toggle("hidden");
    const sign = document.getElementById("byTheNumbersSign");
    if (sign) sign.textContent = el.classList.contains("hidden") ? "+" : "−";
  });

  // ── Theme ─────────────────────────────────────────────────────────────────
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "" : "dark";
    localStorage.setItem("theme", dark ? "light" : "dark");
    updateThemeIcon();
  });

  document.getElementById("cancelLeadModal")?.addEventListener("click", () => closeModal("leadModal"));
  document.getElementById("leadForm")?.addEventListener("submit", handleLeadSave);

  // ── Dispute / Call Log Modals ─────────────────────────────────────────────
  initDisputeModal();
  initLogCallModal();

  // ── Custom Field Modal ────────────────────────────────────────────────────
  const doOpenCFModal = () => openModal("customFieldModal");
  ["openCustomFieldModalFromLeads","openCustomFieldModalSettings"].forEach((id) =>
    document.getElementById(id)?.addEventListener("click", doOpenCFModal)
  );
  document.getElementById("closeCustomFieldModal")?.addEventListener("click", () => closeModal("customFieldModal"));
  document.getElementById("customFieldForm")?.addEventListener("submit", handleCustomFieldSave);

  // ── New Conversation Modal ────────────────────────────────────────────────
  document.getElementById("openNewConvModal")?.addEventListener("click", openNewConvModal);
  document.getElementById("cancelNewConvModal")?.addEventListener("click", () => closeModal("newConvModal"));
  document.getElementById("newConvForm")?.addEventListener("submit", handleNewConversation);

  // Close modals on backdrop click
  document.querySelectorAll(".modal").forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("open"); })
  );

  // ── Settings ──────────────────────────────────────────────────────────────
  document.getElementById("companyProfileForm")?.addEventListener("submit", handleCompanyProfileSave);
  document.getElementById("passwordForm")?.addEventListener("submit", handlePasswordChange);
  document.getElementById("settingsCompanyLogo")?.addEventListener("change", handleLogoFileChange);
  document.getElementById("removeLogoBtn")?.addEventListener("click", handleRemoveLogo);
  document.getElementById("addServiceAreaBtn")?.addEventListener("click", _addServiceAreaFromInput);
  document.getElementById("serviceAreaInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); _addServiceAreaFromInput(); } });
  document.getElementById("saveServiceAreasBtn")?.addEventListener("click", handleServiceAreasSave);

  // ── PPL Orders ────────────────────────────────────────────────────────────
  document.getElementById("openPplOrderModal")?.addEventListener("click", () => openModal("pplOrderModal"));
  document.getElementById("cancelPplOrderModal")?.addEventListener("click", () => closeModal("pplOrderModal"));
  document.getElementById("pplOrderForm")?.addEventListener("submit", handleCreatePplOrder);

  // ── AI Settings ───────────────────────────────────────────────────────────
  document.getElementById("aiSettingsForm")?.addEventListener("submit", handleAiSettingsSave);

  document.getElementById("twilioNumberForm")?.addEventListener("submit", handleTwilioNumberSave);
  document.getElementById("addPricingItemBtn")?.addEventListener("click", addPricingItemRow);

  // ── Opportunity Modal ─────────────────────────────────────────────────────
  document.getElementById("closeOpportunityModal")?.addEventListener("click", () => closeModal("opportunityModal"));
  document.getElementById("oppEditLeadBtn")?.addEventListener("click", () => {
    const leadId = document.getElementById("oppModalLeadId")?.value;
    if (leadId) {
      closeModal("opportunityModal");
      openEditLead(leadId);
    }
  });
  // Opportunity tabs
  document.querySelectorAll(".opp-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".opp-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".opp-tab-content").forEach((c) => c.classList.add("hidden"));
      tab.classList.add("active");
      const tabName = tab.dataset.tab;
      document.getElementById(`oppTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`)?.classList.remove("hidden");

      // Load tab content
      const leadId = document.getElementById("oppModalLeadId")?.value;
      if (leadId) {
        if (tabName === "conversations") loadOppConversations(leadId);
        if (tabName === "quotes") loadOppQuotes(leadId);
        if (tabName === "appointments") loadOppAppointments(leadId);
      }
    });
  });

  // ── Team Members ──────────────────────────────────────────────────────────
  document.getElementById("teamInviteForm")?.addEventListener("submit", handleTeamInvite);
  document.getElementById("leadRoutingForm")?.addEventListener("submit", handleLeadRoutingSave);

  // ── Reviews ──────────────────────────────────────────────────────────────
  document.getElementById("reviewSettingsForm")?.addEventListener("submit", handleReviewSettingsSave);

  // ── Conversations ─────────────────────────────────────────────────────────
  document.getElementById("convSendForm")?.addEventListener("submit", handleSendMessage);
  document.getElementById("convAiToggle")?.addEventListener("change", handleAiToggle);
  document.getElementById("convBackBtn")?.addEventListener("click", closeConversationDetail);

  // ── Bulk SMS ────────────────────────────────────────────────────────────
  document.getElementById("bulkSmsStageFilter")?.addEventListener("change", updateBulkSmsLeadCount);
  document.getElementById("bulkSmsMessage")?.addEventListener("input", updateBulkSmsPreview);
  document.getElementById("bulkSmsPreviewLead")?.addEventListener("change", updateBulkSmsPreview);
  document.getElementById("bulkSmsSendBtn")?.addEventListener("click", handleBulkSmsSend);

  // ── Notifications ───────────────────────────────────────────────────────
  document.getElementById("markAllReadBtn")?.addEventListener("click", markAllNotificationsRead);

  // ── Search ────────────────────────────────────────────────────────────────
  document.getElementById("globalSearchInput")?.addEventListener("input", handleSearch);

  // ── Quote Modal ──────────────────────────────────────────────────────────
  document.getElementById("openQuoteModal")?.addEventListener("click", openQuoteModalHandler);
  document.getElementById("cancelQuoteModal")?.addEventListener("click", () => closeModal("quoteModal"));
  document.getElementById("quoteForm")?.addEventListener("submit", handleQuoteSave);
  document.getElementById("addQuoteLineItemBtn")?.addEventListener("click", () => addQuoteLineItemRow());
  document.getElementById("quoteLineTaxRate")?.addEventListener("input", recalcQuoteTotals);
  document.getElementById("quoteLineTaxMode")?.addEventListener("change", recalcQuoteTotals);
  document.getElementById("quoteDefaultsForm")?.addEventListener("submit", handleQuoteDefaultsSave);

  // ── Appointment Modal ────────────────────────────────────────────────────
  document.getElementById("openAppointmentModal")?.addEventListener("click", openAppointmentModalHandler);
  document.getElementById("cancelAppointmentModal")?.addEventListener("click", () => closeModal("appointmentModal"));
  document.getElementById("appointmentForm")?.addEventListener("submit", handleAppointmentSave);
  document.getElementById("deleteAppointmentBtn")?.addEventListener("click", deleteAppointment);

  // ── Sale Modal ───────────────────────────────────────────────────────────
  document.getElementById("openSaleModal")?.addEventListener("click", openSaleModalHandler);
  document.getElementById("cancelSaleModal")?.addEventListener("click", () => closeModal("saleModal"));
  document.getElementById("saleForm")?.addEventListener("submit", handleSaleSave);

  // ── Phone number auto-format (Twilio E.164) ──────────────────────────────
  document.getElementById("leadPhone")?.addEventListener("blur", function () {
    this.value = formatPhoneE164(this.value);
  });

  document.addEventListener('keydown', (e) => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if (document.querySelector('.modal.open')) return;
if (e.key === 'q') { document.getElementById('openQuoteModal')?.click(); }
  });
});

// ─── Utility ──────────────────────────────────────────────────────────────────
function waitFor(fn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (fn()) return resolve();
    const start = Date.now();
    const iv = setInterval(() => {
      if (fn()) { clearInterval(iv); resolve(); }
      if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error("Timeout")); }
    }, 50);
  });
}

function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }

// ── Password Reset Modal ──────────────────────────────────────────────────
function showPasswordResetModal() {
  openModal("passwordResetModal");
}

// Password reset form handler
document.getElementById("passwordResetForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newPassword = document.getElementById("resetNewPassword")?.value || "";
  const confirmPassword = document.getElementById("resetConfirmNewPassword")?.value || "";

  if (newPassword.length < 6) {
    toast("Password must be at least 6 characters.", true);
    return;
  }

  if (newPassword !== confirmPassword) {
    toast("Passwords do not match.", true);
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";
  }

  try {
    // Supabase PASSWORD_RECOVERY event has already established a session,
    // so we can update the password directly via the authenticated client.
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) {
      toast(error.message, true);
    } else {
      toast("Password updated successfully!");
      closeModal("passwordResetModal");
      const pwEl = document.getElementById("resetNewPassword");
      const cfEl = document.getElementById("resetConfirmNewPassword");
      if (pwEl) pwEl.value = "";
      if (cfEl) cfEl.value = "";
    }
  } catch (err) {
    toast("Failed to update password. Please try again.", true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Password";
    }
  }
});

function toast(msg, isError = false) {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = `toast${isError ? " err" : ""}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function confirmAction(message, onConfirm, { okLabel = "Delete", title = "Are you sure?" } = {}) {
  const modal = document.getElementById("confirmModal");
  const msgEl = document.getElementById("confirmModalMsg");
  const okBtn = document.getElementById("confirmModalOk");
  const cancelBtn = document.getElementById("confirmModalCancel");
  const titleEl = document.getElementById("confirmModalTitle");
  if (!modal || !msgEl || !okBtn || !cancelBtn) { if (confirm(message)) onConfirm(); return; }
  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = okLabel;
  modal.classList.add("open");
  function cleanup() { modal.classList.remove("open"); okBtn.removeEventListener("click", handleOk); cancelBtn.removeEventListener("click", handleCancel); }
  function handleOk() { cleanup(); onConfirm(); }
  function handleCancel() { cleanup(); }
  okBtn.addEventListener("click", handleOk);
  cancelBtn.addEventListener("click", handleCancel);
}

function cap(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmt(val) {
  if (!val && val !== 0) return "-";
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency: "AUD", maximumFractionDigits: 0,
  }).format(val);
}

// Australian timezones (IANA). Live/DST-aware; default is AEST (Brisbane).
const AU_TIMEZONES = [
  ["Australia/Brisbane",  "AEST - Brisbane (QLD)"],
  ["Australia/Sydney",    "AEST/AEDT - Sydney (NSW)"],
  ["Australia/Melbourne", "AEST/AEDT - Melbourne (VIC)"],
  ["Australia/Hobart",    "AEST/AEDT - Hobart (TAS)"],
  ["Australia/Adelaide",  "ACST/ACDT - Adelaide (SA)"],
  ["Australia/Darwin",    "ACST - Darwin (NT)"],
  ["Australia/Perth",     "AWST - Perth (WA)"],
];
let _tz = (typeof localStorage !== "undefined" && localStorage.getItem("ql_tz")) || "Australia/Brisbane";

function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: _tz });
}

function fmtTime(d) {
  if (!d) return "-";
  return new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: _tz });
}

// Date + time together, in the selected Australian timezone.
function fmtDateTime(d) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: _tz });
}

function setTimezone(tz) {
  _tz = tz;
  try { localStorage.setItem("ql_tz", tz); } catch (e) {}
  try { if (typeof currentConvId !== "undefined" && currentConvId && typeof loadMessages === "function") loadMessages(currentConvId); } catch (e) {}
}

function initTimezoneSelect() {
  const sel = document.getElementById("tzSelect");
  if (!sel) return;
  sel.innerHTML = AU_TIMEZONES.map(([v, l]) => `<option value="${v}"${v === _tz ? " selected" : ""}>${l}</option>`).join("");
  sel.onchange = function () { setTimezone(this.value); };
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// ─── Pagination Helper ────────────────────────────────────────────────────────
function renderPagination(containerId, currentPage, totalCount, perPage, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalPages = Math.ceil((totalCount || 0) / perPage);
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <button class="btn" ${currentPage === 0 ? "disabled" : ""} style="font-size:12px;padding:4px 12px" data-dir="prev">← Prev</button>
    <span style="font-size:13px;color:var(--muted);padding:4px 8px">Page ${currentPage + 1} of ${totalPages}</span>
    <button class="btn" ${currentPage >= totalPages - 1 ? "disabled" : ""} style="font-size:12px;padding:4px 12px" data-dir="next">Next →</button>
  `;
  el.querySelector('[data-dir="prev"]')?.addEventListener("click", () => onPageChange(currentPage - 1));
  el.querySelector('[data-dir="next"]')?.addEventListener("click", () => onPageChange(currentPage + 1));
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function showAuth() {
  const authView = document.getElementById("authView");
  const appView = document.getElementById("appView");
  
  if (authView) authView.classList.remove("hidden");
  if (appView) appView.classList.add("hidden");
  
  // Reset login form state
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.reset();
    loginForm.classList.remove("hidden");
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
    if (emailInput) emailInput.disabled = false;
    if (passwordInput) passwordInput.disabled = false;
  }

  // Reset forgot password form
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  if (forgotPasswordForm) forgotPasswordForm.classList.add("hidden");
}

async function showApp() {
  const authView = document.getElementById("authView");
  const appView = document.getElementById("appView");
  
  if (authView) authView.classList.add("hidden");
  if (appView) appView.classList.remove("hidden");

  // Reset logout button in case it was left disabled from a previous sign-out
  const logoutBtn = document.getElementById("logoutButton");
  if (logoutBtn) {
    logoutBtn.disabled = false;
    logoutBtn.innerHTML = `<span class="icon" data-icon="logout"></span><span>Log Out</span>`;
    renderIcons();
  }

  if (!currentUser) {
    toast("Authentication error. Please log in again.", true);
    showAuth();
    return;
  }

  // Show the "VA Panel" sidebar link for VAs and admins (admin preview mode).
  const _vaLink = document.getElementById("navVaPanel");
  try {
    const { data: vaRow } = await sb
      .from("profiles")
      .select("is_va, is_admin")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (vaRow && (vaRow.is_va === true || vaRow.is_admin === true)) {
      if (_vaLink) _vaLink.style.display = "flex";
    } else if (_vaLink) {
      _vaLink.remove();
    }
  } catch (e) {
    if (_vaLink) _vaLink.remove();
  }

  try {
    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("company_id, full_name, phone, role, is_admin, a2hs_dismissed")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      toast("Error loading your profile - please refresh the page.", true);
    }

    // Store user role and admin status
    currentUserRole = profile?.role || 'member';
    currentUserIsSuperAdmin = profile?.is_admin === true;

    if (profile) {
      currentCompanyId = profile.company_id;
      const sidebarName = document.getElementById("sidebarAccountName");
      const sidebarMeta = document.getElementById("sidebarAccountMeta");
      const sidebarAvatar = document.getElementById("sidebarAvatar");
      
      if (sidebarName) sidebarName.textContent = profile.full_name || currentUser.email || "User";
      if (sidebarMeta) sidebarMeta.textContent = currentUser.email || "";
      
      const initials = (profile.full_name || currentUser.email || "??")
        .split(/[\s@]+/).map((s) => s[0]?.toUpperCase() || "").join("").slice(0, 2);
      if (sidebarAvatar) sidebarAvatar.textContent = initials;
    }

    let currentCompany = null;
    if (currentCompanyId) {
      const { data: company, error: companyError } = await sb
        .from("companies")
        .select("name, settings, plan")
        .eq("id", currentCompanyId)
        .maybeSingle();

      if (companyError) {
        console.error("Company fetch error:", companyError);
      }

      currentCompany = company;

      if (company?.name) {
        const brandName = document.getElementById("brandCompanyName");
        if (brandName) brandName.textContent = company.name;
        const sidebarCompany = document.getElementById("sidebarCompanyName");
        if (sidebarCompany) sidebarCompany.textContent = company.name;
      }

      const navBuyLeads = document.getElementById("navBuyLeads");
      if (navBuyLeads) navBuyLeads.style.display = '';

    }

    // Fetch current user's permissions from sales_reps
    if (currentCompanyId && currentUser) {
      const { data: repData } = await sb
        .from("sales_reps")
        .select("can_edit_leads, can_edit_quotes, can_edit_appointments, can_manage_pipeline, can_send_sms, can_initiate_calls, leads_visibility, quotes_visibility, appointments_visibility, sales_visibility, conversations_visibility")
        .eq("company_id", currentCompanyId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (repData) {
        currentUserPerms = repData;
      } else if (currentUserRole === 'owner' || currentUserRole === 'admin' || currentUserIsSuperAdmin) {
        // Owners/admins get full permissions even without a sales_reps record
        currentUserPerms = {
          can_edit_leads: true, can_edit_quotes: true, can_edit_appointments: true,
          can_manage_pipeline: true, can_send_sms: true, can_initiate_calls: true,
          leads_visibility: 'all', quotes_visibility: 'all', appointments_visibility: 'all',
          sales_visibility: 'all', conversations_visibility: 'all',
        };
      }
      applyPermissionRestrictions();
    }

    // Set up realtime subscriptions for live message updates
    setupRealtimeSubscription();

    // Load notification badge count
    loadNotificationBadge();

    // Check URL params for post-checkout banners
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ppl_success') === 'true') {
      toast('Payment confirmed! Your leads are being queued and will appear in your pipeline shortly.');
      history.replaceState({}, '', window.location.pathname);
      if (currentCompanyId) {
        const { data: co } = await sb.from('companies').select('ppl_agreed_postcodes').eq('id', currentCompanyId).maybeSingle();
        if (co?.ppl_agreed_postcodes?.length > 0) {
          setTimeout(() => toast(`Your service area has been set to ${co.ppl_agreed_postcodes.length} postcodes from this order. View or edit them in Settings → Service Areas.`), 1800);
        }
      }
    }
    if (urlParams.get('ppl_cancelled') === 'true') {
      toast('Order cancelled - no charge was made.');
      history.replaceState({}, '', window.location.pathname);
    }


    navigateTo(currentPageId || "dashboard");

    // Show "Add to Home Screen" prompt once per new user/device
    if (currentUser?.id) maybeShowInstallPrompt(currentUser.id, profile?.a2hs_dismissed === true);
  } catch (err) {
    console.error("Error loading app:", err);
    toast("Error loading dashboard. Please refresh.", true);
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:          ["Status",            "Your lead system at a glance."],
  leads:              ["Leads",             "Manage and capture your lead records."],
  pipeline:           ["Pipeline",          "Track leads through your pipeline stages."],
  quotes:             ["Quotes",            "Leads that have been quoted."],
  appointments:       ["Appointments",      "Scheduled appointments and bookings."],
  sales:              ["Sales",             "Closed won and lost performance summary."],
  notifications:      ["Notifications",    "AI activity and goal completions."],
  conversations:      ["Conversations",     "SMS threads with leads."],
  "bulk-sms":         ["Broadcast",          "Database reactivation - send personalized SMS to multiple leads."],
  "general-settings": ["Account",           "Manage your company and personal profile."],
  "ai-settings":      ["Automation",        "Configure your SMS agent and AI SMS number."],
  "ai-insights":      ["Performance",       "See how your AI agents are improving over time."],
  "team-members":     ["Team",              "Invite and manage your team."],
  "integrations":     ["Integrations",      "API keys, webhooks, and external connections."],
  "reviews":          ["Reviews",           "Manage Google review requests for closed deals."],
  "buy-leads":        ["Buy Leads",          "Purchase exclusive lead packs for your industry and area."],
};

function isAdmin() {
  return currentUserRole === 'owner' || currentUserRole === 'admin' || currentUserIsSuperAdmin;
}

function applyPermissionRestrictions() {
  // Sidebar nav items are always visible to all users.
  // The only access restriction is the /admin page, which is guarded separately.
}

function navigateTo(page) {
  currentPageId = page;
  document.querySelectorAll("[data-page]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.page === page)
  );

  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.remove("hidden");

  // Reset conversation mobile view when navigating away
  document.querySelector(".conv-layout")?.classList.remove("conv-open");

  // Reset pagination to first page when navigating to a page
  conversationsPage = 0;
  leadsPage = 0;
  quotesPage = 0;
  appointmentsPage = 0;
  salesPage = 0;

  const [title, sub] = PAGE_META[page] || [page, ""];
  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  if (pageTitle) pageTitle.textContent = title;
  if (pageSubtitle) pageSubtitle.textContent = sub;

  const loaders = {
    dashboard:          loadDashboard,
    leads:              loadLeads,
    pipeline:           loadPipeline,
    quotes:             loadQuotes,
    appointments:       loadAppointments,
    sales:              loadSales,
    conversations:      loadConversations,
    "bulk-sms":         loadBulkSms,
    notifications:      loadNotifications,
    "general-settings": loadSettings,
    "ai-settings":      loadAiSettings,
    "ai-insights":      loadAiInsights,
    "team-members":     loadTeamMembers,
    "integrations":     loadIntegrations,
    "reviews":          loadReviews,
    "buy-leads":        loadBuyLeads,
  };
  loaders[page]?.();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
let dashRange = "today";

function getDashRangeStart() {
  const now = new Date();
  switch (dashRange) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "trailing12":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

async function loadDashboard() {
  if (!currentCompanyId) return;

  // Attach range toggle listeners once
  const toggle = document.getElementById("dashRangeToggle");
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".range-btn");
      if (!btn) return;
      dashRange = btn.dataset.range;
      toggle.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadDashboard();
    });
  }

  const rangeStart = getDashRangeStart();


  try {
    const [{ data: leads }, { data: quotes }, { data: appointments }, { data: aiCfg }, { count: orderCount }] = await Promise.all([
      sb.from("leads").select("id, name, email, pipeline_stage, value, ai_enabled, created_at").eq("company_id", currentCompanyId),
      sb.from("quotes").select("id, lead_id, status, created_at").eq("company_id", currentCompanyId),
      sb.from("appointments").select("id, lead_id, status, start_time, created_at").eq("company_id", currentCompanyId),
      sb.from("sms_agent_config").select("is_active, agent_name").eq("company_id", currentCompanyId).maybeSingle(),
      sb.from("ppl_lead_orders").select("id", { count: "exact", head: true }).eq("company_id", currentCompanyId).not("status", "eq", "pending"),
    ]);

    const all          = leads || [];
    const allQuotes    = quotes || [];
    const allAppts     = appointments || [];
    const rangeLeads   = all.filter((l) => new Date(l.created_at) >= rangeStart);
    const rangeQuotes  = allQuotes.filter((q) => new Date(q.created_at) >= rangeStart);
    const rangeAppts   = allAppts.filter((a) => new Date(a.created_at) >= rangeStart);

    const open         = rangeLeads.filter((l) => !["closed_won","closed_lost"].includes(l.pipeline_stage)).length;
    const totalQuotes  = rangeQuotes.length;

    // AI conversion: % of AI-enabled leads that got appointments
    const aiLeads      = rangeLeads.filter((l) => l.ai_enabled !== false);
    const aiLeadIds    = new Set(aiLeads.map((l) => l.id));
    const aiAppts      = rangeAppts.filter((a) => aiLeadIds.has(a.lead_id));
    const aiLeadsWithAppts = new Set(aiAppts.map((a) => a.lead_id)).size;
    const aiConvRate   = aiLeads.length ? Math.round((aiLeadsWithAppts / aiLeads.length) * 100) : 0;

    // % of leads quoted
    const quotedLeadIds = new Set(rangeQuotes.map((q) => q.lead_id));
    const leadsQuotedPct = rangeLeads.length ? Math.round((quotedLeadIds.size / rangeLeads.length) * 100) : 0;

    // Sales conversion rate
    const closedWon    = rangeLeads.filter((l) => l.pipeline_stage === "closed_won");
    const closedLost   = rangeLeads.filter((l) => l.pipeline_stage === "closed_lost");
    const totalClosed  = closedWon.length + closedLost.length;
    const salesConv    = totalClosed ? Math.round((closedWon.length / totalClosed) * 100) : 0;

    // Revenue & Avg deal
    const revenue      = closedWon.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const avgDeal      = closedWon.length ? Math.round(revenue / closedWon.length) : 0;

    // Update stat cards
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText("statLeadCount", rangeLeads.length);
    setText("statOpenPipeline", open);
    setText("statQuotes", totalQuotes);
    setText("statSalesConversion", salesConv + "%");
    setText("statAiConversion", aiConvRate + "%");
    setText("statLeadsQuoted", leadsQuotedPct + "%");
    setText("statRevenue", fmt(revenue));
    setText("statAvgDeal", fmt(avgDeal));

    // Chips
    const weekAgo     = new Date(Date.now() - 7 * 864e5);
    const newThisWeek = all.filter((l) => new Date(l.created_at) > weekAgo).length;
    setText("leadGrowthChip", newThisWeek ? `+${newThisWeek} this week` : "No new");
    setText("qualifyingChip", `${rangeLeads.filter((l) => l.pipeline_stage === "follow_up").length} qualifying`);
    setText("quoteChip", `${totalQuotes} quote${totalQuotes === 1 ? "" : "s"}`);
    setText("salesConversionChip", `${closedWon.length} won / ${totalClosed} closed`);
    setText("aiConversionChip", `${aiLeadsWithAppts} of ${aiLeads.length} AI leads`);
    setText("leadsQuotedChip", `${quotedLeadIds.size} of ${rangeLeads.length} leads`);
    setText("revenueChip", `${closedWon.length} deal${closedWon.length === 1 ? "" : "s"}`);
    setText("avgDealChip", closedWon.length ? `from ${closedWon.length} deal${closedWon.length === 1 ? "" : "s"}` : "No deals");

    buildLeadVolumeChart(all);
    renderRecentLeads(all.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5));
    renderPipelineSnapshot(all);

    loadHotLeads();
    loadOnboardingChecklist(aiCfg, all.length, orderCount || 0);
    loadActiveOrdersDash();

    // ── Status banner ──────────────────────────────────────────────────────
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const leadsToday = all.filter(l => new Date(l.created_at) >= todayStart).length;
    const openAll    = all.filter(l => !["closed_won","closed_lost"].includes(l.pipeline_stage)).length;
    const quotesOut  = allQuotes.filter(q => q.status === "sent").length;
    const aiOn       = aiCfg?.is_active === true;

    const setText2 = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText2("statusLeadsToday", leadsToday);
    setText2("statusOpenCount",  openAll);
    setText2("statusQuotesSent", quotesOut);
    const totalRevenue = all.filter(l => l.pipeline_stage === 'closed_won')
      .reduce((a, l) => a + (Number(l.value) || 0), 0);
    setText2("statusTotalRevenue", fmt(totalRevenue));

    const aiChip = document.getElementById("statusAiChip");
    const aiNote = document.getElementById("statusAiNote");
    if (aiChip) {
      aiChip.textContent = aiOn ? "AI ON" : "AI OFF";
      aiChip.style.color = aiOn ? "#16a34a" : "#dc2626";
      aiChip.style.borderColor = aiOn ? "rgba(22,163,74,.3)" : "rgba(220,38,38,.3)";
      aiChip.style.background  = aiOn ? "rgba(22,163,74,.08)" : "rgba(220,38,38,.08)";
    }
    if (aiNote) aiNote.textContent = aiOn ? "Your automation is running." : "AI agent is paused - go to Automations to enable it.";

    // ── Exception queue ────────────────────────────────────────────────────
    const exceptions = [];

    const quotedLeadIdsSet = new Set(allQuotes.map(q => q.lead_id));
    const unquoted = all.filter(l => ["new_lead","follow_up"].includes(l.pipeline_stage) && !quotedLeadIdsSet.has(l.id));
    if (unquoted.length) exceptions.push({
      icon: "!", msg: `${unquoted.length} lead${unquoted.length > 1 ? "s" : ""} in the pipeline with no quote yet`,
      action: "View Leads", page: "leads"
    });

    const threeDaysAgo = new Date(Date.now() - 3 * 864e5);
    const staleQuotes = allQuotes.filter(q => q.status === "sent" && new Date(q.created_at) < threeDaysAgo);
    if (staleQuotes.length) exceptions.push({
      icon: "!", msg: `${staleQuotes.length} quote${staleQuotes.length > 1 ? "s" : ""} sent but not accepted - over 3 days old`,
      action: "Follow Up", page: "quotes"
    });

    const now48 = new Date(); const in48h = new Date(Date.now() + 48 * 3600e3);
    const upcoming = allAppts.filter(a => a.start_time && a.status !== "cancelled" && new Date(a.start_time) >= now48 && new Date(a.start_time) <= in48h);
    if (upcoming.length) exceptions.push({
      icon: "ℹ", msg: `${upcoming.length} appointment${upcoming.length > 1 ? "s" : ""} coming up in the next 48 hours`,
      action: "View", page: "appointments"
    });

    const queueEl = document.getElementById("exceptionQueue");
    if (queueEl) {
      if (!exceptions.length) {
        queueEl.innerHTML = `<div class="empty" style="min-height:80px"><p>Nothing needs your attention right now.</p></div>`;
      } else {
        queueEl.innerHTML = exceptions.map(ex => `
          <div class="exception-card">
            <div class="exception-body"><span style="font-size:16px">${ex.icon}</span><span>${ex.msg}</span></div>
            <button class="btn" onclick="navigateTo('${ex.page}')" style="white-space:nowrap;font-size:12px">${ex.action} →</button>
          </div>`).join("");
      }
    }
  } catch (err) {
    console.error("Dashboard load error:", err);
  }
}

function buildLeadVolumeChart(leads) {
  const chart = document.getElementById("leadVolumeChart");
  if (!chart) return;
  const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const counts = days.map((d) => {
    const ds = d.toISOString().slice(0, 10);
    return leads.filter((l) => l.created_at?.slice(0, 10) === ds).length;
  });
  const max = Math.max(...counts, 1);
  chart.innerHTML = days.map((d, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max((counts[i] / max) * 160, 10)}px" title="${counts[i]} leads"></div>
      <span style="font-size:10px;color:var(--muted)">${DAY_LABELS[d.getDay()]}</span>
    </div>`).join("");
}

function renderRecentLeads(leads) {
  const el = document.getElementById("recentLeadsPanel");
  if (!el) return;
  if (!leads.length) {
    el.innerHTML = `<div class="empty"><h3>No leads yet</h3><p>Add your first lead to see it here.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="list">${leads.map((l) => `
    <div class="item" style="grid-template-columns:1.6fr 1fr 1fr">
      <div><h3>${esc(l.name || "-")}</h3><p>${esc(l.email || "-")}</p></div>
      <div><span class="chip">${stageLabel(l.pipeline_stage)}</span></div>
      <div><p style="font-size:11px;color:var(--muted)">${fmtDate(l.created_at)}</p></div>
    </div>`).join("")}</div>`;
}

function renderPipelineSnapshot(leads) {
  const el = document.getElementById("pipelineSnapshotPanel");
  if (!el) return;
  const STAGES = ["new_lead","follow_up","quote_in_progress","quoted","closed_won","closed_lost"];
  if (!leads.length) {
    el.innerHTML = `<div class="empty"><p>No pipeline data yet.</p></div>`;
    return;
  }
  el.innerHTML = STAGES.map((s) => {
    const items = leads.filter((l) => l.pipeline_stage === s);
    const val   = items.reduce((a, l) => a + (Number(l.value) || 0), 0);
    return `<div class="item" style="grid-template-columns:1.4fr 80px 110px">
      <div><h3>${stageLabel(s)}</h3></div>
      <div><p>${items.length} lead${items.length === 1 ? "" : "s"}</p></div>
      <div><p>${val ? fmt(val) : "-"}</p></div>
    </div>`;
  }).join("");
}

// ─── Hot Leads Panel (Change 1) ───────────────────────────────────────────────
async function loadHotLeads() {
  if (!currentCompanyId) return;
  try {
    const { data: leads } = await sb
      .from('leads')
      .select('id, name, phone, email, pipeline_stage, ai_score, ai_status, created_at, value')
      .eq('company_id', currentCompanyId)
      .not('pipeline_stage', 'in', '("closed_won","closed_lost")')
      .order('created_at', { ascending: false });

    const { data: quotedLeads } = await sb
      .from('quotes')
      .select('lead_id')
      .eq('company_id', currentCompanyId);

    const quotedIds = new Set((quotedLeads || []).map(q => q.lead_id));

    const actionable = (leads || []).filter(l => {
      const status = l.ai_status || aiStatusFromScore(l.ai_score);
      return (status === 'hot' || status === 'warm') && !quotedIds.has(l.id);
    }).slice(0, 6);

    const countEl = document.getElementById('hotLeadsCount');
    const bodyEl  = document.getElementById('hotLeadsBody');
    if (countEl) countEl.textContent = actionable.length ? `${actionable.length} need action` : 'All clear';

    if (!bodyEl) return;

    if (!actionable.length) {
      bodyEl.innerHTML = `<div class="empty" style="min-height:80px"><p>No hot or warm leads without a quote. Great work.</p></div>`;
      return;
    }

    bodyEl.innerHTML = `<div class="table-lite">${actionable.map(l => {
      const status = l.ai_status || aiStatusFromScore(l.ai_score);
      const ageMs   = Date.now() - new Date(l.created_at).getTime();
      const ageHrs  = Math.floor(ageMs / 3600000);
      const ageLabel = ageHrs < 1 ? 'Just now' : ageHrs < 24 ? `${ageHrs}h ago` : `${Math.floor(ageHrs/24)}d ago`;
      const urgency  = ageHrs > 48 ? 'color:#c53535' : ageHrs > 24 ? 'color:#b45309' : '';
      const borderColor = status === 'hot' ? '#ef4444' : '#3b82f6';
      return `<div class="row" style="border-left:3px solid ${borderColor};border-radius:0 12px 12px 0;cursor:pointer;grid-template-columns:1.3fr 1fr auto auto"
                   onclick="openOpportunityModal('${l.id}')">
        <div>
          <strong style="font-size:13px">${esc(l.name || '-')}</strong>
          <span class="muted">${esc(l.phone || l.email || '-')}</span>
        </div>
        <div>
          <span class="chip ${aiStatusChipClass(l)}">${aiStatusLabel(l)}</span>
          <span class="chip" style="margin-left:4px">${stageLabel(l.pipeline_stage)}</span>
        </div>
        <div style="${urgency}"><span class="muted">${ageLabel}</span></div>
        <div style="display:flex;gap:6px">
          <button class="btn2" style="font-size:11px;padding:4px 10px"
                  onclick="event.stopPropagation();quickSendQuote('${l.id}')">
            Send Quote
          </button>
          <button class="btn" style="font-size:11px;padding:4px 10px"
                  onclick="event.stopPropagation();openConversationForLead('${l.id}')">
            SMS
          </button>
        </div>
      </div>`;
    }).join('')}</div>`;
    renderIcons();
  } catch (err) {
    console.error('loadHotLeads error:', err);
  }
}

async function loadActiveOrdersDash() {
  const panel = document.getElementById("activeOrdersPanel");
  const body  = document.getElementById("activeOrdersBody");
  if (!panel || !body || !currentCompanyId) return;

  const { data: orders } = await sb
    .from("ppl_lead_orders")
    .select("*")
    .eq("company_id", currentCompanyId)
    .in("status", ["paid", "active"])
    .order("created_at", { ascending: false });

  if (!orders?.length) { panel.style.display = "none"; return; }

  panel.style.display = "";
  const fmt = v => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
  const statusColor = s => s === "active" ? "#22c55e" : "#4797FF";

  body.innerHTML = orders.map(o => {
    const pct    = o.quantity > 0 ? Math.min(100, Math.round((o.delivered_count / o.quantity) * 100)) : 0;
    const bar    = pct >= 100 ? "#22c55e" : pct >= 60 ? "#4797FF" : "#f59e0b";
    const city   = o.area_city || o.area || "-";
    const badge  = `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${statusColor(o.status)}22;color:${statusColor(o.status)};text-transform:uppercase;letter-spacing:.5px">${o.status}</span>`;
    return `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          ${badge}
          <span style="font-size:13px;font-weight:600">${nicheLabel(o.niche)}${o.sub_niche ? ` › ${subNicheLabel(o.sub_niche)}` : ''} - ${city}</span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:5px;overflow:hidden;margin-bottom:6px">
          <div style="width:${pct}%;height:100%;background:${bar};border-radius:4px;transition:width .3s"></div>
        </div>
        <div style="font-size:12px;color:var(--muted)">${o.delivered_count} / ${o.quantity} leads delivered · ${fmt(o.total_amount)}</div>
      </div>
    </div>`;
  }).join("");
}

async function quickSendQuote(leadId) {
  await populateLeadSelector('quoteLeadSelect');
  document.getElementById('quoteForm')?.reset();
  document.getElementById('quoteLineItems').innerHTML = '';
  recalcQuoteTotals();
  await prefillQuoteDefaults();
  const sel = document.getElementById('quoteLeadSelect');
  if (sel) sel.value = leadId;
  openModal('quoteModal');
}

async function openConversationForLead(leadId) {
  navigateTo('conversations');
  setTimeout(async () => {
    const { data: conv } = await sb
      .from('conversations')
      .select('id, leads(name, phone)')
      .eq('company_id', currentCompanyId)
      .eq('lead_id', leadId)
      .maybeSingle();
    if (conv) {
      const item = document.querySelector(`.conv-item[data-conv-id="${conv.id}"]`);
      if (item) item.click();
    }
  }, 400);
}

// ─── Onboarding Checklist (Change 7) ─────────────────────────────────────────
function loadOnboardingChecklist(aiCfg, leadCount, orderCount) {
  if (localStorage.getItem('onboarding_dismissed')) return;
  const el = document.getElementById('onboardingChecklist');
  if (!el) return;
  const step1Done = aiCfg?.is_active === true && !!aiCfg?.agent_name;
  const step2Done = (leadCount || 0) > 0;
  const step3Done = (orderCount || 0) > 0;
  const doneCount = [step1Done, step2Done, step3Done].filter(Boolean).length;
  if (doneCount === 3) { el.style.display = 'none'; return; }
  el.style.display = '';
  const setStep = (id, done) => {
    const row  = document.getElementById(id);
    const icon = document.getElementById(id + '_icon');
    if (!row || !icon) return;
    if (done) { icon.textContent = '✓'; icon.style.color = '#16a34a'; row.style.opacity = '0.6'; }
    else      { icon.textContent = '○'; icon.style.color = ''; row.style.opacity = ''; }
  };
  setStep('oc_step1', step1Done);
  setStep('oc_step2', step2Done);
  setStep('oc_step3', step3Done);
  const prog = document.getElementById('onboardingProgress');
  if (prog) prog.textContent = `${doneCount} of 3 complete`;
}

// ─── Custom Fields ────────────────────────────────────────────────────────────
async function loadCustomFields() {
  if (!currentCompanyId) return [];
  try {
    const { data } = await sb
      .from("custom_fields")
      .select("*")
      .eq("company_id", currentCompanyId)
      .order("created_at");
    customFields = data || [];
    return customFields;
  } catch (err) {
    console.error("Load custom fields error:", err);
    return [];
  }
}

async function renderCustomFieldInputs(values = {}) {
  await loadCustomFields();
  const el = document.getElementById("customFieldInputs");
  if (!el) return;
  el.innerHTML = customFields.map((f) => `
    <div class="custom-row" style="grid-template-columns:1fr 1fr">
      <div class="field">
        <label>${esc(f.label)}</label>
        ${f.type === "textarea"
          ? `<textarea name="cf_${esc(f.key)}">${esc(values[f.key] || "")}</textarea>`
          : `<input type="${["text","email","number","tel","date","url"].includes(f.type) ? f.type : "text"}" name="cf_${esc(f.key)}" value="${esc(values[f.key] || "")}">`}
      </div>
    </div>`).join("");
}

function renderSettingsCustomFields() {
  const el = document.getElementById("settingsCustomFields");
  if (!el) return;
  if (!customFields.length) {
    el.innerHTML = `<div class="notice">No custom fields yet. Create one below.</div>`;
    return;
  }
  el.innerHTML = `<div class="table-lite">${customFields.map((f) => `
    <div class="row">
      <div><strong style="font-size:13px">${esc(f.label)}</strong><span class="muted" style="margin-left:6px">${esc(f.type)}</span></div>
      <div><code style="font-size:11px;color:var(--muted)">${esc(f.key)}</code></div>
      <button class="iconbtn btn-danger" onclick="deleteCustomField('${f.id}')" type="button">
        <span class="icon" data-icon="trash"></span>
      </button>
    </div>`).join("")}</div>`;
  renderIcons();
}

async function handleCustomFieldSave(e) {
  e.preventDefault();
  const label = document.getElementById("customFieldLabel")?.value.trim();
  const type  = document.getElementById("customFieldType")?.value;
  if (!label) return;
  const key = slugify(label);
  
  try {
    const { error } = await sb.from("custom_fields").insert({
      company_id: currentCompanyId, label, type, key,
    });
    if (error) { toast(error.message, true); return; }
    toast("Custom field added.");
    document.getElementById("customFieldForm")?.reset();
    await loadCustomFields();
    renderSettingsCustomFields();
    await renderCustomFieldInputs();
  } catch (err) {
    toast("Failed to save custom field.", true);
  }
}

async function deleteCustomField(id) {
  confirmAction("Delete this custom field? Values stored in leads will be lost.", async () => {
    try {
      const { error } = await sb.from("custom_fields").delete().eq("id", id);
      if (error) { toast(error.message, true); return; }
      toast("Custom field deleted.");
      await loadCustomFields();
      renderSettingsCustomFields();
    } catch (err) {
      toast("Failed to delete custom field.", true);
    }
  });
}

// ─── Leads ────────────────────────────────────────────────────────────────────
async function loadLeads() {
  if (!currentCompanyId) return;
  await loadCustomFields();
  try {
    const from = leadsPage * PER_PAGE;
    const to = from + PER_PAGE - 1;
    const { data, count, error } = await sb
      .from("leads")
      .select("*", { count: "exact" })
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) { toast(error.message, true); return; }
    allLeads = data || [];
    _allLeadsForFilter = allLeads;
    renderLeadsTable(allLeads);
    renderPagination("leadsPagination", leadsPage, count, PER_PAGE, (page) => {
      leadsPage = page;
      loadLeads();
    });
  } catch (err) {
    toast("Failed to load leads.", true);
  }
}

// Export every lead belonging to the signed-in user's company to a CSV file.
// Scoping: the query is constrained to `currentCompanyId` and row-level
// security further restricts rows to what this account is permitted to see,
// so a user only ever exports their own account's leads. The full set is
// fetched in pages (PostgREST caps each response at 1000 rows) so the export
// is not limited to the page currently shown in the table.
async function exportLeadsCSV(btn) {
  if (!currentCompanyId) return;
  const label = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Exporting..."; }
  try {
    await loadCustomFields();

    const PAGE = 1000;
    let from = 0;
    let rows = [];
    while (true) {
      const { data, error } = await sb
        .from("leads")
        .select("*")
        .eq("company_id", currentCompanyId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) { toast(error.message, true); return; }
      const batch = data || [];
      rows = rows.concat(batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    if (!rows.length) { toast("No leads to export.", true); return; }

    const cols = [
      ["id", "ID"],
      ["name", "Name"],
      ["email", "Email"],
      ["phone", "Phone"],
      ["address", "Address"],
      ["postcode", "Postcode"],
      ["source", "Source"],
      ["pipeline_stage", "Status"],
      ["value", "Value"],
      ["ai_score", "AI Score"],
      ["ai_status", "AI Status"],
      ["ai_summary", "AI Summary"],
      ["notes", "Notes"],
      ["created_at", "Created"],
    ];

    const csvCell = (val) => {
      let s = val == null ? "" : String(val);
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };

    const header = cols.map(([, h]) => h)
      .concat(customFields.map((f) => f.label))
      .map(csvCell).join(",");

    const lines = rows.map((l) => {
      const base = cols.map(([k]) => {
        if (k === "pipeline_stage") return stageLabel(l[k]);
        return l[k];
      });
      const custom = customFields.map((f) => {
        const v = l.custom_data ? l.custom_data[f.key] : undefined;
        return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      });
      return base.concat(custom).map(csvCell).join(",");
    });

    // Prepend a BOM so Excel opens UTF-8 content correctly.
    const csv = "﻿" + [header, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} lead${rows.length === 1 ? "" : "s"}.`);
  } catch (err) {
    console.error("Export leads error:", err);
    toast("Failed to export leads.", true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

let _leadsFilter = 'all';
let _allLeadsForFilter = [];

async function filterLeadsTable(filter, btnEl) {
  _leadsFilter = filter;
  document.querySelectorAll('[data-lead-filter]').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  let filtered = _allLeadsForFilter;
  if (filter === 'hot') {
    filtered = filtered.filter(l => (l.ai_status || aiStatusFromScore(l.ai_score)) === 'hot');
  } else if (filter === 'warm') {
    filtered = filtered.filter(l => (l.ai_status || aiStatusFromScore(l.ai_score)) === 'warm');
  } else if (filter === 'no_quote') {
    const { data: qLeads } = await sb.from('quotes').select('lead_id').eq('company_id', currentCompanyId);
    const qIds = new Set((qLeads||[]).map(q=>q.lead_id));
    filtered = filtered.filter(l => !qIds.has(l.id) && !['closed_won','closed_lost'].includes(l.pipeline_stage));
  } else if (filter === 'stale') {
    filtered = filtered.filter(l => {
      const hrs = (Date.now() - new Date(l.created_at).getTime()) / 3600000;
      return hrs > 72 && !['closed_won','closed_lost'].includes(l.pipeline_stage);
    });
  }
  renderLeadsTable(filtered);
}

// ─── Lead Gen Rentals PPL lock ──────────────────────────────────────────────────────
// Leads sourced from 'Lead Gen Rentals PPL' are billable/disputable and must stay
// faithful to what was delivered, so they are partially locked in the UI: only
// status, value, address and notes may be edited, identifying fields
// (name/email/phone/source) are read-only, and the lead cannot be deleted.
// Disputes are unaffected.
const PPL_LOCKED_SOURCE = "leadgenrentals ppl";
function isPplLocked(lead) {
  return (lead?.source || "").trim().toLowerCase() === PPL_LOCKED_SOURCE;
}
// Fields that are NOT editable on a locked lead, per modal.
const PPL_LOCKED_LEADMODAL_FIELDS = ["leadName", "leadEmail", "leadPhone", "leadSource", "leadPostcode"];
const PPL_LOCKED_OPP_FIELDS       = ["oppOverviewName", "oppOverviewEmail", "oppOverviewPhone", "oppOverviewSource"];
// Disable/re-enable a set of field element IDs. Always called with the correct
// boolean so state resets when the reused modal DOM shows a non-locked lead.
function setFieldsLocked(ids, locked) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = locked;
    el.title = locked ? "Locked on Lead Gen Rentals PPL leads" : "";
  });
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById("leadsTableBody");
  const empty  = document.getElementById("leadsEmptyState");
  if (!tbody) return;
  if (!leads.length) {
    tbody.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  tbody.innerHTML = leads.map((l) => {
    const status = l.ai_status || aiStatusFromScore(l.ai_score);
    const ageHrs = (Date.now() - new Date(l.created_at).getTime()) / 3600000;
    const isStale = !['closed_won','closed_lost'].includes(l.pipeline_stage) && ageHrs > 72;
    const urgencyClass = status === 'hot' ? 'lead-hot' : status === 'warm' ? 'lead-warm' : 'lead-cold';
    const staleHtml = isStale ? `<span class="stale-badge">${Math.floor(ageHrs/24)}d</span>` : '';
    const locked = isPplLocked(l);
    return `
    <tr class="${urgencyClass}">
      <td><strong>${esc(l.name) || "-"}${staleHtml}</strong><span class="muted">${fmtDate(l.created_at)}</span></td>
      <td><strong>${esc(l.email) || "-"}</strong>${l.phone ? `<span class="muted">${esc(l.phone)}</span>` : ""}</td>
      <td><strong>${esc(l.address) || "-"}</strong>${l.postcode ? `<span class="muted">${esc(l.postcode)}</span>` : ""}</td>
      <td>${l.source ? `<span class="chip">${esc(l.source)}</span>` : "-"}</td>
      <td><span class="chip">${stageLabel(l.pipeline_stage)}</span></td>
      <td><span class="chip ${aiStatusChipClass(l)}">${aiScoreDisplay(l)}</span></td>
      <td><span class="chip ${aiStatusChipClass(l)}">${aiStatusLabel(l)}</span></td>
      <td style="font-size:12px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.ai_summary || '')}">${esc(l.ai_summary) || "-"}</td>
      <td style="font-size:12px;color:var(--muted)">${renderCustomDataSummary(l.custom_data)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="iconbtn" onclick="openOpportunityModal('${l.id}')" type="button" title="View Details"><span class="icon" data-icon="eye"></span></button>
          <button class="iconbtn" onclick="openEditLead('${l.id}')" type="button" title="${locked ? 'Edit (status, value, address & notes only)' : 'Edit'}"><span class="icon" data-icon="edit"></span></button>
          ${locked
            ? `<span class="iconbtn" title="Lead Gen Rentals PPL lead - can't be deleted" style="opacity:.4;cursor:not-allowed"><span class="icon" data-icon="lock"></span></span>`
            : `<button class="iconbtn btn-danger" onclick="deleteLead('${l.id}')" type="button" title="Delete"><span class="icon" data-icon="trash"></span></button>`}
        </div>
      </td>
    </tr>`;
  }).join("");
  renderIcons();
}

function renderCustomDataSummary(data) {
  if (!data || !Object.keys(data).length) return "-";
  return Object.entries(data).slice(0, 2).map(([, v]) => {
    const display = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
    return `<div>${esc(display) || "-"}</div>`;
  }).join("");
}

function resetLeadForm() {
  document.getElementById("leadForm")?.reset();
  const leadId = document.getElementById("leadId");
  const leadModalTitle = document.getElementById("leadModalTitle");
  if (leadId) leadId.value = "";
  if (leadModalTitle) leadModalTitle.textContent = "New Lead";
  // Hide dispute button for new leads - PPL flag is only set server-side
  _currentDisputeLeadId = null;
  document.getElementById("openDisputeFromLead")?.classList.add("hidden");
  // Re-enable any fields that a previously-viewed locked lead disabled
  setFieldsLocked(PPL_LOCKED_LEADMODAL_FIELDS, false);
  renderCustomFieldInputs();
}

async function openEditLead(id) {
  const l = allLeads.find((x) => x.id === id);
  if (!l) return;
  
  const leadModalTitle = document.getElementById("leadModalTitle");
  const leadId = document.getElementById("leadId");
  const leadName = document.getElementById("leadName");
  const leadEmail = document.getElementById("leadEmail");
  const leadPhone = document.getElementById("leadPhone");
  const leadPostcode = document.getElementById("leadPostcode");
  const leadAddress = document.getElementById("leadAddress");
  const leadSource = document.getElementById("leadSource");
  const leadStatus = document.getElementById("leadStatus");
  const leadValue = document.getElementById("leadValue");
  const leadNotes = document.getElementById("leadNotes");
  
  if (leadModalTitle) leadModalTitle.textContent = "Edit Lead";
  if (leadId) leadId.value = l.id;
  if (leadName) leadName.value = l.name || "";
  if (leadEmail) leadEmail.value = l.email || "";
  if (leadPhone) leadPhone.value = l.phone || "";
  if (leadPostcode) leadPostcode.value = l.postcode || "";
  if (leadAddress) leadAddress.value = l.address || "";
  if (leadSource) leadSource.value = l.source || "";
  if (leadStatus) leadStatus.value = stageLabel(l.pipeline_stage) || "New Lead";
  if (leadValue) leadValue.value = l.value || "";
  if (leadNotes) leadNotes.value = l.notes || "";
  
  await renderCustomFieldInputs(l.custom_data || {});

  // Lead Gen Rentals PPL: only status, value, address & notes are editable. Lock the
  // identifying fields and custom data; keep dispute + call log available below.
  const pplLocked = isPplLocked(l);
  setFieldsLocked(PPL_LOCKED_LEADMODAL_FIELDS, pplLocked);
  document.querySelectorAll('#leadModal [name^="cf_"]').forEach((el) => { el.disabled = pplLocked; });
  if (leadModalTitle) leadModalTitle.textContent = pplLocked ? "Edit Lead · Lead Gen Rentals PPL (limited editing)" : "Edit Lead";

  // PPL features - dispute button + call log (source === 'PPL')
  _currentDisputeLeadId = l.id;
  _pplEligibility       = null;
  const isPpl        = l.is_ppl === true;
  const disputeBtn   = document.getElementById("openDisputeFromLead");
  const callLogSec   = document.getElementById("pplCallLogSection");
  if (disputeBtn) disputeBtn.classList.toggle("hidden", !isPpl);
  if (callLogSec)  callLogSec.classList.toggle("hidden", !isPpl);

  if (isPpl) {
    loadPplCallLog(l.id);
    loadPplEligibility(l.id);
  }

  openModal("leadModal");
}

async function handleLeadSave(e) {
  e.preventDefault();
  if (!currentCompanyId) {
    toast("Session error - please refresh the page and try again.", true);
    return;
  }
  const id = document.getElementById("leadId")?.value;

  const custom_data = {};
  customFields.forEach((f) => {
    const el = document.querySelector(`[name="cf_${f.key}"]`);
    if (el) custom_data[f.key] = el.value;
  });

  const payload = {
    company_id: currentCompanyId,
    name:           document.getElementById("leadName")?.value || null,
    email:          document.getElementById("leadEmail")?.value || null,
    phone:          formatPhoneE164(document.getElementById("leadPhone")?.value) || null,
    postcode:       document.getElementById("leadPostcode")?.value || null,
    address:        document.getElementById("leadAddress")?.value || null,
    source:         document.getElementById("leadSource")?.value || null,
    is_ppl:         ["ppl", "leadgenrentals ppl"].includes((document.getElementById("leadSource")?.value || "").toLowerCase()),
    pipeline_stage: stageKey(document.getElementById("leadStatus")?.value || "New Lead"),
    value:          Number(document.getElementById("leadValue")?.value) || null,
    notes:          document.getElementById("leadNotes")?.value || null,
    custom_data,
  };

  // Per-lead edit restrictions for PPL leads
  if (id) {
    const existingLead = allLeads.find((x) => x.id === id);
    if (isPplLocked(existingLead)) {
      // Lead Gen Rentals PPL: only status, value, address & notes are editable -
      // never persist changes to identifying fields, source or postcode.
      delete payload.name;
      delete payload.email;
      delete payload.phone;
      delete payload.source;
      delete payload.postcode;
      delete payload.is_ppl;
      delete payload.custom_data;
    } else if (existingLead?.is_ppl && !payload.postcode) {
      // Plain PPL leads: block clearing the postcode.
      toast("Postcode cannot be removed from a PPL lead.", true);
      return;
    }
  }

  try {
    // Auto-route new leads based on company routing config
    if (!id) {
      const { data: routedRep } = await sb.rpc("route_lead", {
        p_company_id: currentCompanyId,
        p_postcode: payload.postcode || null,
      });
      if (routedRep) payload.assigned_to = routedRep;
    }

    if (id) {
      const { error } = await sb.from("leads").update(payload).eq("id", id);
      if (error) { toast(error.message, true); return; }
      toast("Lead updated.");
    } else {
      const { data: newLead, error } = await sb.from("leads").insert(payload).select().single();
      if (error) { toast(error.message, true); return; }
      toast("Lead created.");

      // Auto-send welcome SMS if enabled and lead has a phone number
      if (newLead?.phone) {
        sendWelcomeSmsIfEnabled(newLead).catch((err) =>
          console.warn("Welcome SMS failed:", err)
        );
      }
    }
    closeModal("leadModal");
    loadLeads();
    loadDashboard();
  } catch (err) {
    toast("Failed to save lead.", true);
  }
}

async function deleteLead(id) {
  if (isPplLocked(allLeads.find((x) => x.id === id))) {
    toast("Lead Gen Rentals PPL leads can't be deleted.", true);
    return;
  }
  confirmAction("Delete this lead? This cannot be undone.", async () => {
    try {
      const { error } = await sb.from("leads").delete().eq("id", id);
      if (error) { toast(error.message, true); return; }
      toast("Lead deleted.");
      loadLeads();
      loadDashboard();
    } catch (err) {
      toast("Failed to delete lead.", true);
    }
  });
}

// ─── PPL Lead Disputes ────────────────────────────────────────────────────────

let _currentDisputeLeadId   = null;
let _currentDisputeId       = null;
let _currentDisputeReason   = null;
let _currentManualAvailable = false;

function initDisputeModal() {
  document.getElementById("cancelDisputeModal")?.addEventListener("click", () => closeModal("disputeModal"));

  // Enable the Run Auto-Check button when a reason is selected
  document.querySelectorAll('input[name="disputeReason"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const btn = document.getElementById("runDisputeCheckBtn");
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById("runDisputeCheckBtn")?.addEventListener("click", runDisputeCheck);
  document.getElementById("sendManualReviewBtn")?.addEventListener("click", sendDisputeManualReview);
  document.getElementById("openDisputeFromLead")?.addEventListener("click", openDisputeModal);
}

function openDisputeModal() {
  const lead = allLeads.find((x) => x.id === _currentDisputeLeadId);
  if (!lead || !lead.is_ppl) return;

  // Reset to step 1
  _currentDisputeId       = null;
  _currentDisputeReason   = null;
  _currentManualAvailable = false;

  document.querySelectorAll('input[name="disputeReason"]').forEach((r) => { r.checked = false; r.disabled = false; });
  const runBtn = document.getElementById("runDisputeCheckBtn");
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Run Auto-Check"; runBtn.classList.remove("hidden"); }

  // Reset eligibility UI before re-applying
  const strip = document.getElementById("disputeEligibilityStrip");
  if (strip) strip.innerHTML = "";
  const invLabel = document.getElementById("disputeReasonInvalidLabel");
  if (invLabel) invLabel.style.opacity = "";
  const invNote = document.getElementById("disputeInvalidNumberNote");
  if (invNote) invNote.classList.add("hidden");

  showDisputeStep(1);

  const nameEl = document.getElementById("disputeLeadName");
  if (nameEl) nameEl.textContent = lead.name || "Unknown Lead";

  // Apply eligibility rules to step 1 (use cached value from when lead was opened)
  applyDisputeEligibilityToModal(_pplEligibility);

  closeModal("leadModal");
  openModal("disputeModal");
}

function showDisputeStep(step) {
  [1, 2, 3].forEach((n) => {
    const el = document.getElementById(`disputeStep${n}`);
    if (el) el.classList.toggle("hidden", n !== step);
  });
}

async function runDisputeCheck() {
  const selected = document.querySelector('input[name="disputeReason"]:checked');
  if (!selected) return;
  _currentDisputeReason = selected.value;

  const runBtn = document.getElementById("runDisputeCheckBtn");
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Checking…"; }

  showDisputeStep(2);
  const spinner = document.getElementById("disputeCheckSpinner");
  const result  = document.getElementById("disputeResult");
  if (spinner) spinner.style.display = "block";
  if (result)  result.classList.add("hidden");

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${sb.supabaseUrl}/functions/v1/dispute-lead`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ lead_id: _currentDisputeLeadId, reason: _currentDisputeReason }),
    });

    const payload = await res.json();

    if (spinner) spinner.style.display = "none";

    if (!res.ok) {
      // 409 = already disputed
      if (res.status === 409) {
        showDisputeDone("", "Already Disputed", payload.error || "This lead already has an active dispute.");
        return;
      }
      showDisputeDone("", "Check Failed", payload.error || "An error occurred. Please try again.");
      return;
    }

    _currentDisputeId       = payload.dispute_id;
    _currentManualAvailable = payload.manual_review_available && _currentDisputeReason === "outside_agreed_criteria";

    renderDisputeResult(payload);
    if (result) result.classList.remove("hidden");

  } catch (err) {
    if (spinner) spinner.style.display = "none";
    showDisputeDone("✗", "Check Failed", "Network error. Please try again.");
    console.error("Dispute check error:", err);
  }
}

function renderDisputeResult(payload) {
  const banner = document.getElementById("disputeResultBanner");
  const detail = document.getElementById("disputeResultDetail");
  const manualSection = document.getElementById("disputeManualReviewSection");
  const runBtn = document.getElementById("runDisputeCheckBtn");

  const approved = payload.status === "auto_approved";
  const chk      = payload.auto_check_result || {};

  // Banner
  if (banner) {
    if (approved) {
      banner.style.cssText = "padding:14px;border-radius:8px;margin-bottom:16px;font-size:13px;background:#e8f5e9;border:1px solid #a5d6a7;color:#1b5e20";
      banner.innerHTML = "<strong>Dispute Approved</strong> - The automated check confirmed this lead does not meet the delivery criteria. It has been logged for review and replacement.";
    } else {
      banner.style.cssText = "padding:14px;border-radius:8px;margin-bottom:16px;font-size:13px;background:#fdecea;border:1px solid #f5c6cb;color:#7f1d1d";
      banner.innerHTML = "<strong>Dispute Not Approved</strong> - The automated check could not confirm an issue with this lead.";
    }
  }

  // Detail
  if (detail) {
    const lines = [];
    if (_currentDisputeReason === "invalid_number") {
      if (chk.normalised_phone) lines.push(`Number checked: ${chk.normalised_phone}`);
      if (chk.phone_type)       lines.push(`Type: ${chk.phone_type}`);
      if (!approved)            lines.push("Veriphone confirmed this number appears reachable.");
    } else if (_currentDisputeReason === "duplicate") {
      if (chk.normalised_phone) lines.push(`Number checked: ${chk.normalised_phone}`);
      if (chk.duplicate_found && chk.duplicate_leads?.length) {
        lines.push(`Duplicate found: ${chk.duplicate_leads.map((d) => d.name || d.id).join(", ")}`);
      } else {
        lines.push("No duplicate found in your account.");
      }
    } else {
      if (chk.lead_postcode)  lines.push(`Lead postcode: ${chk.lead_postcode}`);
      if (chk.note)           lines.push(chk.note);
    }
    detail.innerHTML = lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("");
  }

  // Manual review section
  if (manualSection) {
    if (_currentManualAvailable && !approved) {
      manualSection.classList.remove("hidden");
      renderScrubBar(payload.scrub_usage);
    } else if (_currentManualAvailable && approved) {
      // Auto-approved but still show manual review info as informational only
      manualSection.classList.add("hidden");
    } else {
      manualSection.classList.add("hidden");
    }
  }

  // Hide run button once result shown (no re-runs on same dispute)
  if (runBtn) runBtn.classList.add("hidden");
}

function renderScrubBar(scrub) {
  const el = document.getElementById("disputeScrubBar");
  const capWarn = document.getElementById("disputeCapWarning");
  if (!el || !scrub) return;

  const used    = scrub.scrub_used_pct ?? 0;
  const cap     = scrub.scrub_cap_pct  ?? 10;
  const pct     = Math.min(100, (used / cap) * 100);
  const colour  = pct >= 90 ? "#d32f2f" : pct >= 70 ? "#f57c00" : "#388e3c";
  const exceeds = scrub.cap_exceeded;

  el.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:4px">
      Scrub cap usage: <strong style="color:${colour}">${used}% of ${cap}%</strong>
      &nbsp;(${scrub.approved_disputes ?? 0} approved of ${scrub.total_ppl_leads ?? 0} PPL leads)
    </div>
    <div style="background:#e0e0e0;border-radius:4px;height:6px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${colour};border-radius:4px;transition:width .3s"></div>
    </div>`;

  if (capWarn) {
    if (exceeds) {
      capWarn.classList.remove("hidden");
      capWarn.textContent = "Your scrub cap has been reached for this order. Manual review cannot be requested until additional PPL leads are delivered or your cap is adjusted.";
      const sendBtn = document.getElementById("sendManualReviewBtn");
      if (sendBtn) sendBtn.disabled = true;
    } else {
      capWarn.classList.add("hidden");
    }
  }
}

async function sendDisputeManualReview() {
  if (!_currentDisputeId) return;
  const btn = document.getElementById("sendManualReviewBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${sb.supabaseUrl}/functions/v1/dispute-lead`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action: "manual_review", dispute_id: _currentDisputeId }),
    });

    const payload = await res.json();

    if (!res.ok) {
      if (payload.cap_exceeded) {
        toast("Scrub cap exceeded - manual review cannot be submitted.", true);
        renderScrubBar(payload.scrub_usage);
      } else {
        toast(payload.error || "Failed to submit manual review.", true);
      }
      if (btn) { btn.disabled = false; btn.textContent = "Confirm - Send for Manual Review"; }
      return;
    }

    showDisputeDone(
      "",
      "Sent for Manual Review",
      "Our team will assess this lead against the agreed delivery criteria and be in touch. Remember: leads where a prospect said 'not interested' or any outcome outside Lead Gen Rentals' control do not qualify for replacement.",
    );
  } catch (err) {
    toast("Network error. Please try again.", true);
    if (btn) { btn.disabled = false; btn.textContent = "Confirm - Send for Manual Review"; }
    console.error("Manual review error:", err);
  }
}

function showDisputeDone(icon, title, sub) {
  showDisputeStep(3);
  const iconEl = document.getElementById("disputeDoneIcon");
  const msgEl  = document.getElementById("disputeDoneMsg");
  const subEl  = document.getElementById("disputeDoneSubMsg");
  if (iconEl) iconEl.textContent = icon;
  if (msgEl)  msgEl.textContent  = title;
  if (subEl)  subEl.textContent  = sub;
  const runBtn = document.getElementById("runDisputeCheckBtn");
  if (runBtn) runBtn.classList.add("hidden");
}

// ─── PPL Call Attempt Logging ─────────────────────────────────────────────────

let _pplEligibility = null; // cached eligibility for current lead

function initLogCallModal() {
  document.getElementById("cancelLogCallModal")?.addEventListener("click", () => {
    closeModal("logCallModal");
    openModal("leadModal");
  });
  document.getElementById("openLogCallBtn")?.addEventListener("click", () => {
    // Default datetime-local to now
    const el = document.getElementById("callAttemptedAt");
    if (el) {
      const now = new Date();
      now.setSeconds(0, 0);
      el.value = now.toISOString().slice(0, 16);
    }
    document.getElementById("callNotes").value = "";
    document.getElementById("callOutcome").value = "no_answer";
    closeModal("leadModal");
    openModal("logCallModal");
  });
  document.getElementById("saveCallAttemptBtn")?.addEventListener("click", saveCallAttempt);
}

async function loadPplCallLog(leadId) {
  const listEl = document.getElementById("pplCallLogList");
  if (!listEl) return;
  listEl.textContent = "Loading…";

  const { data, error } = await sb
    .from("ppl_call_attempts")
    .select("id, outcome, notes, attempted_at, logged_by")
    .eq("lead_id", leadId)
    .order("attempted_at", { ascending: false })
    .limit(20);

  if (error || !data?.length) {
    listEl.innerHTML = '<span style="color:var(--muted)">No call attempts logged yet.</span>';
    return;
  }

  const outcomeLabel = {
    no_answer:          "No Answer",
    voicemail:          "Voicemail",
    connected:          "Connected",
    wrong_number:       "Wrong Number",
    callback_requested: "Callback Requested",
  };
  const outcomeColour = {
    no_answer:          "#9e9e9e",
    voicemail:          "#7986cb",
    connected:          "#43a047",
    wrong_number:       "#e53935",
    callback_requested: "#fb8c00",
  };

  listEl.innerHTML = data.map((a) => {
    const ts  = new Date(a.attempted_at).toLocaleString();
    const col = outcomeColour[a.outcome] || "#9e9e9e";
    const lbl = outcomeLabel[a.outcome]  || a.outcome;
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border,#eee)">
      <span style="min-width:120px;font-weight:500;color:${col};font-size:12px">${lbl}</span>
      <span style="color:var(--muted);font-size:11px;flex:1">${a.notes ? `${a.notes} · ` : ""}${ts}</span>
    </div>`;
  }).join("");
}

async function loadPplEligibility(leadId) {
  const { data, error } = await sb
    .rpc("get_ppl_dispute_eligibility", { p_lead_id: leadId });
  _pplEligibility = (!error && data) ? data : null;
  renderEligibilityBadge(_pplEligibility);
}


function renderEligibilityBadge(elig) {
  const badge = document.getElementById("pplDisputeEligibilityBadge");
  if (!badge || !elig || elig.error) return;

  if (!elig.dispute_window_open) {
    badge.style.cssText = "display:inline-block;margin-left:8px;font-size:11px;padding:2px 7px;border-radius:10px;vertical-align:middle;background:#fdecea;color:#7f1d1d";
    badge.textContent   = "Dispute window closed";
  } else {
    const days = elig.days_remaining;
    badge.style.cssText = "display:inline-block;margin-left:8px;font-size:11px;padding:2px 7px;border-radius:10px;vertical-align:middle;background:#e8f5e9;color:#1b5e20";
    badge.textContent   = `${days}d remaining to dispute`;
  }
}

async function saveCallAttempt() {
  if (!_currentDisputeLeadId) return;
  const btn = document.getElementById("saveCallAttemptBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

  const outcome     = document.getElementById("callOutcome")?.value;
  const notes       = document.getElementById("callNotes")?.value?.trim() || null;
  const attemptedAt = document.getElementById("callAttemptedAt")?.value;

  const payload = {
    lead_id:      _currentDisputeLeadId,
    company_id:   currentCompanyId,
    outcome,
    notes,
    attempted_at: attemptedAt ? new Date(attemptedAt).toISOString() : new Date().toISOString(),
  };

  const { error } = await sb.from("ppl_call_attempts").insert(payload);

  if (btn) { btn.disabled = false; btn.textContent = "Save Attempt"; }

  if (error) {
    toast(error.message, true);
    return;
  }

  toast("Call attempt logged.");
  closeModal("logCallModal");
  openModal("leadModal");

  // Refresh call log and eligibility in background
  loadPplCallLog(_currentDisputeLeadId);
  loadPplEligibility(_currentDisputeLeadId);
}

// Render eligibility into the dispute modal step 1 before the user picks a reason
function applyDisputeEligibilityToModal(elig) {
  const strip     = document.getElementById("disputeEligibilityStrip");
  const invLabel  = document.getElementById("disputeReasonInvalidLabel");
  const invNote   = document.getElementById("disputeInvalidNumberNote");
  const runBtn    = document.getElementById("runDisputeCheckBtn");

  if (!elig || elig.error) return;

  // Window closed - block everything
  if (!elig.dispute_window_open) {
    if (strip) {
      strip.innerHTML = `<div style="background:#fdecea;border:1px solid #f5c6cb;border-radius:6px;padding:10px;font-size:12px;color:#7f1d1d">
        The 7-day dispute window for this lead has closed. Disputes must be raised within 7 days of delivery.
      </div>`;
    }
    document.querySelectorAll('input[name="disputeReason"]').forEach((r) => { r.disabled = true; });
    if (runBtn) runBtn.disabled = true;
    return;
  }

  // Window open - show days remaining
  const days    = elig.days_remaining;
  const urgency = days <= 1 ? "#7f1d1d" : days <= 2 ? "#78350f" : "#1b5e20";
  const bg      = days <= 1 ? "#fdecea" : days <= 2 ? "#fff8e1" : "#e8f5e9";
  const border  = days <= 1 ? "#f5c6cb" : days <= 2 ? "#ffe082" : "#a5d6a7";
  if (strip) {
    strip.innerHTML = `<div style="background:${bg};border:1px solid ${border};border-radius:6px;padding:8px 12px;font-size:12px;color:${urgency}">
      <strong>${days} day${days !== 1 ? "s" : ""} remaining</strong> in the dispute window for this lead.
    </div>`;
  }

  // 24h call rule - grey out invalid_number if not eligible
  if (!elig.call_within_24h) {
    if (invLabel) invLabel.style.opacity = "0.5";
    const radio = invLabel?.querySelector('input[type="radio"]');
    if (radio)  radio.disabled = true;
    if (invNote) {
      invNote.classList.remove("hidden");
      invNote.textContent = "Not available - no call attempt was logged within 24 hours of lead delivery. Log a call first, or choose a different reason.";
    }
  } else {
    if (invLabel) invLabel.style.opacity = "";
    const radio = invLabel?.querySelector('input[type="radio"]');
    if (radio)  radio.disabled = false;
    if (invNote) invNote.classList.add("hidden");
  }
}

// ─── Auto-send Welcome SMS ────────────────────────────────────────────────────
// Checks if the company has auto_send_welcome enabled and AI is active, then
// sends the customized welcome_message via the send-sms edge function.
async function sendWelcomeSmsIfEnabled(lead) {
  try {
    const { data: smsConfig } = await sb
      .from("sms_agent_config")
      .select("auto_send_welcome, welcome_message, is_active, twilio_number")
      .eq("company_id", currentCompanyId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!smsConfig?.auto_send_welcome || !smsConfig.is_active || !smsConfig.twilio_number) return;

    // Resolve {{first_name}} placeholder
    const firstName = lead.first_name || (lead.name || "").split(" ")[0] || "";
    let body = (smsConfig.welcome_message || "Hi {{first_name}}, thanks for reaching out!")
      .replace(/\{\{first_name\}\}/gi, firstName || "there");

    // Send via the existing send-sms edge function
    const { data: session } = await sb.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return;

    await fetch(`${sb.supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lead_id: lead.id,
        body,
      }),
    });
  } catch (err) {
    console.warn("sendWelcomeSmsIfEnabled error:", err);
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────
function handleSearch(e) {
  const q = e.target?.value?.toLowerCase()?.trim();
  if (!q) { renderLeadsTable(allLeads); return; }
  const filtered = allLeads.filter((l) =>
    [l.name, l.email, l.phone, l.postcode, l.address]
      .some((v) => v?.toLowerCase().includes(q))
  );
  renderLeadsTable(filtered);
  // Hide pagination while search is active
  const pagEl = document.getElementById("leadsPagination");
  if (pagEl) pagEl.innerHTML = "";
}

// ─── Phone Number Auto-Format (E.164 / Twilio) ───────────────────────────────
function formatPhoneE164(raw) {
  if (!raw) return raw;
  let phone = raw.replace(/[\s\-().]/g, "");
  if (phone.startsWith("+")) return phone;
  if (phone.startsWith("0")) {
    phone = "+61" + phone.slice(1);
  } else if (/^\d{9}$/.test(phone)) {
    phone = "+61" + phone;
  }
  return phone;
}

// ─── Populate Lead Selector ──────────────────────────────────────────────────
async function populateLeadSelector(selectId) {
  try {
    const { data: leads } = await sb
      .from("leads")
      .select("id, name, phone, email")
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false });
    const sel = document.getElementById(selectId);
    if (sel && leads) {
      sel.innerHTML = `<option value="">- Select a lead -</option>` +
        leads.map((l) => {
          const label = l.name || l.email || l.id;
          const sub = l.phone ? ` · ${l.phone}` : "";
          return `<option value="${l.id}">${label}${sub}</option>`;
        }).join("");
    }
  } catch (err) {
    toast("Failed to load leads.", true);
  }
}

// ─── Quote Modal Handlers ────────────────────────────────────────────────────
async function openQuoteModalHandler() {
  await populateLeadSelector("quoteLeadSelect");
  document.getElementById("quoteForm")?.reset();
  document.getElementById("quoteLineItems").innerHTML = "";
  recalcQuoteTotals();
  // Load quote defaults from company settings
  await prefillQuoteDefaults();
  openModal("quoteModal");
}

async function prefillQuoteDefaults() {
  if (!currentCompanyId) return;
  try {
    const [{ data: company }, { data: agentConfig }] = await Promise.all([
      sb.from("companies").select("settings").eq("id", currentCompanyId).maybeSingle(),
      sb.from("sms_agent_config").select("quote_pricing_config").eq("company_id", currentCompanyId).maybeSingle(),
    ]);
    const s = company?.settings?.quote_defaults || {};
    document.getElementById("quoteAbn").value = s.abn || "";
    document.getElementById("quoteDepositMethod").value = s.deposit_method || "";
    document.getElementById("quoteDepositTerms").value = s.deposit_terms || "";
    document.getElementById("quoteServiceTerms").value = s.service_terms || "";
    document.getElementById("quoteShowAbn").checked = s.show_abn !== false;
    document.getElementById("quoteShowDeposit").checked = s.show_deposit !== false;
    document.getElementById("quoteShowServiceTerms").checked = s.show_service_terms !== false;
    document.getElementById("quoteShowValidUntil").checked = s.show_valid_until !== false;
    // Set tax rate from pricing config
    const pricingConfig = agentConfig?.quote_pricing_config || {};
    document.getElementById("quoteLineTaxRate").value = pricingConfig.tax_rate ?? DEFAULT_TAX_RATE;
    document.getElementById("quoteLineTaxMode").value = pricingConfig.tax_mode || "exclusive";
    // Set default valid_until date
    const validityDays = s.validity_days || 30;
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + validityDays);
    document.getElementById("quoteValidUntil").value = validDate.toISOString().split("T")[0];
  } catch (err) {
    console.error("Failed to load quote defaults:", err);
  }
}

function addQuoteLineItemRow(item = {}) {
  const container = document.getElementById("quoteLineItems");
  const row = document.createElement("div");
  row.className = "quote-line-item-row";
  row.style.cssText = "display:grid;grid-template-columns:1.5fr .5fr .6fr .6fr auto;gap:8px;align-items:center";
  row.innerHTML = `
    <input type="text" class="qli-desc" placeholder="Description" value="${item.description || ""}">
    <input type="number" class="qli-qty" min="0" step="1" placeholder="Qty" value="${item.quantity || 1}">
    <input type="number" class="qli-rate" min="0" step="0.01" placeholder="Rate" value="${item.rate || ""}">
    <input type="text" class="qli-total" readonly style="background:var(--surface);font-weight:500" value="${item.total || ""}">
    <button type="button" class="iconbtn btn-danger qli-remove" title="Remove">
      <span class="icon" data-icon="trash"></span>
    </button>`;
  container.appendChild(row);
  // Attach event listeners
  row.querySelector(".qli-qty").addEventListener("input", recalcQuoteTotals);
  row.querySelector(".qli-rate").addEventListener("input", recalcQuoteTotals);
  row.querySelector(".qli-remove").addEventListener("click", function() {
    row.remove();
    recalcQuoteTotals();
  });
  recalcQuoteTotals();
  renderIcons();
}

function recalcQuoteTotals() {
  let subtotal = 0;
  document.querySelectorAll(".quote-line-item-row").forEach((row) => {
    const qty = parseFloat(row.querySelector(".qli-qty")?.value) || 0;
    const rate = parseFloat(row.querySelector(".qli-rate")?.value) || 0;
    const lineTotal = qty * rate;
    row.querySelector(".qli-total").value = lineTotal ? lineTotal.toFixed(2) : "";
    subtotal += lineTotal;
  });
  const taxRate = parseFloat(document.getElementById("quoteLineTaxRate")?.value) || DEFAULT_TAX_RATE;
  const taxMode = document.getElementById("quoteLineTaxMode")?.value || "exclusive";
  let tax, total;
  if (taxMode === "inclusive") {
    // Prices already include GST - back-calculate the tax component
    total = subtotal;
    tax = subtotal - (subtotal / (1 + taxRate / 100));
    subtotal = total - tax;
  } else {
    // Add GST on top of prices
    tax = subtotal * (taxRate / 100);
    total = subtotal + tax;
  }
  const taxLabel = taxMode === "inclusive" ? "GST (incl.)" : "GST";
  const subtotalLabel = taxMode === "inclusive" ? "Subtotal (excl. GST)" : "Subtotal";
  const fmtMoney = (v) => v ? fmt(v) : "";
  document.getElementById("quoteSubtotal").value = fmtMoney(subtotal);
  document.getElementById("quoteTax").value = fmtMoney(tax);
  document.getElementById("quoteTotal").value = fmtMoney(total);
  const taxLabelEl = document.getElementById("quoteTaxLabel");
  const subtotalLabelEl = document.getElementById("quoteSubtotalLabel");
  if (taxLabelEl) taxLabelEl.textContent = taxLabel;
  if (subtotalLabelEl) subtotalLabelEl.textContent = subtotalLabel;
}

function collectQuoteLineItems() {
  const items = [];
  document.querySelectorAll(".quote-line-item-row").forEach((row) => {
    const description = row.querySelector(".qli-desc")?.value?.trim();
    const quantity = parseFloat(row.querySelector(".qli-qty")?.value) || 1;
    const rate = parseFloat(row.querySelector(".qli-rate")?.value) || 0;
    const total = quantity * rate;
    if (description) items.push({ description, quantity, rate, total });
  });
  return items;
}

async function handleQuoteSave(e) {
  e.preventDefault();
  const leadId = document.getElementById("quoteLeadSelect")?.value;
  if (!leadId) { toast("Please select a lead.", true); return; }

  const lineItems = collectQuoteLineItems();
  const rawSubtotal = lineItems.reduce((sum, li) => sum + (li.total || 0), 0);
  const taxRate = parseFloat(document.getElementById("quoteLineTaxRate")?.value) || DEFAULT_TAX_RATE;
  const taxMode = document.getElementById("quoteLineTaxMode")?.value || "exclusive";
  let subtotal, tax, total;
  if (taxMode === "inclusive") {
    total = rawSubtotal;
    tax = rawSubtotal - (rawSubtotal / (1 + taxRate / 100));
    subtotal = total - tax;
  } else {
    subtotal = rawSubtotal;
    tax = subtotal * (taxRate / 100);
    total = subtotal + tax;
  }

  const payload = {
    company_id:   currentCompanyId,
    lead_id:      leadId,
    quote_number: document.getElementById("quoteNumber")?.value || null,
    subtotal:     subtotal || null,
    tax:          tax || null,
    total:        total || null,
    status:       document.getElementById("quoteStatus")?.value || "draft",
    notes:        document.getElementById("quoteNotes")?.value || null,
    valid_until:  document.getElementById("quoteValidUntil")?.value || null,
    line_items:   lineItems.length ? lineItems : [],
    metadata: {
      abn:                document.getElementById("quoteAbn")?.value?.trim() || null,
      deposit_method:     document.getElementById("quoteDepositMethod")?.value?.trim() || null,
      deposit_terms:      document.getElementById("quoteDepositTerms")?.value?.trim() || null,
      service_terms:      document.getElementById("quoteServiceTerms")?.value?.trim() || null,
      show_abn:           document.getElementById("quoteShowAbn")?.checked ?? true,
      show_deposit:       document.getElementById("quoteShowDeposit")?.checked ?? true,
      show_service_terms: document.getElementById("quoteShowServiceTerms")?.checked ?? true,
      show_valid_until:   document.getElementById("quoteShowValidUntil")?.checked ?? true,
      tax_rate:           taxRate,
      tax_mode:           taxMode,
    },
  };

  try {
    const { error } = await sb.from("quotes").insert(payload);
    if (error) { toast(error.message, true); return; }
    toast("Quote created.");
    closeModal("quoteModal");
    loadQuotes();
  } catch (err) {
    toast("Failed to create quote.", true);
  }
}

// ─── Appointment Modal Handlers ──────────────────────────────────────────────
async function openAppointmentModalHandler() {
  await populateLeadSelector("apptLeadSelect");
  document.getElementById("appointmentForm")?.reset();
  document.getElementById("apptEditId").value = "";
  document.getElementById("apptModalTitle").textContent = "New Appointment";
  document.getElementById("deleteAppointmentBtn").style.display = "none";
  openModal("appointmentModal");
}

async function openEditAppointment(apptId) {
  try {
    const { data: a } = await sb.from("appointments").select("*").eq("id", apptId).single();
    if (!a) { toast("Appointment not found.", true); return; }
    await populateLeadSelector("apptLeadSelect");
    document.getElementById("apptEditId").value = a.id;
    document.getElementById("apptModalTitle").textContent = "Edit Appointment";
    document.getElementById("apptLeadSelect").value = a.lead_id || "";
    document.getElementById("apptTitle").value = a.title || "";
    document.getElementById("apptType").value = a.appointment_type || "callback";
    document.getElementById("apptStatus").value = a.status || "scheduled";
    document.getElementById("apptStart").value = a.start_time ? a.start_time.slice(0, 16) : "";
    document.getElementById("apptEnd").value = a.end_time ? a.end_time.slice(0, 16) : "";
    document.getElementById("apptLocation").value = a.location || "";
    document.getElementById("apptNotes").value = a.notes || "";
    document.getElementById("deleteAppointmentBtn").style.display = "inline-flex";
    openModal("appointmentModal");
  } catch (err) {
    toast("Failed to load appointment.", true);
  }
}

async function handleAppointmentSave(e) {
  e.preventDefault();
  const leadId = document.getElementById("apptLeadSelect")?.value;
  if (!leadId) { toast("Please select a lead.", true); return; }

  const editId = document.getElementById("apptEditId")?.value;
  const payload = {
    company_id:       currentCompanyId,
    lead_id:          leadId,
    title:            document.getElementById("apptTitle")?.value || "Appointment",
    appointment_type: document.getElementById("apptType")?.value || "callback",
    status:           document.getElementById("apptStatus")?.value || "scheduled",
    start_time:       document.getElementById("apptStart")?.value || null,
    end_time:         document.getElementById("apptEnd")?.value || null,
    location:         document.getElementById("apptLocation")?.value || null,
    notes:            document.getElementById("apptNotes")?.value || null,
  };

  try {
    let error;
    if (editId) {
      ({ error } = await sb.from("appointments").update(payload).eq("id", editId));
    } else {
      ({ error } = await sb.from("appointments").insert(payload));
    }
    if (error) { toast(error.message, true); return; }
    toast(editId ? "Appointment updated." : "Appointment created.");
    closeModal("appointmentModal");
    loadAppointments();
  } catch (err) {
    toast("Failed to save appointment.", true);
  }
}

async function deleteAppointment() {
  const editId = document.getElementById("apptEditId")?.value;
  if (!editId) return;
  confirmAction("Delete this appointment?", async () => {
    try {
      await sb.from("appointments").delete().eq("id", editId);
      toast("Appointment deleted.");
      closeModal("appointmentModal");
      loadAppointments();
    } catch (err) {
      toast("Failed to delete appointment.", true);
    }
  });
}

// ─── Sale Modal Handlers ─────────────────────────────────────────────────────
async function openSaleModalHandler() {
  await populateLeadSelector("saleLeadSelect");
  document.getElementById("saleForm")?.reset();
  document.getElementById("saleEditId").value = "";
  document.getElementById("saleModalTitle").textContent = "Record Sale";
  openModal("saleModal");
}

async function openEditSale(leadId) {
  try {
    const { data: lead } = await sb.from("leads").select("id, name, pipeline_stage, value, notes").eq("id", leadId).single();
    if (!lead) { toast("Lead not found.", true); return; }
    await populateLeadSelector("saleLeadSelect");
    document.getElementById("saleEditId").value = lead.id;
    document.getElementById("saleModalTitle").textContent = "Edit Sale";
    document.getElementById("saleLeadSelect").value = lead.id;
    document.getElementById("saleOutcome").value = lead.pipeline_stage || "closed_won";
    document.getElementById("saleValue").value = lead.value || "";
    document.getElementById("saleNotes").value = lead.notes || "";
    openModal("saleModal");
  } catch (err) {
    toast("Failed to load sale.", true);
  }
}

async function handleSaleSave(e) {
  e.preventDefault();
  const editId = document.getElementById("saleEditId")?.value;
  const leadId = editId || document.getElementById("saleLeadSelect")?.value;
  if (!leadId) { toast("Please select a lead.", true); return; }

  const outcome = document.getElementById("saleOutcome")?.value || "closed_won";
  const value = Number(document.getElementById("saleValue")?.value) || null;
  const notes = document.getElementById("saleNotes")?.value || null;

  try {
    const updatePayload = { pipeline_stage: outcome };
    if (value !== null) updatePayload.value = value;
    if (notes) updatePayload.notes = notes;

    const { error } = await sb.from("leads").update(updatePayload).eq("id", leadId);
    if (error) { toast(error.message, true); return; }
    toast(editId ? "Sale updated." : "Sale recorded.");
    closeModal("saleModal");
    // Schedule a review request when recording a sale as closed_won
    if (outcome === "closed_won") {
      scheduleReviewRequest(leadId);
    }
    loadSales();
  } catch (err) {
    toast("Failed to save sale.", true);
  }
}

// ─── Pipeline / Kanban ────────────────────────────────────────────────────────
const KANBAN_STAGES = ["new_lead","follow_up","quote_in_progress","quoted","closed_won","closed_lost"];

async function loadPipeline() {
  if (!currentCompanyId) return;
  try {
    const { data } = await sb
      .from("leads")
      .select("id, name, email, phone, pipeline_stage, value, ai_score, ai_status, ai_summary, created_at")
      .eq("company_id", currentCompanyId);
    allLeads = data || [];
    buildKanban(allLeads);
  } catch (err) {
    toast("Failed to load pipeline.", true);
  }
}

function buildKanban(leads) {
  const board = document.getElementById("kanbanBoard");
  if (!board) return;

  board.innerHTML = KANBAN_STAGES.map((stage) => {
    const cards = leads.filter((l) => l.pipeline_stage === stage);
    return `
      <div class="col"
           data-stage="${stage}"
           ondragover="kanbanDragOver(event)"
           ondrop="kanbanDrop(event,'${stage}')"
           ondragleave="kanbanDragLeave(event)">
        <div class="colhead">
          <b>${stageLabel(stage)}</b><span class="chip">${cards.length}</span>
        </div>
        <div class="cards">
          ${cards.length
            ? cards.map((l) => {
                const ageHrs = (Date.now() - new Date(l.created_at).getTime()) / 3600000;
                const ageLabel = ageHrs < 24 ? `${Math.floor(ageHrs)}h`
                  : ageHrs < 168 ? `${Math.floor(ageHrs/24)}d`
                  : `${Math.floor(ageHrs/168)}w`;
                const isOverdue = ageHrs > 48 && !['closed_won','closed_lost'].includes(l.pipeline_stage);
                return `
              <div class="kcard"
                   draggable="true"
                   data-lead-id="${l.id}"
                   ondragstart="kanbanDragStart(event,'${l.id}')"
                   ondragend="kanbanDragEnd(event)"
                   onclick="openOpportunityModal('${l.id}')"
                   style="position:relative;cursor:pointer">
                <h3>${l.name || "-"}</h3>
                <p>${l.email || l.phone || "-"}</p>
                <span class="money">${l.value ? fmt(l.value) : "No value set"}</span>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
                  ${l.ai_score != null ? `<span class="chip ${aiStatusChipClass(l)}" style="font-size:10px">${aiScoreDisplay(l)}</span>` : '<span></span>'}
                  <span style="font-size:11px;color:${isOverdue ? '#c53535' : 'var(--muted)'}${isOverdue ? ';font-weight:600' : ''}">${ageLabel}</span>
                </div>
              </div>`;
              }).join("")
            : `<div class="kanban-drop-hint">Drop leads here</div>`}
        </div>
      </div>`;
  }).join("");

}

function kanbanDragStart(event, leadId) {
  dragLeadId = leadId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", leadId);
  setTimeout(() => event.target.classList.add("dragging"), 0);
}

function kanbanDragEnd(event) {
  event.target.classList.remove("dragging");
  document.querySelectorAll(".col.drag-over").forEach((el) => el.classList.remove("drag-over"));
}

function kanbanDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drag-over");
}

function kanbanDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove("drag-over");
  }
}

async function kanbanDrop(event, newStage) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");

  const leadId = event.dataTransfer.getData("text/plain") || dragLeadId;
  if (!leadId) return;

  // Optimistic update
  const lead = allLeads.find((l) => l.id === leadId);
  if (lead) lead.pipeline_stage = newStage;
  buildKanban(allLeads);

  try {
    const { error } = await sb.from("leads").update({ pipeline_stage: newStage }).eq("id", leadId);
    if (error) {
      toast(error.message, true);
      loadPipeline();
    } else {
      toast(`Moved to "${stageLabel(newStage)}"`);
      // Schedule a review request when moving to closed_won
      if (newStage === "closed_won") {
        scheduleReviewRequest(leadId);
      }
    }
  } catch (err) {
    toast("Failed to update status.", true);
    loadPipeline();
  }
  dragLeadId = null;
}

// ─── Quotes ───────────────────────────────────────────────────────────────────
function buildQuoteLink(token) {
  if (!token) return "";
  const url = new URL("quote-public.html", window.location.href);
  url.searchParams.set("token", token);
  return url.href;
}

async function loadQuotes() {
  if (!currentCompanyId) return;
  try {
    const from = quotesPage * PER_PAGE;
    const to = from + PER_PAGE - 1;
    const { data, count } = await sb
      .from("quotes")
      .select("id, quote_number, status, total, subtotal, tax, notes, created_at, sent_at, viewed_at, accepted_at, quote_token, valid_until, line_items, metadata, lead_id, leads(name, email, phone)", { count: "exact" })
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false })
      .range(from, to);
    const quotes = data || [];
    const el = document.getElementById("quotesPanel");
    if (!el) return;
    if (!quotes.length) {
      el.innerHTML = `<div class="empty">
  <span class="icon" data-icon="file" style="width:28px;height:28px"></span>
  <h3>No quotes yet</h3>
  <p>Create your first quote manually, or enable AI Quote Drafting so the agent drafts quotes automatically when leads are ready.</p>
  <div style="display:flex;gap:8px;margin-top:4px;justify-content:center">
    <button class="btn2" type="button" onclick="document.getElementById('openQuoteModal').click()">
      <span class="icon" data-icon="plus"></span> New quote
    </button>
    <button class="btn" type="button" onclick="navigateTo('ai-settings');setTimeout(()=>document.getElementById('advancedSettingsBody')?.classList.remove('hidden'),200)">
      Enable AI drafting →
    </button>
  </div>
</div>`;
      renderIcons();
      renderPagination("quotesPagination", quotesPage, 0, PER_PAGE, () => {});
      return;
    }
    el.innerHTML = `<div class="table-lite">${quotes.map((q) => {
      const lead = q.leads || {};
      const quoteLink = buildQuoteLink(q.quote_token);
      const isDraft = q.status === "draft";
      const itemCount = Array.isArray(q.line_items) ? q.line_items.length : 0;
      return `
      <div class="row" style="grid-template-columns:1.4fr .7fr .6fr auto">
        <div><strong style="font-size:13px">Quote #${esc(q.quote_number || q.id.slice(0,8))}</strong><span class="muted">${esc(lead.name || lead.email || lead.phone || "-")}${itemCount ? ` · ${itemCount} item${itemCount > 1 ? "s" : ""}` : ""}</span></div>
        <div><span class="chip">${cap(q.status || "draft")}</span></div>
        <div><strong style="font-size:13px">${fmt(q.total)}</strong><span class="muted">${fmtDate(q.created_at)}${q.valid_until ? ` · Valid: ${fmtDate(q.valid_until)}` : ""}</span></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${isDraft ? `<button class="btn2" style="padding:4px 10px;font-size:11px" onclick="approveAndSendQuote('${q.id}')" title="Approve quote and send link to lead">Approve &amp; Send</button>` : ""}
          <button class="btn" style="padding:4px 10px;font-size:11px" onclick="downloadQuotePDF('${q.id}')" title="Download PDF"><span class="icon" data-icon="file"></span> PDF</button>
          ${quoteLink ? `<button class="btn" style="padding:4px 10px;font-size:11px" onclick="copyQuoteLink('${quoteLink}')" title="Copy shareable link"><span class="icon" data-icon="external-link"></span> Link</button>` : ""}
        </div>
      </div>`;
    }).join("")}</div>`;
    renderIcons();
    renderPagination("quotesPagination", quotesPage, count, PER_PAGE, (page) => {
      quotesPage = page;
      loadQuotes();
    });
  } catch (err) {
    toast("Failed to load quotes.", true);
  }
}

// ─── Copy Quote Link ──────────────────────────────────────────────────────────
function copyQuoteLink(link) {
  navigator.clipboard.writeText(link).then(() => {
    toast("Quote link copied to clipboard!");
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement("textarea");
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("Quote link copied to clipboard!");
  });
}

// ─── Download Quote PDF ───────────────────────────────────────────────────────
async function downloadQuotePDF(quoteId) {
  if (!currentCompanyId) return;
  try {
    const { data: q } = await sb
      .from("quotes")
      .select("id, quote_number, status, subtotal, tax, total, valid_until, notes, line_items, metadata, created_at, sent_at, lead_id, leads(name, email, phone, address)")
      .eq("id", quoteId)
      .single();
    if (!q) { toast("Quote not found.", true); return; }

    const { data: company } = await sb
      .from("companies")
      .select("name, email, phone, logo_url")
      .eq("id", currentCompanyId)
      .single();

    const lead = q.leads || {};
    const co = company || {};

    // Load jsPDF from CDN if not already loaded
    if (typeof window.jspdf === "undefined") {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.integrity = "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk";
        s.crossOrigin = "anonymous";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    let y = 20;

    // Company logo
    if (co.logo_url) {
      try {
        doc.addImage(co.logo_url, "PNG", pw - 54, 10, 40, 40);
      } catch (e) { /* skip logo if format unsupported */ }
    }

    // Company info header with ABN
    doc.setFontSize(22);
    doc.setFont(undefined, "bold");
    doc.text(co.name || "Company", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    if (co.email) { doc.text(co.email + (co.phone ? "  ·  " + co.phone : ""), 14, y); y += 6; }
    const meta = q.metadata || {};
    if (meta.show_abn !== false && meta.abn) { doc.text("ABN: " + meta.abn, 14, y); y += 6; }

    // Quote title
    y += 6;
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("Quote #" + (q.quote_number || q.id.slice(0,8)), 14, y);
    y += 8;

    // Status + date
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("Status: " + (q.status || "Draft").toUpperCase(), 14, y);
    doc.text("Date: " + (q.created_at ? new Date(q.created_at).toLocaleDateString("en-AU") : "-"), pw - 14, y, { align: "right" });
    y += 6;
    if (meta.show_valid_until !== false && q.valid_until) {
      doc.text("Valid Until: " + new Date(q.valid_until).toLocaleDateString("en-AU"), 14, y);
      y += 6;
    }

    // Prepared for
    y += 4;
    doc.setFont(undefined, "bold");
    doc.text("Prepared For:", 14, y);
    y += 5;
    doc.setFont(undefined, "normal");
    doc.text(lead.name || "-", 14, y); y += 5;
    if (lead.email) { doc.text(lead.email, 14, y); y += 5; }
    if (lead.phone) { doc.text(lead.phone, 14, y); y += 5; }
    if (lead.address) { doc.text(lead.address, 14, y); y += 5; }

    // Line items
    const items = q.line_items || [];
    if (items.length) {
      y += 8;
      doc.setFont(undefined, "bold");
      doc.text("Line Items", 14, y); y += 6;
      doc.setFont(undefined, "normal");
      doc.setDrawColor(200);
      doc.line(14, y, pw - 14, y); y += 4;
      items.forEach((li) => {
        const desc = li.description || li.name || "Item";
        const qty = li.quantity ? " × " + li.quantity : "";
        const price = "$" + Number(li.total || li.price || 0).toFixed(2);
        doc.text(desc + qty, 14, y);
        doc.text(price, pw - 14, y, { align: "right" });
        y += 6;
      });
      doc.line(14, y, pw - 14, y); y += 4;
    }

    // Totals
    y += 4;
    if (q.subtotal) {
      doc.text("Subtotal:", pw - 60, y);
      doc.text("$" + Number(q.subtotal).toFixed(2), pw - 14, y, { align: "right" }); y += 6;
    }
    if (q.tax) {
      doc.text("Tax:", pw - 60, y);
      doc.text("$" + Number(q.tax).toFixed(2), pw - 14, y, { align: "right" }); y += 6;
    }
    doc.setFont(undefined, "bold");
    doc.setFontSize(14);
    doc.text("Total:", pw - 60, y);
    doc.text("$" + Number(q.total || 0).toFixed(2), pw - 14, y, { align: "right" });
    y += 10;

    // Notes
    if (q.notes) {
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text("Notes:", 14, y); y += 5;
      doc.setFont(undefined, "normal");
      const lines = doc.splitTextToSize(q.notes, pw - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 4;
    }

    // Deposit terms
    if (meta.show_deposit !== false && (meta.deposit_terms || meta.deposit_method)) {
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text("Deposit:", 14, y); y += 5;
      doc.setFont(undefined, "normal");
      const depositText = (meta.deposit_method ? meta.deposit_method + ". " : "") + (meta.deposit_terms || "");
      const depLines = doc.splitTextToSize(depositText, pw - 28);
      doc.text(depLines, 14, y);
      y += depLines.length * 5 + 4;
    }

    // Service terms
    if (meta.show_service_terms !== false && meta.service_terms) {
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text("Service Terms:", 14, y); y += 5;
      doc.setFont(undefined, "normal");
      const stLines = doc.splitTextToSize(meta.service_terms, pw - 28);
      doc.text(stLines, 14, y);
    }

    doc.save("Quote-" + (q.quote_number || q.id.slice(0,8)) + ".pdf");
    toast("PDF downloaded.");
  } catch (err) {
    console.error("PDF generation error:", err);
    toast("Failed to generate PDF.", true);
  }
}

// ─── Sales ────────────────────────────────────────────────────────────────────
async function loadSales() {
  if (!currentCompanyId) return;
  try {
    // Fetch summary stats from all closed deals (unpaginated counts + sums)
    const [{ count: wonCount }, { count: lostCount }] = await Promise.all([
      sb.from("leads").select("id", { count: "exact", head: true })
        .eq("company_id", currentCompanyId).eq("pipeline_stage", "closed_won"),
      sb.from("leads").select("id", { count: "exact", head: true })
        .eq("company_id", currentCompanyId).eq("pipeline_stage", "closed_lost"),
    ]);

    // Fetch paginated list of closed deals
    const from = salesPage * PER_PAGE;
    const to = from + PER_PAGE - 1;
    const { data, count } = await sb
      .from("leads")
      .select("id, name, pipeline_stage, value, created_at", { count: "exact" })
      .eq("company_id", currentCompanyId)
      .in("pipeline_stage", ["closed_won","closed_lost"])
      .order("created_at", { ascending: false })
      .range(from, to);
    const leads = data || [];
    const el = document.getElementById("salesPanel");
    if (!el) return;

    const totalDeals = (wonCount || 0) + (lostCount || 0);
    const winRate = totalDeals ? Math.round(((wonCount || 0) / totalDeals) * 100) : 0;

    el.innerHTML = `
      <div class="mini-grid" style="margin-bottom:20px">
        <div class="mini-card"><h3>Closed Won</h3><b>${wonCount || 0}</b></div>
        <div class="mini-card"><h3>Closed Lost</h3><b>${lostCount || 0}</b></div>
        <div class="mini-card"><h3>Win Rate</h3><b>${winRate}%</b><span class="muted">of closed deals</span></div>
      </div>
      ${leads.length ? `<div class="table-lite">${leads.map((l) => `
        <div class="row" style="cursor:pointer" onclick="openEditSale('${l.id}')">
          <div><strong style="font-size:13px">${l.name || "-"}</strong><span class="muted">${fmtDate(l.created_at)}</span></div>
          <div><span class="chip">${stageLabel(l.pipeline_stage)}</span></div>
          <div><strong style="font-size:13px">${fmt(l.value)}</strong></div>
        </div>`).join("")}</div>`
        : `<div class="empty"><p>No closed deals yet.</p></div>`}`;

    renderPagination("salesPagination", salesPage, count, PER_PAGE, (page) => {
      salesPage = page;
      loadSales();
    });
  } catch (err) {
    toast("Failed to load sales data.", true);
  }
}

// ─── Appointments ─────────────────────────────────────────────────────────────
async function loadAppointments() {
  if (!currentCompanyId) return;
  try {
    const from = appointmentsPage * PER_PAGE;
    const to = from + PER_PAGE - 1;
    const { data, count } = await sb
      .from("appointments")
      .select("id, title, status, start_time, end_time, location, notes, appointment_type, booked_by, lead_id, leads(name, phone)", { count: "exact" })
      .eq("company_id", currentCompanyId)
      .order("start_time", { ascending: false })
      .range(from, to);
    const appointments = data || [];
    const el = document.getElementById("appointmentsPanel");
    if (!el) return;

    if (!appointments.length) {
      el.innerHTML = `<div class="empty">
  <span class="icon" data-icon="calendar" style="width:28px;height:28px"></span>
  <h3>No appointments yet</h3>
  <p>The AI books callbacks and on-site visits automatically. You can also create one manually.</p>
  <button class="btn2" type="button" onclick="document.getElementById('openAppointmentModal').click()" style="margin-top:4px">
    <span class="icon" data-icon="plus"></span> New appointment
  </button>
</div>`;
      renderIcons();
      renderPagination("appointmentsPagination", appointmentsPage, 0, PER_PAGE, () => {});
      return;
    }

    el.innerHTML = `<div class="table-lite">${appointments.map((a) => `
      <div class="row" style="cursor:pointer" onclick="openEditAppointment('${a.id}')">
        <div>
          <strong style="font-size:13px">${esc(a.title || "Appointment")}</strong>
          <span class="muted">${esc(a.leads?.name || "Unknown lead")}</span>
        </div>
        <div>
          <span class="chip">${cap(a.status || "scheduled")}</span>
          ${a.appointment_type ? `<span class="chip">${cap(esc(a.appointment_type))}</span>` : ""}
          ${a.booked_by === "ai" ? `<span class="chip" style="background:#8b5cf6;color:#fff">Booked by AI</span>` : ""}
        </div>
        <div>
          <strong style="font-size:13px">${fmtDate(a.start_time)}</strong>
          <span class="muted">${fmtTime(a.start_time)}${a.end_time ? ` – ${fmtTime(a.end_time)}` : ""}</span>
        </div>
        <div><span class="muted">${esc(a.location || "-")}</span></div>
      </div>`).join("")}</div>`;

    renderPagination("appointmentsPagination", appointmentsPage, count, PER_PAGE, (page) => {
      appointmentsPage = page;
      loadAppointments();
    });
  } catch (err) {
    toast("Failed to load appointments.", true);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  if (!currentCompanyId || !currentUser) return;
  try {
    const [{ data: company }, { data: profile }] = await Promise.all([
      sb.from("companies").select("*").eq("id", currentCompanyId).maybeSingle(),
      sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
    ]);
    
    const settingsCompanyName = document.getElementById("settingsCompanyName");
    const settingsCompanyEmail = document.getElementById("settingsCompanyEmail");
    const settingsCompanyPhone = document.getElementById("settingsCompanyPhone");
    const settingsOwnerName = document.getElementById("settingsOwnerName");
    const settingsOwnerEmail = document.getElementById("settingsOwnerEmail");
    const settingsOwnerPhone = document.getElementById("settingsOwnerPhone");
    
    if (company) {
      if (settingsCompanyName) settingsCompanyName.value = company.name || "";
      if (settingsCompanyEmail) settingsCompanyEmail.value = company.email || "";
      if (settingsCompanyPhone) settingsCompanyPhone.value = company.phone || "";
      updateLogoPreview(company.logo_url);
      // Load quote defaults
      loadQuoteDefaultsUI(company.settings?.quote_defaults || {});
    }
    if (profile) {
      if (settingsOwnerName) settingsOwnerName.value = profile.full_name || "";
      if (settingsOwnerEmail) settingsOwnerEmail.value = currentUser.email || "";
      if (settingsOwnerPhone) settingsOwnerPhone.value = profile.phone || "";
    }
    await loadCustomFields();
    renderSettingsCustomFields();
    loadLeadRoutingUI(company?.settings || {});

    // Load service areas with lock state + latest request (any status). Taking
    // the most recent row (not maybeSingle on pending) avoids an error if a
    // company ever has more than one pending request, and lets us surface the
    // outcome of a rejected/approved request to the customer.
    let latestAreaReq = null;
    if (currentCompanyId) {
      const { data: reqRows } = await sb.from("ppl_area_change_requests")
        .select("id, status, admin_notes, created_at, resolved_at")
        .eq("company_id", currentCompanyId)
        .order("created_at", { ascending: false })
        .limit(1);
      latestAreaReq = reqRows?.[0] || null;
    }
    loadServiceAreasUI(
      company?.ppl_agreed_postcodes || [],
      company?.ppl_area_locked !== false, // default locked
      latestAreaReq
    );

    await loadPplOrdersUI();

    // AI data sharing toggle
    const aiShareToggle = document.getElementById("settingsAllowAiTraining");
    if (aiShareToggle) aiShareToggle.checked = company?.settings?.allow_ai_training === true;
    document.getElementById("saveAiSharingBtn")?.addEventListener("click", async () => {
      const allowed = document.getElementById("settingsAllowAiTraining")?.checked ?? false;
      const { data: cur } = await sb.from("companies").select("settings").eq("id", currentCompanyId).maybeSingle();
      const merged = { ...(cur?.settings || {}), allow_ai_training: allowed };
      const { error } = await sb.from("companies").update({ settings: merged }).eq("id", currentCompanyId);
      if (error) { toast("Failed to save preference.", true); return; }
      toast(allowed ? "Opted in to benchmark contributions." : "Opted out of benchmark contributions.");
    }, { once: true });

    // Lead Delivery - load
    const delivery = company?.settings?.lead_delivery || {};
    const deliveryEmailEl   = document.getElementById("deliveryEmail");
    const deliverySmsEl     = document.getElementById("deliverySms");
    const deliveryWebhookEl = document.getElementById("deliveryWebhook");
    if (deliveryEmailEl)   deliveryEmailEl.value   = delivery.email       || "";
    if (deliverySmsEl)     deliverySmsEl.value     = delivery.sms_number  || "";
    if (deliveryWebhookEl) deliveryWebhookEl.value = delivery.webhook_url || "";

    // Lead Delivery - save. Bind once for the page's lifetime (loadSettings runs
    // on every visit to this page; a guard stops duplicate listeners stacking,
    // and avoids the old `{ once: true }` that broke the 2nd save in a visit).
    const leadDeliveryForm = document.getElementById("leadDeliveryForm");
    if (leadDeliveryForm && !leadDeliveryForm.dataset.bound) {
      leadDeliveryForm.dataset.bound = "1";
      leadDeliveryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email       = document.getElementById("deliveryEmail")?.value.trim()   || null;
        const sms_number  = document.getElementById("deliverySms")?.value.trim()     || null;
        const webhook_url = document.getElementById("deliveryWebhook")?.value.trim() || null;

        const saveBtn = leadDeliveryForm.querySelector('button[type="submit"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
        try {
          // 1. Save to ql-hq (the source of truth for the client's preference)
          const { data: cur } = await sb.from("companies").select("settings").eq("id", currentCompanyId).maybeSingle();
          const merged = { ...(cur?.settings || {}), lead_delivery: { email, sms_number, webhook_url } };
          const { error } = await sb.from("companies").update({ settings: merged }).eq("id", currentCompanyId);
          if (error) { toast("Failed to save delivery settings.", true); return; }

          // 2. Sync to ql-mc, which is what actually delivers leads. Awaited so
          //    the toast reflects whether the change really propagated.
          let synced = false;
          const { data: _sdRes } = await sb.auth.getSession();
          if (_sdRes?.session) {
            try {
              const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-delivery-config`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${_sdRes.session.access_token}`, "apikey": SUPABASE_ANON_KEY },
              });
              synced = res.ok;
            } catch (err) { console.warn("sync-delivery-config:", err); }
          }

          if (synced) toast("Delivery settings saved.");
          else toast("Saved, but syncing to the delivery system failed - please save again.", true);
        } finally {
          if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Delivery Settings"; }
        }
      });
    }
  } catch (err) {
    toast("Failed to load settings.", true);
  }
}

// ── Lead Routing ────────────────────────────────────────────────────────────
function loadLeadRoutingUI(settings) {
  const routing = settings?.lead_routing || {};
  const mode = routing.mode || "all";

  // Set radio
  const radios = document.querySelectorAll('[name="routingMode"]');
  radios.forEach((r) => { r.checked = r.value === mode; });

  // Show/hide postcode rules
  togglePostcodeRules(mode);

  // Load postcode rules
  if (routing.postcode_rules?.length) {
    const list = document.getElementById("postcodeRulesList");
    if (list) {
      list.innerHTML = "";
      routing.postcode_rules.forEach((rule) => addPostcodeRule(rule));
    }
  }

  // Radio change handler
  radios.forEach((r) => r.addEventListener("change", () => togglePostcodeRules(r.value)));

  // Hide panel for non-admins
  const panel = document.getElementById("leadRoutingPanel");
  if (panel) panel.style.display = isAdmin() ? "" : "none";
}

function togglePostcodeRules(mode) {
  const container = document.getElementById("postcodeRulesContainer");
  if (container) container.style.display = mode === "postcode" ? "block" : "none";
}

async function addPostcodeRule(existing) {
  const list = document.getElementById("postcodeRulesList");
  if (!list) return;

  // Fetch reps for dropdown
  let repsOptions = "";
  if (!list._repsCache) {
    const { data: reps } = await sb
      .from("sales_reps")
      .select("id, user_id, name")
      .eq("company_id", currentCompanyId)
      .eq("is_active", true);
    list._repsCache = reps || [];
  }
  repsOptions = list._repsCache.map((r) =>
    `<option value="${r.user_id}" ${existing?.rep_id === r.user_id ? "selected" : ""}>${r.name}</option>`
  ).join("");

  const row = document.createElement("div");
  row.className = "pc-rule-row";
  row.innerHTML = `
    <input type="text" class="pc-postcodes" placeholder="e.g. 2000, 2010-2050" value="${existing?.postcodes?.join(", ") || ""}">
    <select class="pc-rep">
      <option value="">Select rep…</option>
      ${repsOptions}
    </select>
    <button type="button" class="iconbtn btn-danger" onclick="this.parentElement.remove()" style="flex-shrink:0"><span class="icon" data-icon="trash"></span></button>
  `;
  list.appendChild(row);
  renderIcons();
}
window.addPostcodeRule = addPostcodeRule;

async function handleLeadRoutingSave(e) {
  e.preventDefault();
  const mode = document.querySelector('[name="routingMode"]:checked')?.value || "all";

  const routing = { mode, round_robin_index: 0 };

  if (mode === "postcode") {
    const rules = [];
    document.querySelectorAll("#postcodeRulesList > div").forEach((row) => {
      const postcodes = row.querySelector(".pc-postcodes")?.value
        .split(",").map((s) => s.trim()).filter(Boolean);
      const rep_id = row.querySelector(".pc-rep")?.value;
      if (postcodes.length && rep_id) rules.push({ postcodes, rep_id });
    });
    routing.postcode_rules = rules;
  }

  try {
    // Read current settings, merge in lead_routing
    const { data: company } = await sb
      .from("companies")
      .select("settings")
      .eq("id", currentCompanyId)
      .maybeSingle();

    const settings = company?.settings || {};
    settings.lead_routing = routing;

    const { error } = await sb
      .from("companies")
      .update({ settings })
      .eq("id", currentCompanyId);

    if (error) { toast(error.message, true); return; }
    toast("Lead routing saved.");
  } catch (err) {
    toast("Failed to save routing.", true);
  }
}

let pendingLogoDataUrl = null;
let removeLogo = false;

function updateLogoPreview(url) {
  const preview = document.getElementById("settingsLogoPreview");
  const removeBtn = document.getElementById("removeLogoBtn");
  if (!preview) return;
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.style.cssText = "width:48px;height:48px;object-fit:contain";
    img.alt = "Logo";
    preview.innerHTML = "";
    preview.appendChild(img);
    if (removeBtn) removeBtn.style.display = "inline-flex";
  } else {
    preview.innerHTML = `<span class="muted" style="font-size:10px">No logo</span>`;
    if (removeBtn) removeBtn.style.display = "none";
  }
}

function handleLogoFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 500 * 1024) { toast("Logo must be under 500KB.", true); e.target.value = ""; return; }
  const reader = new FileReader();
  reader.onload = function (ev) {
    pendingLogoDataUrl = ev.target.result;
    removeLogo = false;
    updateLogoPreview(pendingLogoDataUrl);
  };
  reader.readAsDataURL(file);
}

function handleRemoveLogo() {
  pendingLogoDataUrl = null;
  removeLogo = true;
  updateLogoPreview(null);
  const logoInput = document.getElementById("settingsCompanyLogo");
  if (logoInput) logoInput.value = "";
}

// ─── PPL Service Areas ────────────────────────────────────────────────────────
function loadServiceAreasUI(postcodes, locked, requestInfo) {
  const container = document.getElementById("serviceAreaTagsContainer");
  if (!container) return;
  container.innerHTML = "";
  const isLocked = locked !== false;
  postcodes.forEach((pc) => _renderServiceAreaTag(container, pc, !isLocked));

  // requestInfo may be a request object {status, admin_notes,...}, or a legacy
  // boolean (true = a request is pending).
  const latestReq = (requestInfo && typeof requestInfo === "object") ? requestInfo : null;
  const hasPendingRequest = latestReq ? latestReq.status === "pending" : requestInfo === true;
  const wasRejected = latestReq ? latestReq.status === "rejected" : false;

  const note     = document.getElementById("serviceAreaAutoNote");
  const badge    = document.getElementById("serviceAreaLockBadge");
  const lockedEl = document.getElementById("serviceAreaLockedNote");
  const pendEl   = document.getElementById("serviceAreaPendingNote");
  const rejEl    = document.getElementById("serviceAreaRejectedNote");
  const rejReason= document.getElementById("serviceAreaRejectedReason");
  const editEl   = document.getElementById("serviceAreaEditSection");
  const reqBtn   = document.getElementById("requestServiceAreaChangeBtn");
  const reqForm  = document.getElementById("serviceAreaRequestForm");

  if (rejEl) rejEl.style.display = "none";
  if (rejReason) rejReason.textContent = wasRejected && latestReq.admin_notes ? " Reason: " + latestReq.admin_notes : "";

  if (note) note.style.display = (!isLocked && postcodes.length > 0) ? "" : "none";
  if (reqForm) reqForm.style.display = "none";

  if (badge) {
    badge.style.display = "";
    if (isLocked) {
      badge.textContent = "🔒 Locked";
      badge.style.background = "rgba(185,28,28,.08)";
      badge.style.color = "#b91c1c";
      badge.style.borderColor = "rgba(185,28,28,.2)";
    } else {
      badge.textContent = "🔓 Unlocked";
      badge.style.background = "rgba(22,163,74,.08)";
      badge.style.color = "#15803d";
      badge.style.borderColor = "rgba(22,163,74,.2)";
    }
  }

  if (!isLocked) {
    if (lockedEl) lockedEl.style.display = "none";
    if (pendEl)   pendEl.style.display   = "none";
    if (editEl)   editEl.style.display   = "";
    if (reqBtn)   reqBtn.style.display   = "none";
  } else if (hasPendingRequest) {
    if (lockedEl) lockedEl.style.display = "none";
    if (pendEl)   pendEl.style.display   = "";
    if (editEl)   editEl.style.display   = "none";
    if (reqBtn)   reqBtn.style.display   = "none";
  } else {
    if (lockedEl) lockedEl.style.display = wasRejected ? "none" : "";
    if (pendEl)   pendEl.style.display   = "none";
    if (rejEl)    rejEl.style.display    = wasRejected ? "" : "none";
    if (editEl)   editEl.style.display   = "none";
    if (reqBtn)   reqBtn.style.display   = "";
  }
}

function _renderServiceAreaTag(container, postcode, removable) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.dataset.postcode = postcode.toUpperCase();
  if (removable) {
    tag.innerHTML = `${postcode.toUpperCase()} <button type="button" style="background:none;border:none;cursor:pointer;padding:0;line-height:1;font-size:13px;opacity:0.6" aria-label="Remove">&times;</button>`;
    tag.querySelector("button").addEventListener("click", () => tag.remove());
  } else {
    tag.textContent = postcode.toUpperCase();
  }
  container.appendChild(tag);
}

function _addServiceAreaFromInput() {
  const input = document.getElementById("serviceAreaInput");
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const container = document.getElementById("serviceAreaTagsContainer");
  if (!container) return;
  const existing = new Set([...container.querySelectorAll(".tag")].map((t) => t.dataset.postcode));
  const entries = raw.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  entries.forEach((val) => {
    if (!existing.has(val)) {
      _renderServiceAreaTag(container, val, true);
      existing.add(val);
    }
  });
  input.value = "";
}

async function handleServiceAreasSave() {
  if (!currentCompanyId) return;
  const container = document.getElementById("serviceAreaTagsContainer");
  if (!container) return;
  const postcodes = [...container.querySelectorAll(".tag")].map((t) => t.dataset.postcode).filter(Boolean);
  const btn = document.getElementById("saveServiceAreasBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const { error } = await sb.from("companies").update({
      ppl_agreed_postcodes: postcodes,
      ppl_area_locked: true,
    }).eq("id", currentCompanyId);
    if (error) { toast(error.message, true); return; }
    toast("Service areas saved and re-locked.");
    loadServiceAreasUI(postcodes, true, false);
  } catch {
    toast("Failed to save service areas.", true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save & Re-lock Service Areas"; }
  }
}

document.getElementById("requestServiceAreaChangeBtn")?.addEventListener("click", () => {
  const form = document.getElementById("serviceAreaRequestForm");
  if (form) form.style.display = "";
  const btn = document.getElementById("requestServiceAreaChangeBtn");
  if (btn) btn.style.display = "none";
});

document.getElementById("serviceAreaRequestCancelBtn")?.addEventListener("click", () => {
  const form = document.getElementById("serviceAreaRequestForm");
  if (form) form.style.display = "none";
  const btn = document.getElementById("requestServiceAreaChangeBtn");
  if (btn) btn.style.display = "";
});

document.getElementById("serviceAreaRequestSubmitBtn")?.addEventListener("click", async () => {
  if (!currentCompanyId) return;
  const msgEl = document.getElementById("serviceAreaRequestMessage");
  const message = msgEl ? msgEl.value.trim() : "";
  const btn = document.getElementById("serviceAreaRequestSubmitBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }
  try {
    const { error } = await sb.from("ppl_area_change_requests").insert({
      company_id: currentCompanyId,
      message: message || null,
    });
    if (error) { toast("Failed to submit request: " + error.message, true); return; }
    if (msgEl) msgEl.value = "";
    const form = document.getElementById("serviceAreaRequestForm");
    if (form) form.style.display = "none";
    const container = document.getElementById("serviceAreaTagsContainer");
    const postcodes = [...(container?.querySelectorAll(".tag") || [])].map((t) => t.dataset.postcode).filter(Boolean);
    loadServiceAreasUI(postcodes, true, true);
    toast("Change request submitted. An admin will review it shortly.");
  } catch (e) {
    toast("Failed to submit request.", true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Submit Request"; }
  }
});

// ─── PPL Orders ───────────────────────────────────────────────────────────────

async function loadPplOrdersUI() {
  const container = document.getElementById("pplOrdersList");
  if (!container || !currentCompanyId) return;

  const newOrderBtn = document.getElementById("openPplOrderModal");
  if (newOrderBtn) newOrderBtn.style.display = currentUserIsSuperAdmin ? "" : "none";

  const { data: orders, error } = await sb
    .from("ppl_lead_orders")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("created_at", { ascending: false });

  if (error) { container.innerHTML = `<div class="notice">Failed to load orders.</div>`; return; }
  if (!orders?.length) { container.innerHTML = `<div class="notice">No PPL orders yet. Create one to start tracking lead delivery.</div>`; return; }

  const fmt = v => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
  const statusColor = s => ({ pending:"#9a9a9a", paid:"#4797FF", active:"#22c55e", fulfilled:"#22c55e", cancelled:"#ef4444" }[s] || "#9a9a9a");

  // Populate cache so retryPplOrder works from this panel too
  orders.forEach(o => _pplOrdersCache.set(o.id, o));

  const totalSpend = orders.filter(o => o.status !== "cancelled" && o.status !== "pending").reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  container.innerHTML = `<div style="font-size:12px;color:var(--muted);margin-bottom:14px">${orders.length} order${orders.length === 1 ? "" : "s"} · Total spend: <strong style="color:var(--text)">${fmt(totalSpend)}</strong></div>`
    + orders.map((o) => {
    const isPending = o.status === "pending";
    const pct    = o.quantity > 0 ? Math.min(100, Math.round((o.delivered_count / o.quantity) * 100)) : 0;
    const colour = o.status === "cancelled" ? "#9e9e9e" : pct >= 100 ? "#22c55e" : pct >= 60 ? "#4797FF" : "#f59e0b";
    const city   = o.area_city || o.area || "-";
    const statusBadge = `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${statusColor(o.status)}22;color:${statusColor(o.status)};text-transform:uppercase;letter-spacing:.5px">${o.status}</span>`;

    if (isPending) {
      return `
      <div style="border:1px solid #f59e0b55;border-radius:12px;padding:16px;margin-bottom:12px;background:#f59e0b0a">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              ${statusBadge}
              <span style="font-size:13px;font-weight:600">${nicheLabel(o.niche)}${o.sub_niche ? ` › ${subNicheLabel(o.sub_niche)}` : ''} - ${city}</span>
            </div>
            <div style="font-size:12px;color:var(--muted)">
              ${fmt(o.total_amount || 0)} · ${o.quantity} leads · ${new Date(o.created_at).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" })}
            </div>
            <div style="font-size:11px;color:#f59e0b;margin-top:4px;font-weight:500">Payment not completed</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn2" style="font-size:12px;padding:6px 14px" onclick="retryPplOrder('${o.id}')">Complete Payment</button>
            <button class="btn btn-danger" style="font-size:12px;padding:6px 12px" onclick="deletePendingOrderFromSettings('${o.id}')">Delete</button>
          </div>
        </div>
      </div>`;
    }

    const cancelBtn = ["paid","active"].includes(o.status) && currentUserIsSuperAdmin
      ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 10px" onclick="cancelPplOrder('${o.id}')">Cancel</button>`
      : "";
    return `
      <div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;background:var(--surface-2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              ${statusBadge}
              <span style="font-size:13px;font-weight:600">${nicheLabel(o.niche)}${o.sub_niche ? ` › ${subNicheLabel(o.sub_niche)}` : ''} - ${city}</span>
            </div>
            <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:4px">
              ${o.delivered_count} / ${o.quantity}
              <span style="font-size:13px;font-weight:400;color:var(--muted)">leads delivered</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
              ${fmt(o.total_amount)} · Ordered ${new Date(o.created_at).toLocaleDateString("en-AU", { day:"numeric", month:"short", year:"numeric" })}
              ${o.stripe_session_id ? "" : " · Manual order"}
            </div>
            <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${colour};border-radius:4px;transition:width .3s"></div>
            </div>
          </div>
          <div style="flex-shrink:0">${cancelBtn}</div>
        </div>
      </div>`;
  }).join("");
}

async function handleCreatePplOrder(e) {
  e.preventDefault();
  if (!currentCompanyId) return;
  if (!currentUserIsSuperAdmin) { toast("Only super admins can create PPL orders.", true); return; }

  const niche = document.getElementById("pplOrderNiche")?.value;
  const city  = document.getElementById("pplOrderCity")?.value?.trim();
  const qty   = parseInt(document.getElementById("pplOrderQty")?.value, 10);
  const ppl   = parseFloat(document.getElementById("pplOrderPPL")?.value);

  if (!niche || !city || !qty || qty < 1 || isNaN(ppl) || ppl < 0) {
    toast("Please fill in all required fields.", true);
    return;
  }

  try {
    const { error } = await sb.from("ppl_lead_orders").insert({
      company_id:    currentCompanyId,
      niche,
      area:          city,
      area_city:     city,
      location_type: "radius",
      quantity:      qty,
      price_per_lead: ppl,
      total_amount:  qty * ppl,
      status:        "active",
    });
    if (error) { toast(error.message, true); return; }
    toast("PPL order created.");
    closeModal("pplOrderModal");
    document.getElementById("pplOrderForm")?.reset();
    await loadPplOrdersUI();
    await loadBuyLeads();
  } catch (err) {
    toast("Failed to create order: " + err.message, true);
  }
}

async function cancelPplOrder(orderId) {
  confirmAction("Cancel this PPL order? It will no longer count incoming leads.", async () => {
    try {
      const { error } = await sb.from("ppl_lead_orders").update({ status: "cancelled" }).eq("id", orderId);
      if (error) { toast(error.message, true); return; }
      toast("Order cancelled.");
      await loadPplOrdersUI();
      await loadBuyLeads();
    } catch {
      toast("Failed to cancel order.", true);
    }
  });
}
window.cancelPplOrder = cancelPplOrder;

async function handleCompanyProfileSave(e) {
  e.preventDefault();
  if (!currentCompanyId) {
    toast("Unable to save: no company is associated with your account. Please contact support.", true);
    return;
  }
  const companyName = document.getElementById("settingsCompanyName")?.value;
  const ownerName   = document.getElementById("settingsOwnerName")?.value;
  
  try {
    const companyUpdate = {
      name:  companyName,
      email: document.getElementById("settingsCompanyEmail")?.value,
      phone: document.getElementById("settingsCompanyPhone")?.value,
    };
    if (pendingLogoDataUrl) companyUpdate.logo_url = pendingLogoDataUrl;
    if (removeLogo) companyUpdate.logo_url = null;

    const [{ error: ce }, { error: pe }] = await Promise.all([
      sb.from("companies").update(companyUpdate).eq("id", currentCompanyId),
      sb.from("profiles").update({
        full_name: ownerName,
        phone:     document.getElementById("settingsOwnerPhone")?.value,
      }).eq("id", currentUser.id),
    ]);
    if (ce || pe) { toast((ce || pe).message, true); return; }
    pendingLogoDataUrl = null;
    removeLogo = false;
    toast("Profile saved.");
    
    const brandCompanyName = document.getElementById("brandCompanyName");
    const sidebarAccountName = document.getElementById("sidebarAccountName");
    if (brandCompanyName) brandCompanyName.textContent = companyName;
    if (sidebarAccountName) sidebarAccountName.textContent = ownerName;
  } catch (err) {
    toast("Failed to save profile.", true);
  }
}

// ─── Quote Defaults ───────────────────────────────────────────────────────────
function loadQuoteDefaultsUI(defaults) {
  setInputValue("defaultAbn", defaults.abn);
  setInputValue("defaultQuoteValidityDays", defaults.validity_days ?? 30);
  setInputValue("defaultDepositMethod", defaults.deposit_method);
  setInputValue("defaultDepositTerms", defaults.deposit_terms);
  setInputValue("defaultServiceTerms", defaults.service_terms);
  setCheckboxValue("defaultShowAbn", defaults.show_abn !== false);
  setCheckboxValue("defaultShowDeposit", defaults.show_deposit !== false);
  setCheckboxValue("defaultShowServiceTerms", defaults.show_service_terms !== false);
  setCheckboxValue("defaultShowValidUntil", defaults.show_valid_until !== false);
}

async function handleQuoteDefaultsSave(e) {
  e.preventDefault();
  if (!currentCompanyId) return;
  try {
    // Fetch current settings to merge
    const { data: company } = await sb.from("companies").select("settings").eq("id", currentCompanyId).maybeSingle();
    const currentSettings = company?.settings || {};
    const quoteDefaults = {
      abn:                document.getElementById("defaultAbn")?.value?.trim() || "",
      validity_days:      parseInt(document.getElementById("defaultQuoteValidityDays")?.value) || 30,
      deposit_method:     document.getElementById("defaultDepositMethod")?.value?.trim() || "",
      deposit_terms:      document.getElementById("defaultDepositTerms")?.value?.trim() || "",
      service_terms:      document.getElementById("defaultServiceTerms")?.value?.trim() || "",
      show_abn:           document.getElementById("defaultShowAbn")?.checked ?? true,
      show_deposit:       document.getElementById("defaultShowDeposit")?.checked ?? true,
      show_service_terms: document.getElementById("defaultShowServiceTerms")?.checked ?? true,
      show_valid_until:   document.getElementById("defaultShowValidUntil")?.checked ?? true,
    };
    const updatedSettings = { ...currentSettings, quote_defaults: quoteDefaults };
    const { error } = await sb.from("companies").update({ settings: updatedSettings }).eq("id", currentCompanyId);
    if (error) { toast(error.message, true); return; }
    toast("Quote defaults saved.");
  } catch (err) {
    toast("Failed to save quote defaults.", true);
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const np = document.getElementById("newPassword")?.value;
  const cp = document.getElementById("confirmNewPassword")?.value;
  if (np !== cp) { toast("Passwords do not match.", true); return; }
  try {
    const { error } = await sb.auth.updateUser({ password: np });
    if (error) { toast(error.message, true); return; }
    toast("Password updated.");
    document.getElementById("passwordForm")?.reset();
  } catch (err) {
    toast("Failed to update password.", true);
  }
}

// =============================================================================
// AI SETTINGS - UPDATED WITH ALL REQUIRED FIELDS
// =============================================================================

async function loadAiSettings() {
  if (!currentCompanyId) return;
  
  try {
    // Load AI settings
    const { data } = await sb
      .from("sms_agent_config")
      .select("*")
      .eq("company_id", currentCompanyId)
      .maybeSingle();
    
    // Populate form fields
    if (data) {
      // General settings
      setInputValue("aiModel", data.model);
      setInputValue("aiTwilioNumber", data.twilio_number);
      setInputValue("aiReplyDelay", data.reply_delay_seconds ?? "");
      setInputValue("aiMaxWords", data.max_sms_words ?? "");
      
      // Toggle switches
      setCheckboxValue("aiEnabled", data.is_active);
      setCheckboxValue("aiAutoReply", data.auto_reply);
      setCheckboxValue("aiOutOfHoursOnly", data.out_of_hours_only);
      setCheckboxValue("aiCallbackEnabled", data.callback_enabled);
      setCheckboxValue("aiOnsiteEnabled", data.onsite_enabled);
      setCheckboxValue("aiQuoteDraftingEnabled", data.quote_drafting_enabled);
      setCheckboxValue("aiLeadScoringEnabled", data.lead_scoring_enabled);
      setCheckboxValue("aiAutoSendWelcome", data.auto_send_welcome);
      
      // Call-back settings
      setInputValue("aiAgentName", data.agent_name);
      setInputValue("aiCallbackStartTime", data.callback_hours_start);
      setInputValue("aiCallbackEndTime", data.callback_hours_end);
      setInputValue("aiSpecialOffers", data.special_offers);
      setInputValue("aiWelcomeMessage", data.welcome_message);
      
      // On-site settings
      setInputValue("aiServiceLocations", Array.isArray(data.service_locations) ? data.service_locations.join("\n") : "");
      setInputValue("aiMaxTravelDistance", data.max_travel_distance);
      setInputValue("aiMaxTravelUnit", data.max_travel_distance_unit);
      setInputValue("aiPreparationRequired", data.preparation_required);
      
      // Quote follow-up automation
      setCheckboxValue("aiAutomateQuoteFollowup", data.automate_quote_followup);
      setInputValue("aiFollowupMessage", data.followup_message);
      setInputValue("aiDaysUntilFollowup", data.days_until_followup);
      
      // Quote pricing config
      loadPricingConfigUI(data.quote_pricing_config);
      
      // System prompt
      const systemPromptEl = document.getElementById("aiSystemPrompt");
      if (systemPromptEl) {
        systemPromptEl.value = data.system_prompt || "";
      }
      
      // Update prompt help text
      const promptHelp = document.getElementById("aiPromptHelp");
      if (promptHelp) {
        promptHelp.textContent = "Add extra instructions for the AI - e.g. specific services to promote, things to avoid, or how to handle objections.";
      }

    }
    
    // Load Twilio numbers count
    const { data: nums } = await sb
      .from("twilio_numbers")
      .select("id")
      .eq("company_id", currentCompanyId);
    
    const count = nums?.length || 0;
    const twilioCountValue = document.getElementById("twilioCountValue");
    if (twilioCountValue) twilioCountValue.textContent = count;

    const pendingNotice = document.getElementById("smsNumberPendingNotice");
    if (pendingNotice) pendingNotice.classList.toggle("hidden", count > 0);

    loadTwilioNumbers();
    loadWorkflowRuns();

    // When AI is enabled, callbacks must also be on (minimum requirement).
    // Wire this up once after the form is populated.
    const aiEnabledEl = document.getElementById("aiEnabled");
    const aiCallbackEl = document.getElementById("aiCallbackEnabled");
    if (aiEnabledEl && aiCallbackEl) {
      aiEnabledEl.addEventListener("change", function () {
        if (this.checked && !aiCallbackEl.checked) {
          aiCallbackEl.checked = true;
        }
      });
    }

    // Load SMS credits balance
    const { data: credits } = await sb
      .from("sms_credits")
      .select("balance, next_reset_at")
      .eq("company_id", currentCompanyId)
      .maybeSingle();
    const b = credits?.balance ?? 0;

    const balanceEl = document.getElementById("smsCreditsBalance");
    if (balanceEl) {
      balanceEl.textContent = `${b} credit${b !== 1 ? "s" : ""}`;
      balanceEl.style.color = b < 20 ? "#ef4444" : b < 50 ? "#f59e0b" : "var(--text)";
    }

    const resetLabel = document.getElementById("smsCreditsResetLabel");
    if (resetLabel && credits?.next_reset_at) {
      const resetDate = new Date(credits.next_reset_at);
      const formatted = resetDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      resetLabel.textContent = `Next 500 free credits: ${formatted}`;
    }

    _updateSmsCreditsUi(b);

    // Show success toast if returning from credits purchase
    if (new URLSearchParams(location.search).get("sms_credits_success")) {
      toast("SMS credits added to your account.");
      history.replaceState({}, "", location.pathname);
    }

  } catch (err) {
    console.error("Load AI settings error:", err);
    toast("Failed to load AI settings.", true);
  }
}

async function buySmsCredits(pack) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = "Redirecting…"; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-sms-credits-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}`, "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ pack }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "No checkout URL");
    window.location.href = data.url;
  } catch (err) {
    toast(err.message || "Failed to start checkout.", true);
    if (btn) { btn.disabled = false; btn.textContent = "Buy"; }
  }
}
window.buySmsCredits = buySmsCredits;

// Helper functions for form population
function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setCheckboxValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

async function handleAiSettingsSave(e) {
  e.preventDefault();
  
  const isActive = document.getElementById("aiEnabled")?.checked ?? true;
  // Callbacks are the minimum requirement when AI is active - force it on.
  const callbackEnabled = isActive
    ? true
    : (document.getElementById("aiCallbackEnabled")?.checked ?? false);

  // Build payload
  const payload = {
    company_id:             currentCompanyId,
    model:                  document.getElementById("aiModel")?.value || "gpt-4o",
    reply_delay_seconds:    Number(document.getElementById("aiReplyDelay")?.value) || 0,
    max_sms_words:          Number(document.getElementById("aiMaxWords")?.value) || 160,
    is_active:              isActive,
    auto_reply:             document.getElementById("aiAutoReply")?.checked ?? true,
    out_of_hours_only:      document.getElementById("aiOutOfHoursOnly")?.checked ?? false,
    callback_enabled:       callbackEnabled,
    onsite_enabled:         document.getElementById("aiOnsiteEnabled")?.checked ?? false,
    quote_drafting_enabled: document.getElementById("aiQuoteDraftingEnabled")?.checked ?? false,
    lead_scoring_enabled:   document.getElementById("aiLeadScoringEnabled")?.checked ?? true,
    auto_send_welcome:     document.getElementById("aiAutoSendWelcome")?.checked ?? false,
    
    // Call-back settings
    agent_name:             document.getElementById("aiAgentName")?.value || "Sales Team",
    callback_hours_start:   document.getElementById("aiCallbackStartTime")?.value || "09:00",
    callback_hours_end:     document.getElementById("aiCallbackEndTime")?.value || "17:00",
    special_offers:         document.getElementById("aiSpecialOffers")?.value || null,
    welcome_message:        document.getElementById("aiWelcomeMessage")?.value || "Hi {{first_name}}, thanks for reaching out!",
    
    // On-site settings
    service_locations:      document.getElementById("aiServiceLocations")?.value?.split("\n").filter(Boolean) || [],
    max_travel_distance:    Number(document.getElementById("aiMaxTravelDistance")?.value) || 50,
    max_travel_distance_unit: document.getElementById("aiMaxTravelUnit")?.value || "km",
    preparation_required:   document.getElementById("aiPreparationRequired")?.value || null,
    
    // Quote follow-up automation
    automate_quote_followup: document.getElementById("aiAutomateQuoteFollowup")?.checked ?? false,
    followup_message:       document.getElementById("aiFollowupMessage")?.value || "Hi {{first_name}}, just following up on your quote!",
    days_until_followup:    Number(document.getElementById("aiDaysUntilFollowup")?.value) || 3,
    
    // Quote pricing config
    quote_pricing_config:   collectPricingConfig(),
    system_prompt:          document.getElementById("aiSystemPrompt")?.value || null,
  };
  
  try {
    const { error } = await sb
      .from("sms_agent_config")
      .upsert(payload, { onConflict: "company_id" });
    
    if (error) { 
      toast(error.message, true); 
      return; 
    }
    
    toast("AI settings saved successfully.");
  } catch (err) {
    toast("Failed to save AI settings.", true);
    console.error("Save AI settings error:", err);
  }
}

// ─── Quote Pricing Item Management ────────────────────────────────────────────
function addPricingItemRow(item) {
  const container = document.getElementById("quotePricingItems");
  if (!container) return;
  const defaults = typeof item === "object" && item !== null && !(item instanceof Event)
    ? item
    : { description: "", type: "fixed", rate: "", unit: "" };

  const row = document.createElement("div");
  row.className = "pricing-item-row";
  row.style.cssText = "display:grid;grid-template-columns:1.5fr .8fr .6fr .8fr auto;gap:8px;align-items:center";
  row.innerHTML = `
    <input type="text" class="pi-desc" placeholder="e.g. Material Cost" value="${esc(defaults.description || "")}">
    <select class="pi-type">
      <option value="fixed"${defaults.type === "fixed" ? " selected" : ""}>Fixed</option>
      <option value="per_hour"${defaults.type === "per_hour" ? " selected" : ""}>Per Hour</option>
      <option value="per_m2"${defaults.type === "per_m2" ? " selected" : ""}>Per m²</option>
      <option value="per_kw"${defaults.type === "per_kw" ? " selected" : ""}>Per kW</option>
      <option value="per_unit"${defaults.type === "per_unit" ? " selected" : ""}>Per Unit</option>
    </select>
    <input type="number" class="pi-rate" min="0" step="0.01" placeholder="Rate" value="${defaults.rate ?? ""}">
    <input type="text" class="pi-unit" placeholder="e.g. per job" value="${esc(defaults.unit || "")}">
    <button type="button" class="iconbtn btn-danger" onclick="this.closest('.pricing-item-row').remove()" title="Remove item">
      <span class="icon" data-icon="trash"></span>
    </button>`;
  container.appendChild(row);
  renderIcons();
}

function collectPricingConfig() {
  const items = [];
  document.querySelectorAll(".pricing-item-row").forEach((row) => {
    const desc = row.querySelector(".pi-desc")?.value?.trim();
    const type = row.querySelector(".pi-type")?.value || "fixed";
    const rate = parseFloat(row.querySelector(".pi-rate")?.value) || 0;
    const unit = row.querySelector(".pi-unit")?.value?.trim() || "";
    if (desc) items.push({ description: desc, type, rate, unit });
  });
  return {
    items,
    formula: document.getElementById("quotePricingFormula")?.value?.trim() || "",
    tax_rate: parseFloat(document.getElementById("quoteTaxRate")?.value) || 0,
    tax_mode: document.getElementById("quoteTaxMode")?.value || "exclusive",
    currency: document.getElementById("quoteCurrency")?.value?.trim() || "AUD",
  };
}

function loadPricingConfigUI(config) {
  const container = document.getElementById("quotePricingItems");
  if (!container) return;
  container.innerHTML = "";
  const cfg = config || {};
  if (Array.isArray(cfg.items)) {
    cfg.items.forEach((item) => addPricingItemRow(item));
  }
  setInputValue("quotePricingFormula", cfg.formula);
  setInputValue("quoteTaxRate", cfg.tax_rate ?? 10);
  setInputValue("quoteTaxMode", cfg.tax_mode || "exclusive");
  setInputValue("quoteCurrency", cfg.currency || "AUD");
}

async function loadTwilioNumbers() {
  try {
    const { data } = await sb
      .from("twilio_numbers")
      .select("*")
      .eq("company_id", currentCompanyId)
      .order("created_at");
    
    const el = document.getElementById("twilioNumbersTable");
    if (!el) return;
    
    if (!data?.length) { 
      el.innerHTML = `<div class="notice">No numbers added yet.</div>`; 
      return; 
    }
    
    el.innerHTML = `<div class="table-lite">${data.map((n) => `
      <div class="row">
        <div><strong style="font-size:13px">${esc(n.phone_number)}</strong></div>
        <div><span class="muted">${esc(n.friendly_name || "-")}</span></div>
        <button class="iconbtn btn-danger" onclick="deleteTwilioNumber('${n.id}')" type="button">
          <span class="icon" data-icon="trash"></span>
        </button>
      </div>`).join("")}</div>`;
    renderIcons();
  } catch (err) {
    console.error("Load Twilio numbers error:", err);
  }
}

async function handleTwilioNumberSave(e) {
  e.preventDefault();
  try {
    const { error } = await sb.from("twilio_numbers").insert({
      company_id:    currentCompanyId,
      phone_number:  document.getElementById("twilioPhoneNumber")?.value,
      friendly_name: document.getElementById("twilioFriendlyName")?.value,
    });
    if (error) { toast(error.message, true); return; }
    toast("Number added.");
    document.getElementById("twilioNumberForm")?.reset();
    await loadTwilioNumbers();
    const { data: nums } = await sb.from("twilio_numbers").select("id").eq("company_id", currentCompanyId);
    const twilioCountValue = document.getElementById("twilioCountValue");
    if (twilioCountValue) twilioCountValue.textContent = nums?.length || 0;
  } catch (err) {
    toast("Failed to add number.", true);
  }
}

async function deleteTwilioNumber(id) {
  confirmAction("Remove this number? This cannot be undone.", async () => {
    try {
      await sb.from("twilio_numbers").delete().eq("id", id);
      loadTwilioNumbers();
    } catch (err) {
      toast("Failed to delete number.", true);
    }
  }, { okLabel: "Remove", title: "Are you sure?" });
}

async function loadWorkflowRuns() {
  try {
    const { data: runs } = await sb
      .from("ai_workflow_runs")
      .select("*")
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false })
      .limit(10);
    
    const el = document.getElementById("workflowRunSummary");
    if (!el) return;
    
    if (!runs?.length) {
      el.innerHTML = `<div class="notice">No workflow runs yet. Inbound SMS will trigger AI workflows.</div>`;
      return;
    }
    
    el.innerHTML = runs.map((run) => `
      <div class="run">
        <h3>${esc(run.workflow_type)} <span class="chip">${cap(run.status)}</span></h3>
        <p>Model: ${esc(run.model) || "-"} · Key Source: ${esc(run.key_source) || "-"}</p>
        <p style="margin-top:4px;"><span class="muted">${fmtDate(run.created_at)}</span></p>
        ${run.error_text ? `<p style="color:#c53535;margin-top:4px;">Error: ${esc(run.error_text)}</p>` : ''}
      </div>
    `).join("");
  } catch (err) {
    console.error("Load workflow runs error:", err);
  }
}

// ─── Team Members ─────────────────────────────────────────────────────────────
async function loadTeamMembers() {
  if (!currentCompanyId) return;

  try {
    const [{ data: profiles }, { data: invites }, { data: reps }] = await Promise.all([
      sb.from("profiles")
        .select("id, full_name, phone, role, is_active, created_at")
        .eq("company_id", currentCompanyId)
        .order("created_at"),
      sb.from("sales_rep_invites")
        .select("id, email, full_name, status, invited_at")
        .eq("company_id", currentCompanyId)
        .eq("status", "pending")
        .order("invited_at", { ascending: false }),
      sb.from("sales_reps")
        .select("*")
        .eq("company_id", currentCompanyId),
    ]);

    renderTeamMembersList(profiles || [], invites || [], reps || []);
  } catch (err) {
    toast("Failed to load team members.", true);
  }
}

function renderTeamMembersList(profiles, invites, reps) {
  const el = document.getElementById("teamMembersList");
  if (!el) return;

  const repMap = {};
  reps.forEach((r) => { repMap[r.user_id] = r; });

  const VIS_LABELS = { all: "All", assigned_only: "Assigned Only", none: "None" };

  const memberRows = profiles.map((p) => {
    const rep = repMap[p.id];
    const isOwnerAdmin = p.role === "owner" || p.role === "admin";
    const canManage = isAdmin() && !isOwnerAdmin && p.id !== currentUser?.id;

    let permsHtml = "";
    if (rep && !isOwnerAdmin) {
      permsHtml = `
        <div class="team-perms" data-rep-id="${rep.id}" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:none">
          <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Visibility</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-bottom:12px">
            ${["leads","quotes","appointments","sales","conversations"].map((s) => `
              <div style="display:flex;align-items:center;gap:6px;font-size:12px">
                <span style="min-width:90px;color:var(--muted)">${s.charAt(0).toUpperCase()+s.slice(1)}</span>
                <select data-vis="${s}" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2)" ${canManage ? "" : "disabled"}>
                  ${["all","assigned_only","none"].map((v) => `<option value="${v}" ${rep[s+"_visibility"]===v?"selected":""}>${VIS_LABELS[v]}</option>`).join("")}
                </select>
              </div>`).join("")}
          </div>
          <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Permissions</div>
          <div class="toggle-group" style="gap:8px">
            ${[
              ["can_edit_leads","Edit Leads"],
              ["can_edit_quotes","Edit Quotes"],
              ["can_edit_appointments","Edit Appointments"],
              ["can_manage_pipeline","Manage Pipeline"],
              ["can_send_sms","Send SMS"],
              ["can_initiate_calls","Initiate Calls"],
            ].map(([key, label]) => `
              <label class="toggle-item" style="padding:6px 10px;font-size:11px">
                <input type="checkbox" data-perm-key="${key}" ${rep[key]?"checked":""} ${canManage?"":"disabled"}>
                <span class="toggle-label">${label}</span>
              </label>`).join("")}
          </div>
          ${canManage ? `<div class="actions" style="margin-top:10px"><button class="btn" type="button" onclick="saveRepPerms('${rep.id}', this)" style="font-size:11px;padding:6px 14px">Save Permissions</button></div>` : ""}
        </div>`;
    } else if (isOwnerAdmin) {
      permsHtml = `<div class="team-perms" style="margin-top:4px;display:none"><span class="muted" style="font-size:11px">Owners and admins have full access to all sections.</span></div>`;
    }

    return `
    <div class="team-row" style="flex-wrap:wrap">
      <div style="flex:1;min-width:150px"><strong style="font-size:13px">${esc(p.full_name) || "-"}</strong>${p.phone ? `<span class="muted" style="display:block;margin-top:2px">${esc(p.phone)}</span>` : ""}</div>
      <div><span class="chip">${esc(p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : "Member")}</span></div>
      <div><span class="chip ${p.is_active ? "" : "chip-pending"}">${p.is_active ? "Active" : "Inactive"}</span></div>
      <div>
        ${(rep || isOwnerAdmin) ? `<button class="btn" type="button" onclick="toggleTeamPerms(this)" style="font-size:11px;padding:4px 10px"><span class="icon" data-icon="settings" style="width:12px;height:12px"></span> Permissions</button>` : ""}
      </div>
      ${permsHtml}
    </div>`;
  }).join("");

  const inviteRows = invites.map((inv) => `
    <div class="team-row">
      <div><strong style="font-size:13px">${esc(inv.full_name) || esc(inv.email)}</strong><span class="muted">${esc(inv.email)}</span></div>
      <div><span class="chip chip-pending">Pending</span></div>
      <div><span class="muted" style="font-size:11px">Invited ${fmtDate(inv.invited_at)}</span></div>
      <div>
        <button class="iconbtn btn-danger" onclick="revokeInvite('${inv.id}')" type="button" title="Revoke invite">
          <span class="icon" data-icon="trash"></span>
        </button>
      </div>
    </div>`).join("");

  const hasAny = profiles.length || invites.length;
  el.innerHTML = hasAny
    ? `<div class="team-list">${memberRows}${inviteRows}</div>`
    : `<div class="notice">No team members yet. Invite someone below.</div>`;

  renderIcons();
}

async function saveRepPerms(repId, btn) {
  const container = btn.closest('.team-perms');
  if (!container) return;

  const update = {};
  // Visibility selects
  container.querySelectorAll('[data-vis]').forEach((sel) => {
    update[sel.dataset.vis + '_visibility'] = sel.value;
  });
  // Permission toggles
  container.querySelectorAll('[data-perm-key]').forEach((cb) => {
    update[cb.dataset.permKey] = cb.checked;
  });

  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const { error } = await sb.from("sales_reps").update(update).eq("id", repId);
    if (error) { toast(error.message, true); return; }
    toast("Permissions saved.");
  } catch (err) {
    toast("Failed to save permissions.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Permissions";
  }
}
window.saveRepPerms = saveRepPerms;

function toggleTeamPerms(btn) {
  const perms = btn.closest('.team-row')?.querySelector('.team-perms');
  if (perms) perms.style.display = perms.style.display === 'none' ? 'block' : 'none';
}
window.toggleTeamPerms = toggleTeamPerms;

async function handleTeamInvite(e) {
  e.preventDefault();
  const email    = document.getElementById("inviteEmail")?.value?.trim();
  const fullName = document.getElementById("inviteFullName")?.value?.trim();
  const phone    = document.getElementById("invitePhone")?.value?.trim();
  if (!email) { toast("Email is required.", true); return; }

  const btn = e.target.querySelector("button[type=submit]");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const result = await edgeFn("invite-rep", { email, name: fullName, phone, visibility: {
      leads: "assigned_only", quotes: "assigned_only", appointments: "assigned_only",
      sales: "assigned_only", conversations: "assigned_only",
    }});

    if (result.email_sent) {
      toast(`Invite sent to ${email}. They'll receive an email to set up their account.`);
    } else {
      toast(`User added but the invitation email could not be sent${result.email_error ? ": " + result.email_error : ""}`, true);
    }
    document.getElementById("teamInviteForm")?.reset();
    loadTeamMembers();
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Send Invite"; }
  }
}

async function revokeInvite(inviteId) {
  confirmAction("Revoke this invite? The recipient will no longer be able to join.", async () => {
    try {
      const { error } = await sb
        .from("sales_rep_invites")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", inviteId);
      if (error) { toast(error.message, true); return; }
      toast("Invite revoked.");
      loadTeamMembers();
    } catch (err) {
      toast("Failed to revoke invite.", true);
    }
  }, { okLabel: "Revoke", title: "Revoke invite?" });
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function loadNotifications() {
  if (!currentCompanyId) return;
  try {
    const { data: notifications } = await sb
      .from("notifications")
      .select("*")
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false })
      .limit(50);

    const el = document.getElementById("notificationsPanel");
    if (!el) return;

    const unread = (notifications || []).filter((n) => !n.is_read).length;
    [document.getElementById("notifBadge"), document.getElementById("mobileNotifBadge")].forEach(b => {
      if (b) { b.textContent = unread; b.style.display = unread > 0 ? "inline-flex" : "none"; }
    });

    if (!notifications?.length) {
      el.innerHTML = `<div class="empty"><h3>No notifications yet</h3><p>When AI books appointments, triggers quotes, or completes goals, notifications will appear here.</p></div>`;
      return;
    }

    const typeIcons = {
      callback_booked: "",
      onsite_booked: "",
      quote_drafted: "",
      sale_completed: "",
    };

    el.innerHTML = `<div class="table-lite">${notifications.map((n) => `
      <div class="row${n.is_read ? "" : " unread"}" style="cursor:pointer;${n.is_read ? "" : "border-left:3px solid #8b5cf6;"}" onclick="markNotificationRead('${n.id}')">
        <div>
          <strong style="font-size:13px">${esc(n.title)}</strong>
          <span class="muted">${esc(n.message || "")}</span>
        </div>
        <div>
          <span class="chip">${cap(n.type?.replace(/_/g, " ") || "notification")}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="muted">${fmtDate(n.created_at)}</span>
          ${n.type === "quote_drafted" && n.metadata?.quote_id ? `<button class="btn2" style="padding:3px 8px;font-size:11px" onclick="event.stopPropagation();approveAndSendQuote('${n.metadata.quote_id}')">Approve &amp; Send</button>` : ""}
        </div>
      </div>`).join("")}</div>`;
  } catch (err) {
    console.error("Load notifications error:", err);
    const el = document.getElementById("notificationsPanel");
    if (el) el.innerHTML = `<div class="notice">Failed to load notifications.</div>`;
  }
}

async function markNotificationRead(notifId) {
  try {
    await sb.from("notifications").update({ is_read: true }).eq("id", notifId);
    loadNotifications();
  } catch (err) {
    console.error("Mark notification read error:", err);
  }
}

async function markAllNotificationsRead() {
  if (!currentCompanyId) return;
  try {
    await sb.from("notifications").update({ is_read: true }).eq("company_id", currentCompanyId).eq("is_read", false);
    toast("All notifications marked as read.");
    loadNotifications();
  } catch (err) {
    toast("Failed to mark notifications as read.", true);
  }
}

async function loadNotificationBadge() {
  if (!currentCompanyId) return;
  try {
    const { count } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", currentCompanyId)
      .eq("is_read", false);
    const badge = document.getElementById("notifBadge");
    if (badge) {
      badge.textContent = count || 0;
      badge.style.display = (count && count > 0) ? "inline-flex" : "none";
    }
  } catch (err) {
    console.error("Load notification badge error:", err);
  }
}

function _updateSmsCreditsUi(balance) {
  const colorClass = balance < 20 ? "#ef4444" : balance < 50 ? "#f59e0b" : null;
  ['convSmsCreditsCount', 'convSmsCreditsBadgeCount'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = balance;
    if (colorClass) el.style.color = colorClass;
  });
}

// ─── Conversations ────────────────────────────────────────────────────────────
async function loadConversations() {
  if (!currentCompanyId) return;
  initTimezoneSelect();
  // Refresh credit count whenever conversations page opens
  try {
    const { data: cr } = await sb.from("sms_credits").select("balance").eq("company_id", currentCompanyId).maybeSingle();
    if (cr != null) _updateSmsCreditsUi(cr.balance ?? 0);
  } catch (_) {}
  try {
    const from = conversationsPage * PER_PAGE;
    const to = from + PER_PAGE - 1;
    const { data: conversations, count } = await sb
      .from("conversations")
      .select("id, lead_id, last_message, last_message_at, leads(name, phone)", { count: "exact" })
      .eq("company_id", currentCompanyId)
      .order("last_message_at", { ascending: false })
      .range(from, to);

    const list  = document.getElementById("conversationList");
    const empty = document.getElementById("convEmptyState");
    if (!list) return;

    if (!conversations?.length) {
      list.innerHTML = "";
      empty?.classList.remove("hidden");
      renderPagination("convPagination", conversationsPage, 0, PER_PAGE, () => {});
      return;
    }
    empty?.classList.add("hidden");

    list.innerHTML = conversations.map((c) => {
      const name = esc(c.leads?.name || "Unknown");
      const phone = esc(c.leads?.phone || "");
      const time = c.last_message_at ? fmtDate(c.last_message_at) : "";
      const lastMsgTime = c.last_message_at ? new Date(c.last_message_at) : null;
      const minsAgo = lastMsgTime ? Math.floor((Date.now() - lastMsgTime) / 60000) : null;
      let urgencyBadge = '';
      if (minsAgo !== null && minsAgo < 60) {
        const color = minsAgo < 5 ? '#16a34a' : minsAgo < 15 ? '#d97706' : '#dc2626';
        urgencyBadge = `<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${color}22;color:${color};font-weight:600;margin-left:4px">${minsAgo}m ago</span>`;
      }
      return `<div class="conv-item" data-conv-id="${c.id}" data-lead-id="${c.lead_id}"
                   data-lead-name="${name}" data-lead-phone="${phone}">
        <h3>${name}${urgencyBadge}<span class="conv-time">${time}</span></h3>
        <p>${esc(c.last_message) || "No messages yet"}</p>
      </div>`;
    }).join("");

    list.querySelectorAll(".conv-item").forEach((item) =>
      item.addEventListener("click", () => openConversation(
        item.dataset.convId,
        item.dataset.leadId,
        item.dataset.leadName,
        item.dataset.leadPhone,
        item
      ))
    );

    renderPagination("convPagination", conversationsPage, count, PER_PAGE, (page) => {
      conversationsPage = page;
      loadConversations();
    });
  } catch (err) {
    toast("Failed to load conversations.", true);
  }
}

// ── New Conversation ──────────────────────────────────────────────────────────
async function openNewConvModal() {
  try {
    const { data: leads } = await sb
      .from("leads")
      .select("id, name, phone, email")
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false });

    const sel = document.getElementById("newConvLeadSelect");
    if (sel && leads) {
      sel.innerHTML = `<option value="">- Select a lead -</option>` +
        leads.map((l) => {
          const label = l.name || l.email || l.id;
          const sub   = l.phone ? ` · ${l.phone}` : "";
          return `<option value="${l.id}">${label}${sub}</option>`;
        }).join("");
    }
    openModal("newConvModal");
  } catch (err) {
    toast("Failed to load leads.", true);
  }
}

async function handleNewConversation(e) {
  e.preventDefault();
  const leadId   = document.getElementById("newConvLeadSelect")?.value;
  const firstMsg = document.getElementById("newConvFirstMessage")?.value?.trim();
  if (!leadId) { toast("Please select a lead.", true); return; }

  try {
    // Check for existing conversation
    const { data: existing } = await sb
      .from("conversations")
      .select("id, leads(name, phone)")
      .eq("company_id", currentCompanyId)
      .eq("lead_id", leadId)
      .maybeSingle();

    if (existing) {
      closeModal("newConvModal");
      document.getElementById("newConvForm")?.reset();
      await loadConversations();
      const item = document.querySelector(`.conv-item[data-conv-id="${existing.id}"]`);
      if (item) item.click();
      toast("Conversation already exists - opened.");
      return;
    }

    // Create new
    const now = new Date().toISOString();
    const { data: conv, error } = await sb
      .from("conversations")
      .insert({
        company_id:      currentCompanyId,
        lead_id:         leadId,
        channel:         "sms",
        is_open:         true,
        last_message:    firstMsg || null,
        last_message_at: firstMsg ? now : null,
      })
      .select("id, leads(name, phone)")
      .single();

    if (error) { toast(error.message, true); return; }

    let smsFailed = false;
    if (firstMsg) {
      try {
        await edgeFn("send-sms", {
          conversation_id: conv.id,
          body:            firstMsg,
        });
      } catch (smsErr) {
        smsFailed = true;
        toast("Conversation created but SMS failed: " + (smsErr.message || "Unknown error"), true);
      }
    }

    if (!smsFailed) toast("Conversation created.");
    closeModal("newConvModal");
    document.getElementById("newConvForm")?.reset();
    await loadConversations();

    const name  = conv.leads?.name  || "Lead";
    const phone = conv.leads?.phone || "";
    const item  = document.querySelector(`.conv-item[data-conv-id="${conv.id}"]`);
    openConversation(conv.id, leadId, name, phone, item);
  } catch (err) {
    console.error("handleNewConversation error:", err);
    toast(err.message || "Failed to create conversation.", true);
  }
}

async function openConversation(convId, leadId, name, phone, itemEl) {
  currentConvId = convId;
  currentLeadId = leadId;

  document.getElementById("convDetailEmpty")?.classList.add("hidden");
  document.getElementById("convDetail")?.classList.remove("hidden");
  document.querySelector(".conv-layout")?.classList.add("conv-open");
  
  const convLeadName = document.getElementById("convLeadName");
  const convLeadPhone = document.getElementById("convLeadPhone");
  if (convLeadName) convLeadName.textContent = name;
  if (convLeadPhone) convLeadPhone.textContent = phone;

  document.querySelectorAll(".conv-item").forEach((el) => el.classList.remove("active"));
  itemEl?.classList.add("active");

  await loadMessages(convId);

  if (leadId) {
    try {
      const { data: lead } = await sb.from("leads").select("ai_enabled, ai_score").eq("id", leadId).maybeSingle();
      const tog    = document.getElementById("convAiToggle");
      const status = document.getElementById("convAiStatus");
      const scoreEl = document.getElementById("convLeadScore");
      
      if (tog && lead) {
        const on = lead.ai_enabled !== false;
        tog.checked = on;
        if (status) { 
          status.textContent = on ? "ON" : "OFF"; 
          status.className = `ai-toggle-status ${on ? "on" : "off"}`; 
        }
      }
      
      if (scoreEl && lead?.ai_score) {
        scoreEl.textContent = `Score: ${lead.ai_score}`;
      }
    } catch (err) {
      console.error("Load lead AI settings error:", err);
    }
  }
}

function closeConversationDetail() {
  document.querySelector(".conv-layout")?.classList.remove("conv-open");
  currentConvId = null;
  currentLeadId = null;
  document.getElementById("convDetail")?.classList.add("hidden");
  document.getElementById("convDetailEmpty")?.classList.remove("hidden");
  document.querySelectorAll(".conv-item").forEach((el) => el.classList.remove("active"));
}

async function loadMessages(convId) {
  try {
    const { data: msgs } = await sb
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at");
    const el = document.getElementById("convMessages");
    if (!el) return;
    if (!msgs?.length) {
      el.innerHTML = `<div class="muted" style="text-align:center;padding:24px;font-size:12px">No messages yet</div>`;
      return;
    }
    el.innerHTML = msgs.map((m) => {
      const content = esc(m.body || m.content || "");
      // Determine badge: for outbound messages, show 'AI' or 'Human'
      // agent_type "sms" is a legacy value from before migration to "ai"
      let badge = "";
      if (m.direction === "outbound") {
        badge = m.is_ai_generated || m.agent_type === "ai" || m.agent_type === "sms" ? "ai" : "human";
      }
      const badgeLabel = badge === "ai" ? "AI" : badge === "human" ? "Human" : "";
      return `<div class="msg ${m.direction === "inbound" ? "inbound" : "outbound"}">
        ${content}
        <div class="msg-meta">
          ${badgeLabel ? `<span class="msg-badge ${badge}">${badgeLabel}</span>` : ""}
          <span>${fmtDateTime(m.created_at)}</span>
        </div>
      </div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  } catch (err) {
    toast("Failed to load messages.", true);
  }
}

// ── Realtime Subscription ─────────────────────────────────────────────────────
function setupRealtimeSubscription() {
  if (!currentCompanyId || !sb) return;

  // Clean up previous subscription
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = sb
    .channel("conversations-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversations" },
      (payload) => {
        const row = payload.new || payload.old;
        if (row?.company_id !== currentCompanyId) return;

        // Refresh conversation list
        loadConversations();

        // If viewing this conversation, refresh messages
        if (currentConvId && row?.id === currentConvId) {
          loadMessages(currentConvId);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload.new;
        if (!msg || !currentConvId) return;

        // If the new message belongs to the open conversation, refresh it
        if (msg.conversation_id === currentConvId) {
          loadMessages(currentConvId);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const notif = payload.new;
        if (notif?.company_id !== currentCompanyId) return;
        loadNotificationBadge();
      }
    )
    .subscribe();
}

let _convSending = false;
async function handleSendMessage(e) {
  e.preventDefault();
  if (_convSending) return; // guard: block double-send while a send is in flight
  const input   = document.getElementById("convMessageInput");
  const btn     = document.querySelector('#convSendForm button[type="submit"]');
  const content = input?.value?.trim();
  if (!content || !currentConvId) return;

  // Immediately lock the UI so a slow send can't be double-submitted.
  _convSending = true;
  const btnHtml = btn ? btn.innerHTML : null;
  if (btn)   { btn.disabled = true; btn.innerHTML = '<span class="send-dots"><i></i><i></i><i></i></span>'; }
  if (input) { input.disabled = true; }

  try {
    await edgeFn("send-sms", {
      conversation_id: currentConvId,
      body:            content,
    });

    if (input) input.value = "";
    await loadMessages(currentConvId);
    toast("SMS sent.");
  } catch (err) {
    console.error("handleSendMessage error:", err);
    toast(err.message, true);
  } finally {
    _convSending = false;
    if (btn)   { btn.disabled = false; btn.innerHTML = btnHtml; }
    if (input) { input.disabled = false; input.focus(); }
  }
}

async function handleAiToggle() {
  if (!currentLeadId) return;
  const on     = document.getElementById("convAiToggle")?.checked;
  const status = document.getElementById("convAiStatus");
  if (status) { 
    status.textContent = on ? "ON" : "OFF"; 
    status.className = `ai-toggle-status ${on ? "on" : "off"}`; 
  }
  try {
    await sb.from("leads").update({ ai_enabled: on }).eq("id", currentLeadId);
  } catch (err) {
    toast("Failed to update AI setting.", true);
  }
}

// ─── Bulk SMS ─────────────────────────────────────────────────────────────────
let bulkSmsLeads = [];

async function loadBulkSms() {
  if (!currentCompanyId) return;
  await updateBulkSmsLeadCount();
  updateBulkSmsPreview();
}

async function updateBulkSmsLeadCount() {
  if (!currentCompanyId) return;
  const stage = document.getElementById("bulkSmsStageFilter")?.value || "all";
  try {
    let query = sb
      .from("leads")
      .select("id, name, first_name, last_name, phone, pipeline_stage, sms_opted_out")
      .eq("company_id", currentCompanyId);

    if (stage !== "all") {
      query = query.eq("pipeline_stage", stage);
    }

    const { data } = await query.order("created_at", { ascending: false });
    const all = data || [];
    const withPhone = all.filter((l) => l.phone?.trim());
    // Never bulk-message a lead who has opted out (replied STOP).
    bulkSmsLeads = withPhone.filter((l) => !l.sms_opted_out);
    const noPhone = all.length - withPhone.length;
    const optedOut = withPhone.length - bulkSmsLeads.length;

    const countEl = document.getElementById("bulkSmsLeadCount");
    const noPhoneEl = document.getElementById("bulkSmsNoPhone");
    const sendBtn = document.getElementById("bulkSmsSendBtn");
    if (countEl) countEl.textContent = bulkSmsLeads.length;
    if (noPhoneEl) {
      const skips = [];
      if (noPhone > 0) skips.push(`${noPhone} no phone number`);
      if (optedOut > 0) skips.push(`${optedOut} opted out`);
      noPhoneEl.textContent = skips.length ? `(${skips.join(", ")} skipped)` : "";
    }
    if (sendBtn) sendBtn.disabled = bulkSmsLeads.length === 0 || !document.getElementById("bulkSmsMessage")?.value?.trim();

    // Populate preview lead selector
    const previewSelect = document.getElementById("bulkSmsPreviewLead");
    if (previewSelect) {
      const prevVal = previewSelect.value;
      previewSelect.innerHTML = '<option value="">Sample Lead (John Smith)</option>';
      bulkSmsLeads.forEach((l) => {
        const displayName = l.name?.trim() || [l.first_name, l.last_name].filter(Boolean).join(" ") || l.phone;
        const opt = document.createElement("option");
        opt.value = l.id;
        opt.textContent = displayName;
        previewSelect.appendChild(opt);
      });
      // Restore previous selection if still in list
      if (prevVal && bulkSmsLeads.some((l) => l.id === prevVal)) {
        previewSelect.value = prevVal;
      }
    }
    updateBulkSmsPreview();
  } catch (err) {
    toast("Failed to load leads for bulk SMS.", true);
  }
}

function updateBulkSmsPreview() {
  const msgEl = document.getElementById("bulkSmsMessage");
  const previewEl = document.getElementById("bulkSmsPreview");
  const sendBtn = document.getElementById("bulkSmsSendBtn");
  const raw = msgEl?.value || "";
  if (!raw.trim()) {
    if (previewEl) previewEl.textContent = "Type a message above to see a preview…";
    if (sendBtn) sendBtn.disabled = true;
    return;
  }
  // Show preview using selected lead, or fall back to first lead / sample name
  const selectedId = document.getElementById("bulkSmsPreviewLead")?.value;
  const sampleLead = selectedId
    ? bulkSmsLeads.find((l) => l.id === selectedId) || null
    : bulkSmsLeads.length > 0 ? bulkSmsLeads[0] : null;
  const sampleName = sampleLead ? getFirstName(sampleLead) : "John";
  const sampleLastName = sampleLead ? getLastName(sampleLead) : "Smith";
  const preview = replaceMergeTags(raw, sampleName, sampleLastName);
  if (previewEl) previewEl.textContent = preview;
  if (sendBtn) sendBtn.disabled = bulkSmsLeads.length === 0;
}

function getFirstName(lead) {
  if (lead.name?.trim()) return lead.name.trim().split(/\s+/)[0];
  if (lead.first_name?.trim()) return lead.first_name.trim();
  return "there";
}

function getLastName(lead) {
  if (lead.name?.trim()) {
    const parts = lead.name.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  if (lead.last_name?.trim()) return lead.last_name.trim();
  return "";
}

// Matches {{first_name}}, {{first.name}}, {{firstName}}, {{first name}} (case-insensitive)
const FIRST_NAME_RE = /\{\{\s*first[_. ]?name\s*\}\}/gi;
const LAST_NAME_RE  = /\{\{\s*last[_. ]?name\s*\}\}/gi;

function replaceMergeTags(text, firstName, lastName) {
  return text
    .replace(FIRST_NAME_RE, firstName)
    .replace(LAST_NAME_RE, lastName);
}

async function handleBulkSmsSend() {
  const msgTemplate = document.getElementById("bulkSmsMessage")?.value?.trim();
  if (!msgTemplate) { toast("Please enter a message.", true); return; }
  if (!bulkSmsLeads.length) { toast("No leads to send to.", true); return; }

  const count = bulkSmsLeads.length;
  if (!confirm(`You are about to send ${count} SMS message${count > 1 ? "s" : ""}. This will use ${count} SMS credit${count > 1 ? "s" : ""}. Continue?`)) return;

  const sendBtn = document.getElementById("bulkSmsSendBtn");
  const progressWrap = document.getElementById("bulkSmsProgress");
  const progressBar = document.getElementById("bulkSmsProgressBar");
  const progressText = document.getElementById("bulkSmsProgressText");
  const resultSummary = document.getElementById("bulkSmsResultSummary");

  if (sendBtn) sendBtn.disabled = true;
  if (progressWrap) progressWrap.classList.remove("hidden");
  if (progressBar) progressBar.style.width = "0%";
  if (progressText) progressText.textContent = `0 / ${count}`;
  if (resultSummary) resultSummary.textContent = "";

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const lead of bulkSmsLeads) {
    const firstName = getFirstName(lead);
    const lastName = getLastName(lead);
    const body = replaceMergeTags(msgTemplate, firstName, lastName);

    try {
      await edgeFn("send-sms", { lead_id: lead.id, body });
      sent++;
    } catch (err) {
      failed++;
      errors.push(`${lead.name || lead.id}: ${err.message}`);
    }

    const done = sent + failed;
    const pct = Math.round((done / count) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${done} / ${count}`;
  }

  let summary = `${sent} sent`;
  if (failed) summary += ` · ${failed} failed`;
  if (resultSummary) resultSummary.textContent = summary;
  if (sendBtn) sendBtn.disabled = false;

  if (failed && errors.length) {
    console.error("Bulk SMS errors:", errors);
    toast(`Bulk SMS complete: ${sent} sent, ${failed} failed. Check console for details.`, true);
  } else {
    toast(`Bulk SMS complete! ${sent} message${sent > 1 ? "s" : ""} sent.`);
  }
}

function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ─── Opportunity Detail Modal ─────────────────────────────────────────────────
async function openOpportunityModal(leadId) {
  if (!leadId) return;

  const lead = allLeads.find((l) => l.id === leadId);
  if (!lead) {
    toast("Lead not found.", true);
    return;
  }

  // Store lead ID
  document.getElementById("oppModalLeadId").value = leadId;

  // Set title
  const oppModalTitle = document.getElementById("oppModalTitle");
  const oppModalSubtitle = document.getElementById("oppModalSubtitle");
  if (oppModalTitle) oppModalTitle.textContent = lead.name || "Lead Details";
  if (oppModalSubtitle) oppModalSubtitle.textContent = `Status: ${stageLabel(lead.pipeline_stage)} · Created: ${fmtDate(lead.created_at)}`;

  // Populate overview fields (editable, Change 6)
  const setOppField = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ""; };
  setOppField("oppOverviewName", lead.name || "");
  setOppField("oppOverviewEmail", lead.email || "");
  setOppField("oppOverviewPhone", lead.phone || "");
  // Status is now a select - set its value
  const statusSel = document.getElementById("oppOverviewStatus");
  if (statusSel) statusSel.value = stageLabel(lead.pipeline_stage) || "New Lead";
  setOppField("oppOverviewSource", lead.source || "");
  setOppField("oppOverviewValue", lead.value || "");
  setOppField("oppOverviewAiScore", aiScoreDisplay(lead));
  setOppField("oppOverviewAiStatus", aiStatusLabel(lead));
  setOppField("oppOverviewAddress", lead.address ? `${lead.address}${lead.postcode ? `, ${lead.postcode}` : ""}` : "");
  setOppField("oppOverviewAiSummary", lead.ai_summary || "No AI summary yet.");
  setOppField("oppOverviewNotes", lead.notes || "");

  // Lead Gen Rentals PPL: only status, value, address & notes are editable here.
  const oppLocked = isPplLocked(lead);
  setFieldsLocked(PPL_LOCKED_OPP_FIELDS, oppLocked);
  if (oppModalSubtitle && oppLocked) oppModalSubtitle.textContent += " · 🔒 Lead Gen Rentals PPL (limited editing)";

  // Wire inline save button (Change 6)
  const saveBtn = document.getElementById('oppSaveInlineBtn');
  if (saveBtn) {
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    newSave.addEventListener('click', async () => {
      newSave.disabled = true;
      newSave.textContent = 'Saving…';
      const payload = {
        name:           document.getElementById('oppOverviewName')?.value || null,
        email:          document.getElementById('oppOverviewEmail')?.value || null,
        phone:          document.getElementById('oppOverviewPhone')?.value || null,
        pipeline_stage: stageKey(document.getElementById('oppOverviewStatus')?.value || 'New Lead'),
        source:         document.getElementById('oppOverviewSource')?.value || null,
        value:          Number(document.getElementById('oppOverviewValue')?.value) || null,
        address:        document.getElementById('oppOverviewAddress')?.value || null,
        notes:          document.getElementById('oppOverviewNotes')?.value || null,
      };
      // Lead Gen Rentals PPL: never persist identifying-field or source changes.
      if (isPplLocked(lead)) {
        delete payload.name;
        delete payload.email;
        delete payload.phone;
        delete payload.source;
      }
      try {
        const { error } = await sb.from('leads').update(payload).eq('id', leadId);
        if (error) { toast(error.message, true); return; }
        toast('Lead updated.');
        const idx = allLeads.findIndex(l => l.id === leadId);
        if (idx > -1) allLeads[idx] = { ...allLeads[idx], ...payload };
        if (payload.pipeline_stage === 'closed_won') scheduleReviewRequest(leadId);
      } catch (err) { toast('Failed to save.', true); }
      finally { newSave.disabled = false; newSave.textContent = 'Save changes'; }
    });
  }

  // Wire create-quote button for this lead (Change 5)
  const qBtn = document.getElementById('oppCreateQuoteBtn');
  if (qBtn) {
    const newBtn = qBtn.cloneNode(true);
    qBtn.parentNode.replaceChild(newBtn, qBtn);
    newBtn.addEventListener('click', async () => {
      closeModal('opportunityModal');
      await quickSendQuote(leadId);
    });
  }

  // Reset tabs to overview
  document.querySelectorAll(".opp-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector('.opp-tab[data-tab="overview"]')?.classList.add("active");
  document.querySelectorAll(".opp-tab-content").forEach((c) => c.classList.add("hidden"));
  document.getElementById("oppTabOverview")?.classList.remove("hidden");

  openModal("opportunityModal");
}

async function loadOppConversations(leadId) {
  const el = document.getElementById("oppConversationsList");
  if (!el) return;

  try {
    const { data: conversations } = await sb
      .from("conversations")
      .select("id, last_message, last_message_at, is_open, channel")
      .eq("company_id", currentCompanyId)
      .eq("lead_id", leadId)
      .order("last_message_at", { ascending: false });

    if (!conversations?.length) {
      el.innerHTML = `<div class="notice">No conversations found for this lead.</div>`;
      return;
    }

    el.innerHTML = conversations.map((c) => `
      <div class="run" style="cursor:pointer" onclick="openConversationFromOpp('${c.id}', '${leadId}')">
        <h3>${c.channel?.toUpperCase() || "SMS"} Conversation <span class="chip">${c.is_open ? "Open" : "Closed"}</span></h3>
        <p>${esc(c.last_message) || "No messages"}</p>
        <p style="margin-top:4px;"><span class="muted">Last activity: ${fmtDate(c.last_message_at)}</span></p>
      </div>
    `).join("");
  } catch (err) {
    el.innerHTML = `<div class="notice">Failed to load conversations.</div>`;
  }
}

async function loadOppQuotes(leadId) {
  const el = document.getElementById("oppQuotesList");
  if (!el) return;

  try {
    const { data: quotes } = await sb
      .from("quotes")
      .select("id, quote_number, status, total, created_at, sent_at, accepted_at, quote_token, line_items, valid_until")
      .eq("company_id", currentCompanyId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (!quotes?.length) {
      el.innerHTML = `<div class="notice">No quotes found for this lead.</div>`;
      return;
    }

    el.innerHTML = quotes.map((q) => {
      const quoteLink = buildQuoteLink(q.quote_token);
      const isDraft = q.status === "draft";
      const itemCount = Array.isArray(q.line_items) ? q.line_items.length : 0;
      return `
      <div class="run">
        <h3>Quote #${q.quote_number || q.id.slice(0, 8)} <span class="chip">${cap(q.status || "draft")}</span></h3>
        <p><strong>Total:</strong> ${q.total ? fmt(q.total) : "-"}${itemCount ? ` · ${itemCount} line item${itemCount > 1 ? "s" : ""}` : ""}</p>
        <p style="margin-top:4px;"><span class="muted">Created: ${fmtDate(q.created_at)}${q.sent_at ? ` · Sent: ${fmtDate(q.sent_at)}` : ""}${q.accepted_at ? ` · Accepted: ${fmtDate(q.accepted_at)}` : ""}${q.valid_until ? ` · Valid until: ${fmtDate(q.valid_until)}` : ""}</span></p>
        <div style="margin-top:8px;display:flex;gap:8px">
          ${isDraft ? `<button class="btn2" style="padding:4px 10px;font-size:11px" onclick="approveAndSendQuote('${q.id}')">Approve & Send</button>` : ""}
          <button class="btn" style="padding:4px 10px;font-size:11px" onclick="downloadQuotePDF('${q.id}')">PDF</button>
          ${quoteLink ? `<button class="btn" style="padding:4px 10px;font-size:11px" onclick="copyQuoteLink('${quoteLink}')">Copy Link</button>` : ""}
        </div>
      </div>`;
    }).join("");
  } catch (err) {
    el.innerHTML = `<div class="notice">Failed to load quotes.</div>`;
  }
}

async function loadOppAppointments(leadId) {
  const el = document.getElementById("oppAppointmentsList");
  if (!el) return;

  try {
    const { data: appointments } = await sb
      .from("appointments")
      .select("id, title, status, start_time, end_time, location, notes, appointment_type, booked_by")
      .eq("company_id", currentCompanyId)
      .eq("lead_id", leadId)
      .order("start_time", { ascending: false });

    if (!appointments?.length) {
      el.innerHTML = `<div class="notice">No appointments found for this lead.</div>`;
      return;
    }

    el.innerHTML = appointments.map((a) => `
      <div class="run">
        <h3>${esc(a.title) || "Appointment"} <span class="chip">${cap(a.status || "scheduled")}</span>${a.appointment_type ? ` <span class="chip">${esc(cap(a.appointment_type))}</span>` : ''}${a.booked_by === "ai" ? ` <span class="chip" style="background:#8b5cf6;color:#fff">Booked by AI</span>` : ''}</h3>
        <p><strong>When:</strong> ${fmtDate(a.start_time)}${a.end_time ? ` - ${fmtTime(a.end_time)}` : ""}</p>
        ${a.location ? `<p><strong>Where:</strong> ${esc(a.location)}</p>` : ""}
        ${a.notes ? `<p style="margin-top:4px;font-style:italic;">${esc(a.notes)}</p>` : ""}
      </div>
    `).join("");
  } catch (err) {
    el.innerHTML = `<div class="notice">Failed to load appointments.</div>`;
  }
}

function openConversationFromOpp(convId, leadId) {
  closeModal("opportunityModal");
  navigateTo("conversations");
  // Find and click the conversation item
  setTimeout(() => {
    const item = document.querySelector(`.conv-item[data-conv-id="${convId}"]`);
    if (item) item.click();
  }, 300);
}

// ─── Approve & Send Quote ─────────────────────────────────────────────────────
// Updates quote status to "sent", sends the public link via SMS to the lead,
// and creates a message in the conversation thread.
async function approveAndSendQuote(quoteId) {
  if (!currentCompanyId) return;
  if (!confirm("Approve this quote and send it to the lead via SMS?")) return;

  try {
    // 1. Load quote with lead info
    const { data: quote, error: qErr } = await sb
      .from("quotes")
      .select("id, quote_number, quote_token, status, lead_id, total, leads(name, phone)")
      .eq("id", quoteId)
      .single();

    if (qErr || !quote) { toast("Quote not found.", true); return; }
    if (quote.status !== "draft") { toast("Only draft quotes can be approved.", true); return; }

    const lead = quote.leads || {};
    if (!lead.phone) { toast("Lead has no phone number - cannot send SMS.", true); return; }

    // 2. Update quote status to "sent"
    const { error: updateErr } = await sb
      .from("quotes")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", quoteId);

    if (updateErr) { toast("Failed to update quote status.", true); return; }

    // 3. Build quote link and SMS body
    const quoteLink = buildQuoteLink(quote.quote_token);
    const leadName = lead.name ? lead.name.split(" ")[0] : "there";
    const smsBody = `Hi ${leadName}, here's your quote #${quote.quote_number || quoteId.slice(0, 8)}${quote.total ? " for " + fmt(quote.total) : ""}. You can view, accept, or decline it here: ${quoteLink}`;

    // 4. Send SMS via edge function
    const result = await edgeFn("send-sms", {
      lead_id: quote.lead_id,
      body: smsBody,
    });

    // 5. Log activity
    await sb.from("activity_log").insert({
      company_id: currentCompanyId,
      action: "quote.approved_and_sent",
      entity_type: "quote",
      entity_id: quoteId,
      details: {
        quote_number: quote.quote_number,
        lead_id: quote.lead_id,
        conversation_id: result.conversation_id || null,
        sent_via: "sms",
      },
    });

    toast("Quote approved and sent to " + (lead.name || lead.phone) + "!");

    // 6. Refresh relevant UI
    loadQuotes();
    loadNotifications();
    loadNotificationBadge();

    // Refresh opportunity quotes if modal is open
    const currentLeadId = document.getElementById("oppModalLeadId")?.value;
    if (currentLeadId === quote.lead_id) loadOppQuotes(quote.lead_id);

  } catch (err) {
    toast(err.message || "Failed to approve and send quote.", true);
    console.error("approveAndSendQuote error:", err);
  }
}


// =============================================================================
// ── AI Insights ───────────────────────────────────────────────────────────────
// =============================================================================

async function loadAiInsights() {
  if (!currentCompanyId) return;

  const statsEl = document.getElementById("aiInsightsStats");
  const convEl = document.getElementById("aiConversionBars");
  const knowledgeEl = document.getElementById("aiKnowledgeList");

  // ── Fetch performance stats ─────────────────────────────────────────────
  const { data: stats } = await sb
    .from("ai_performance_stats")
    .select("*")
    .eq("company_id", currentCompanyId)
    .eq("period", "all_time")
    .maybeSingle();

  if (statsEl) {
    if (!stats) {
      statsEl.innerHTML = `<div class="notice">No data yet. AI insights will appear as your AI agents handle more conversations.</div>`;
    } else {
      const statCards = [
        { label: "Total Leads", value: stats.total_leads, icon: "users" },
        { label: "AI-Handled", value: stats.ai_handled_leads, icon: "spark" },
        { label: "AI Conversions", value: stats.ai_conversions, icon: "chart" },
        { label: "Avg AI Score", value: Math.round(stats.avg_ai_score || 0), icon: "spark" },
        { label: "Callbacks Booked", value: stats.callbacks_booked, icon: "phone" },
        { label: "On-sites Booked", value: stats.onsites_booked, icon: "calendar" },
        { label: "Quotes Generated", value: stats.quotes_generated, icon: "file" },
        { label: "Knowledge Items", value: stats.knowledge_items_count, icon: "spark" },
      ];

      statsEl.innerHTML = statCards.map((s) => `
        <div style="background:var(--surface-2);border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:var(--text)">${s.value}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${esc(s.label)}</div>
        </div>
      `).join("");
    }
  }

  // ── Conversion comparison ───────────────────────────────────────────────
  if (convEl) {
    if (!stats || stats.total_leads === 0) {
      convEl.innerHTML = `<div class="notice">Not enough data to compare conversion rates yet.</div>`;
    } else {
      const aiRate = stats.ai_conversion_rate || 0;
      const humanRate = stats.human_conversion_rate || 0;
      const maxRate = Math.max(aiRate, humanRate, 1);

      convEl.innerHTML = `
        <div style="flex:1;text-align:center">
          <div style="background:var(--accent,#1f6fff);border-radius:6px 6px 0 0;height:${Math.max(8, (aiRate / maxRate) * 120)}px;margin:0 auto;width:60px"></div>
          <div style="margin-top:8px;font-weight:600;font-size:20px">${aiRate.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">AI Conversion</div>
          <div style="font-size:11px;color:var(--muted)">${stats.ai_conversions} / ${stats.ai_handled_leads} leads</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="background:var(--muted);border-radius:6px 6px 0 0;height:${Math.max(8, (humanRate / maxRate) * 120)}px;margin:0 auto;width:60px"></div>
          <div style="margin-top:8px;font-weight:600;font-size:20px">${humanRate.toFixed(1)}%</div>
          <div style="font-size:12px;color:var(--muted)">Human Conversion</div>
          <div style="font-size:11px;color:var(--muted)">${stats.human_conversions} / ${stats.human_handled_leads} leads</div>
        </div>
      `;
    }
  }

  // ── Knowledge base ──────────────────────────────────────────────────────
  if (knowledgeEl) {
    const { data: knowledge } = await sb
      .from("company_knowledge")
      .select("id, category, insight, tags, source_type, times_used, created_at")
      .eq("company_id", currentCompanyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!knowledge || knowledge.length === 0) {
      knowledgeEl.innerHTML = `<div class="notice">No AI learnings yet. As leads progress through your pipeline, the AI will extract insights automatically.</div>`;
    } else {
      const categoryLabels = {
        winning_pattern: "Winning Pattern",
        failed_pattern: "Failed Pattern",
        objection_response: "Objection Response",
        scheduling_approach: "Scheduling",
        quote_approach: "Quote Approach",
        service_insight: "Service Insight",
        style_preference: "Style Preference",
      };

      knowledgeEl.innerHTML = knowledge.map((k) => {
        const catLabel = categoryLabels[k.category] || k.category;
        const tags = (k.tags || []).map((t) => `<span style="background:var(--surface-2);padding:2px 6px;border-radius:4px;font-size:10px">${esc(t)}</span>`).join(" ");
        const ts = new Date(k.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
        return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px">${catLabel} <span style="font-weight:400;margin-left:4px">${esc(k.source_type)}</span></div>
            <div style="font-size:13px;color:var(--text)">${esc(k.insight)}</div>
            <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${tags}</div>
          </div>
          <div style="font-size:11px;color:var(--muted);white-space:nowrap">${ts}</div>
        </div>`;
      }).join("");
    }
  }

  // ── Performance insights ────────────────────────────────────────────────
  const industryEl = document.getElementById("aiIndustryInsights");
  if (industryEl) {
    const [{ data: leads }, { data: orderNiches }] = await Promise.all([
      sb.from("leads").select("id, pipeline_stage, ai_enabled, created_at, value").eq("company_id", currentCompanyId),
      sb.from("ppl_lead_orders").select("niche").eq("company_id", currentCompanyId).in("status", ["paid","active","fulfilled"]),
    ]);

    // Determine company's primary niche (most ordered)
    let companyNiche = null;
    if (orderNiches?.length) {
      const counts = {};
      orderNiches.forEach(o => counts[o.niche] = (counts[o.niche] || 0) + 1);
      companyNiche = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    // Trigger benchmark refresh (throttled server-side to every 6 hours)
    sb.rpc("refresh_niche_benchmarks").catch(() => {});

    // Read benchmark for company's niche (only set if 10+ contributors)
    let benchmark = null;
    if (companyNiche) {
      const { data: bm } = await sb.from("niche_benchmarks").select("*").eq("niche", companyNiche).maybeSingle();
      if (bm?.company_count >= 10) benchmark = bm;
    }

    const cards = generatePerformanceInsights(stats, leads || [], benchmark, companyNiche);

    if (!cards.length) {
      industryEl.innerHTML = `<div class="notice">Add more leads to your pipeline to unlock performance insights.</div>`;
    } else {
      const colorMap = {
        good:  { bg: "#f0fdf4", border: "#86efac44", label: "#166534" },
        warn:  { bg: "#fffbeb", border: "#fcd34d44", label: "#92400e" },
        alert: { bg: "#fef2f2", border: "#fca5a544", label: "#991b1b" },
        info:  { bg: "var(--surface-2)", border: "var(--border)", label: "var(--muted)" },
      };
      industryEl.innerHTML = cards.map(c => {
        const col = colorMap[c.type] || colorMap.info;
        return `<div style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border);background:${col.bg}">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">${esc(c.title)}</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.65">${esc(c.body)}</div>
            ${c.action ? `<div style="margin-top:6px;font-size:12px;color:#4797FF;font-weight:500">→ ${esc(c.action)}</div>` : ""}
          </div>
          ${c.metric ? `<div style="text-align:right;flex-shrink:0;padding-left:8px"><div style="font-size:22px;font-weight:700;color:var(--text)">${esc(c.metric)}</div><div style="font-size:10px;color:var(--muted);white-space:nowrap">${esc(c.metricLabel || "")}</div></div>` : ""}
        </div>`;
      }).join("");
    }
  }

  renderIcons();
}

function generatePerformanceInsights(stats, leads, benchmark = null, niche = null) {
  const cards = [];
  const fmt = v => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(v);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);
  const nicheLabel = niche ? niche.charAt(0).toUpperCase() + niche.slice(1) : "AU trade";
  const bm = benchmark; // shorthand

  // 1. AI Coverage
  if (stats && stats.total_leads >= 5) {
    const pct = Math.round((stats.ai_handled_leads / stats.total_leads) * 100);
    const avgCov = bm?.avg_ai_coverage ?? 65;
    const isAbove = pct >= avgCov;
    const benchText = bm
      ? `The ${nicheLabel} niche average across ${bm.company_count} businesses on the platform is ${avgCov}%.`
      : "Top AU trade businesses target 65%+ coverage.";
    cards.push({
      title: "AI Coverage",
      body: isAbove
        ? `Your AI is handling ${pct}% of leads - above the benchmark. ${benchText} High coverage keeps response times fast and booking rates consistent.`
        : pct >= 40
        ? `Your AI is handling ${pct}% of leads. ${benchText} Increasing coverage reduces response time - a key driver of conversion.`
        : `Your AI is handling only ${pct}% of leads. ${benchText} Enabling AI on more leads is one of the fastest wins available.`,
      action: pct < 40 ? "Enable AI on more leads via individual lead settings or your default AI toggle." : null,
      type: isAbove ? "good" : pct >= 40 ? "warn" : "alert",
      metric: `${pct}%`,
      metricLabel: "AI handled",
    });
  }

  // 2. Callback booking rate
  if (stats && stats.ai_handled_leads >= 5) {
    const rate = parseFloat(((stats.callbacks_booked / stats.ai_handled_leads) * 100).toFixed(1));
    const avgRate = bm?.avg_callback_rate ?? 28;
    const p25 = bm?.p25_callback_rate, p75 = bm?.p75_callback_rate;
    const isAbove = rate >= avgRate;
    const benchText = bm
      ? `The ${nicheLabel} niche average is ${avgRate}%${p25 && p75 ? ` (top quartile: ${p75}%+, bottom quartile: ${p25}%-)` : ""} across ${bm.company_count} businesses.`
      : "The AU trade average is 25–35%.";
    cards.push({
      title: "AI Callback Rate",
      body: isAbove
        ? `${rate}% of AI-handled leads book a callback. ${benchText} Your AI script and qualification flow are working well.`
        : rate >= 15
        ? `${rate}% callback rate from AI-handled leads. ${benchText} Small tweaks to your AI prompt or follow-up timing can lift this.`
        : `${rate}% callback rate. ${benchText} Review your AI knowledge base and test different opening messages.`,
      action: rate < 15 ? "Go to AI Settings → System Prompt and review how your agent opens conversations." : null,
      type: isAbove ? "good" : rate >= 15 ? "warn" : "alert",
      metric: `${rate}%`,
      metricLabel: "callback rate",
    });
  }

  // 3. Win rate
  const won  = leads.filter(l => l.pipeline_stage === "closed_won").length;
  const lost = leads.filter(l => l.pipeline_stage === "closed_lost").length;
  if (won + lost >= 5) {
    const winRate = Math.round((won / (won + lost)) * 100);
    const avgWin = bm?.avg_win_rate ?? 38;
    const p75Win = bm?.p75_win_rate;
    const isAbove = winRate >= avgWin;
    const benchText = bm
      ? `${nicheLabel} niche average is ${avgWin}%${p75Win ? ` (top quartile: ${p75Win}%+)` : ""} across ${bm.company_count} businesses.`
      : "AU trade average is 35–45%.";
    cards.push({
      title: "Win Rate",
      body: isAbove
        ? `You're closing ${winRate}% of qualified leads - above the benchmark. ${benchText} Strong quote follow-up or competitive pricing is driving this.`
        : winRate >= 25
        ? `You're closing ${winRate}% of qualified leads. ${benchText} Consistent follow-up after quoting is the #1 lever for improvement.`
        : `A ${winRate}% win rate is below the benchmark. ${benchText} Review quote presentation, pricing, and follow-up speed.`,
      action: winRate < 25 ? "Check how many sent quotes have no follow-up SMS - use Quotes to trigger automated follow-ups." : null,
      type: isAbove ? "good" : winRate >= 25 ? "warn" : "alert",
      metric: `${winRate}%`,
      metricLabel: `${won} of ${won + lost} closed`,
    });
  }

  // 4. Stale new leads (7+ days)
  const stale = leads.filter(l => l.pipeline_stage === "new_lead" && new Date(l.created_at) < sevenDaysAgo).length;
  if (stale > 0) {
    cards.push({
      title: "Stale New Leads",
      body: `${stale} lead${stale === 1 ? " has" : "s have"} been sitting in New Lead for 7+ days. Leads contacted within 5 minutes are 21× more likely to convert than those left for 24+ hours.`,
      action: "Open your pipeline and action or reassign these leads.",
      type: stale >= 5 ? "alert" : "warn",
      metric: String(stale),
      metricLabel: "need action",
    });
  }

  // 5. Avg AI lead quality score
  if (stats && stats.avg_ai_score && stats.ai_handled_leads >= 5) {
    const score = Math.round(stats.avg_ai_score);
    const avgScore = bm?.avg_lead_score ?? 55;
    const isAbove = score >= avgScore;
    const benchText = bm
      ? `The ${nicheLabel} niche average is ${avgScore}/100 across ${bm.company_count} businesses.`
      : "Healthy pipelines typically average 55–70.";
    cards.push({
      title: "Lead Quality Score",
      body: isAbove
        ? `Your leads average ${score}/100. ${benchText} High-scoring leads convert at roughly 2× the rate of low-scored leads.`
        : score >= 40
        ? `Your leads average ${score}/100. ${benchText} Improving intake form clarity or ad targeting typically lifts scores.`
        : `A score of ${score}/100 suggests low-intent leads. ${benchText} Review your ad copy, landing page, and intake questions.`,
      type: isAbove ? "good" : score >= 40 ? "warn" : "info",
      metric: `${score}`,
      metricLabel: "avg score /100",
    });
  }

  // 6. Avg deal value
  const wonWithValue = leads.filter(l => l.pipeline_stage === "closed_won" && Number(l.value) > 0);
  if (wonWithValue.length >= 3) {
    const avg = Math.round(wonWithValue.reduce((s, l) => s + Number(l.value), 0) / wonWithValue.length);
    const avgDeal = bm?.avg_deal_value ?? null;
    const benchText = avgDeal
      ? `The ${nicheLabel} niche average is ${fmt(avgDeal)} across ${bm.company_count} businesses.`
      : "AU trade mid-range is typically $2,500–$8,000 per job.";
    const isAbove = avgDeal ? avg >= avgDeal : avg >= 2500;
    cards.push({
      title: "Average Deal Value",
      body: `Your average closed deal is ${fmt(avg)}. ${benchText}${avg >= (avgDeal || 8000) ? " Ensure your quoting reflects premium positioning." : avg < (avgDeal || 2500) ? " Consider bundling services or adjusting minimum job size." : " Upselling add-ons at quote stage is the fastest way to grow this."}`,
      type: "info",
      metric: fmt(avg),
      metricLabel: `from ${wonWithValue.length} deals`,
    });
  }

  // Show a teaser if no benchmark yet
  if (!bm && niche && cards.length > 0) {
    cards.push({
      title: "Niche Benchmarks Coming Soon",
      body: `Once 10+ ${nicheLabel} businesses on Lead Gen Rentals have enough pipeline data, you'll see how you compare to your peers - callback rates, win rates, deal values, and more. Your data contributes automatically if you've opted in under Account Settings.`,
      type: "info",
      metric: null,
    });
  }

  return cards;
}

// =============================================================================
// ── Integrations (API Keys & Webhooks) ────────────────────────────────────────
// =============================================================================

async function loadIntegrations() {
  if (!currentCompanyId) return;
  await Promise.all([loadApiKeys(), loadWebhooks(), loadWebhookDeliveries()]);
  wireIntegrationsUI();
  renderIcons();
}

let integrationsWired = false;
function wireIntegrationsUI() {
  if (integrationsWired) return;
  integrationsWired = true;

  // API Key buttons
  document.getElementById("createApiKeyBtn")?.addEventListener("click", () => {
    document.getElementById("apiKeyFormPanel").style.display = "";
    document.getElementById("apiKeyCreatedPanel").style.display = "none";
    document.getElementById("apiKeyForm")?.reset();
  });
  document.getElementById("cancelApiKeyBtn")?.addEventListener("click", () => {
    document.getElementById("apiKeyFormPanel").style.display = "none";
  });
  document.getElementById("apiKeyCreatedDoneBtn")?.addEventListener("click", () => {
    document.getElementById("apiKeyCreatedPanel").style.display = "none";
  });
  document.getElementById("copyApiKeyBtn")?.addEventListener("click", () => {
    const val = document.getElementById("apiKeyRawValue")?.textContent;
    if (val) {
      navigator.clipboard.writeText(val).then(() => toast("API key copied to clipboard!"));
    }
  });
  document.getElementById("apiKeyForm")?.addEventListener("submit", handleCreateApiKey);

  // Webhook buttons
  document.getElementById("createWebhookBtn")?.addEventListener("click", () => {
    document.getElementById("webhookFormPanel").style.display = "";
    document.getElementById("webhookForm")?.reset();
    document.getElementById("webhookEditId").value = "";
  });
  document.getElementById("cancelWebhookBtn")?.addEventListener("click", () => {
    document.getElementById("webhookFormPanel").style.display = "none";
  });
  document.getElementById("copyWebhookSecretBtn")?.addEventListener("click", () => {
    const val = document.getElementById("webhookSecretValue")?.textContent;
    if (val) {
      navigator.clipboard.writeText(val).then(() => toast("Webhook secret copied to clipboard!"));
    }
  });
  document.getElementById("webhookSecretDoneBtn")?.addEventListener("click", () => {
    document.getElementById("webhookSecretPanel").style.display = "none";
  });
  document.getElementById("webhookForm")?.addEventListener("submit", handleSaveWebhook);
}

// ── API Keys ──────────────────────────────────────────────────────────────────

async function loadApiKeys() {
  const container = document.getElementById("apiKeysTable");
  if (!container) return;

  const { data, error } = await sb
    .from("company_api_tokens")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("created_at", { ascending: false });

  if (error) { container.innerHTML = `<div class="notice">Failed to load API keys.</div>`; return; }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="notice">No API keys yet. Create one to start integrating.</div>`;
    return;
  }

  const rows = data.map((k) => {
    const revoked = !!k.revoked_at;
    const expired = k.expires_at && new Date(k.expires_at) < new Date();
    const status = revoked ? "Revoked" : expired ? "Expired" : "Active";
    const statusClass = revoked || expired ? "muted" : "";
    const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never";
    const created = new Date(k.created_at).toLocaleDateString();

    return `<div class="row${revoked ? " muted" : ""}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <b>${esc(k.name)}</b>
        <span style="font-family:monospace;font-size:12px;color:var(--text-2);margin-left:8px">${esc(k.token_prefix)}…</span>
      </div>
      <div style="font-size:12px;color:var(--text-2);display:flex;gap:16px;align-items:center">
        <span>${status}</span>
        <span>Created ${created}</span>
        <span>Last used: ${lastUsed}</span>
        ${!revoked && !k.name.includes('LEADGENRENTALS KEY') ? `<button class="btn" style="font-size:11px;padding:4px 10px" onclick="revokeApiKey('${k.id}', ${JSON.stringify(k.name)})">Revoke</button>` : ""}
      </div>
    </div>`;
  }).join("");

  container.innerHTML = rows;
}

async function handleCreateApiKey(e) {
  e.preventDefault();
  if (!currentCompanyId) return;

  const name = document.getElementById("apiKeyName")?.value?.trim();
  if (!name) { toast("Key name is required", true); return; }

  // Collect scopes
  const scopes = [];
  if (document.getElementById("scopeLeadsRead")?.checked) scopes.push("leads:read");
  if (document.getElementById("scopeLeadsWrite")?.checked) scopes.push("leads:write");
  if (document.getElementById("scopeQuotesRead")?.checked) scopes.push("quotes:read");
  if (document.getElementById("scopeAppointmentsRead")?.checked) scopes.push("appointments:read");
  if (document.getElementById("scopePipelineRead")?.checked) scopes.push("pipeline:read");
  if (document.getElementById("scopeSmsSend")?.checked) scopes.push("sms:send");

  if (scopes.length === 0) { toast("Select at least one scope", true); return; }

  // Expiry
  const expiryDays = document.getElementById("apiKeyExpiry")?.value;
  let expiresAt = null;
  if (expiryDays) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(expiryDays));
    expiresAt = d.toISOString();
  }

  // Generate a random token (48 bytes = 64 base64 chars)
  const rawBytes = new Uint8Array(48);
  crypto.getRandomValues(rawBytes);
  const rawToken = "qlhq_" + Array.from(rawBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const tokenPrefix = rawToken.slice(0, 12);

  // SHA-256 hash
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { error } = await sb.from("company_api_tokens").insert({
    company_id: currentCompanyId,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    name,
    scopes,
    expires_at: expiresAt,
  });

  if (error) { toast("Failed to create API key: " + error.message, true); return; }

  // Show the raw key to the user
  document.getElementById("apiKeyFormPanel").style.display = "none";
  document.getElementById("apiKeyCreatedPanel").style.display = "";
  document.getElementById("apiKeyRawValue").textContent = rawToken;

  toast("API key created! Copy it now - it won't be shown again.");
  loadApiKeys();
}

async function revokeApiKey(id, name) {
  if (name && name.includes('LEADGENRENTALS KEY')) { toast("This key cannot be revoked.", true); return; }
  if (!confirm("Revoke this API key? Any integrations using it will stop working.")) return;

  const { error } = await sb
    .from("company_api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", currentCompanyId);

  if (error) { toast("Failed to revoke key: " + error.message, true); return; }
  toast("API key revoked.");
  loadApiKeys();
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

async function loadWebhooks() {
  const container = document.getElementById("webhooksTable");
  if (!container) return;

  const { data, error } = await sb
    .from("webhook_endpoints")
    .select("*")
    .eq("company_id", currentCompanyId)
    .order("created_at", { ascending: false });

  if (error) { container.innerHTML = `<div class="notice">Failed to load webhooks.</div>`; return; }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="notice">No webhooks configured. Add one to receive event notifications.</div>`;
    return;
  }

  const rows = data.map((wh) => {
    const events = Array.isArray(wh.events) ? wh.events.join(", ") : "";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-family:monospace;font-size:13px">${esc(wh.url)}</div>
        <div style="font-size:11px;color:var(--text-2);margin-top:2px">${esc(events)}</div>
      </div>
      <div style="font-size:12px;display:flex;gap:8px;align-items:center">
        <span style="color:${wh.active ? "var(--green)" : "var(--text-2)"}">${wh.active ? "Active" : "Inactive"}</span>
        <button class="btn" style="font-size:11px;padding:4px 10px" onclick="testWebhook('${wh.id}', this)">Test</button>
        <button class="btn" style="font-size:11px;padding:4px 10px" onclick="toggleWebhook('${wh.id}', ${!wh.active})">${wh.active ? "Disable" : "Enable"}</button>
        <button class="btn" style="font-size:11px;padding:4px 10px" onclick="deleteWebhook('${wh.id}')">Delete</button>
      </div>
    </div>`;
  }).join("");

  container.innerHTML = rows;
}

async function handleSaveWebhook(e) {
  e.preventDefault();
  if (!currentCompanyId) return;

  const url = document.getElementById("webhookUrl")?.value?.trim();
  if (!url) { toast("Webhook URL is required", true); return; }

  // Collect events
  const events = [];
  document.querySelectorAll(".wh-event:checked").forEach((el) => events.push(el.value));
  if (events.length === 0) { toast("Select at least one event", true); return; }

  // Generate signing secret
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = "whsec_" + Array.from(secretBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const editId = document.getElementById("webhookEditId")?.value;

  if (editId) {
    const { error } = await sb
      .from("webhook_endpoints")
      .update({ url, events })
      .eq("id", editId)
      .eq("company_id", currentCompanyId);
    if (error) { toast("Failed to update webhook: " + error.message, true); return; }
    toast("Webhook updated.");
  } else {
    const { error } = await sb.from("webhook_endpoints").insert({
      company_id: currentCompanyId,
      url,
      events,
      secret,
    });
    if (error) { toast("Failed to create webhook: " + error.message, true); return; }
    // Show signing secret in a persistent panel so user can copy it
    document.getElementById("webhookSecretPanel").style.display = "";
    document.getElementById("webhookSecretValue").textContent = secret;
    toast("Webhook created! Copy the signing secret below.");
  }

  document.getElementById("webhookFormPanel").style.display = "none";
  loadWebhooks();
}

async function testWebhook(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Testing…"; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) { toast("Not authenticated.", true); return; }
    const res = await fetch(`${sb.supabaseUrl}/functions/v1/test-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ webhook_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast("Test failed: " + (data.error || "could not send the event"), true); return; }
    if (data.ok) {
      toast(`Test delivered - endpoint responded HTTP ${data.response_status}${data.signed ? " (signed)" : " (unsigned)"}.`);
    } else {
      toast(`Endpoint responded HTTP ${data.response_status || "error"}. See the deliveries log below.`, true);
    }
    loadWebhookDeliveries();
  } catch (_e) {
    toast("Test failed - could not send the event.", true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Test"; }
  }
}

async function toggleWebhook(id, active) {
  const { error } = await sb
    .from("webhook_endpoints")
    .update({ active })
    .eq("id", id)
    .eq("company_id", currentCompanyId);
  if (error) { toast("Failed to update webhook", true); return; }
  toast(active ? "Webhook enabled." : "Webhook disabled.");
  loadWebhooks();
}

async function deleteWebhook(id) {
  confirmAction("Delete this webhook endpoint? This cannot be undone.", async () => {
    const { error } = await sb
      .from("webhook_endpoints")
      .delete()
      .eq("id", id)
      .eq("company_id", currentCompanyId);
    if (error) { toast("Failed to delete webhook: " + error.message, true); return; }
    toast("Webhook deleted.");
    loadWebhooks();
  });
}

async function loadWebhookDeliveries() {
  const container = document.getElementById("webhookDeliveriesTable");
  if (!container) return;

  const { data, error } = await sb
    .from("webhook_deliveries")
    .select("*, webhook_endpoints(url)")
    .eq("company_id", currentCompanyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { container.innerHTML = `<div class="notice">Failed to load deliveries.</div>`; return; }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="notice">No webhook deliveries yet.</div>`;
    return;
  }

  const rows = data.map((d) => {
    const ts = new Date(d.created_at).toLocaleString();
    const statusColor = d.success ? "var(--green)" : "var(--red, #e74c3c)";
    const url = d.webhook_endpoints?.url || "-";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border);font-size:12px">
      <div style="flex:1;display:flex;gap:12px;align-items:center">
        <span style="color:${statusColor};font-weight:600">${d.response_status || "ERR"}</span>
        <span>${esc(d.event)}</span>
        <span class="muted" style="font-family:monospace;font-size:11px">${esc(url)}</span>
      </div>
      <span class="muted">${ts}</span>
    </div>`;
  }).join("");

  container.innerHTML = rows;
}

// ─── Reviews ──────────────────────────────────────────────────────────────────
const DEFAULT_REVIEW_MESSAGE = "Hi {{first_name}}, thank you for choosing us! We'd love your feedback - please leave us a Google review: {{review_link}}";

async function loadReviews() {
  if (!currentCompanyId) return;
  try {
    // Load review settings from sms_agent_config
    const { data: smsConfig } = await sb
      .from("sms_agent_config")
      .select("review_enabled, review_delay_days, review_auto_send, review_message, google_review_link")
      .eq("company_id", currentCompanyId)
      .maybeSingle();

    if (smsConfig) {
      setCheckboxValue("reviewEnabled", smsConfig.review_enabled);
      setInputValue("reviewDelayDays", smsConfig.review_delay_days ?? 7);
      setCheckboxValue("reviewAutoSend", smsConfig.review_auto_send);
      setInputValue("reviewMessage", smsConfig.review_message || DEFAULT_REVIEW_MESSAGE);
      setInputValue("googleReviewLink", smsConfig.google_review_link);
    } else {
      setInputValue("reviewMessage", DEFAULT_REVIEW_MESSAGE);
      setInputValue("reviewDelayDays", 7);
    }

    // Load review requests
    const { data: requests } = await sb
      .from("review_requests")
      .select("*, leads!inner(first_name, last_name, phone, email)")
      .eq("company_id", currentCompanyId)
      .order("created_at", { ascending: false })
      .limit(100);

    const all = requests || [];
    const pending  = all.filter((r) => r.status === "pending");
    const sent     = all.filter((r) => r.status === "sent");
    const skipped  = all.filter((r) => r.status === "skipped");

    const pendingEl  = document.getElementById("reviewPendingCount");
    const sentEl     = document.getElementById("reviewSentCount");
    const skippedEl  = document.getElementById("reviewSkippedCount");
    if (pendingEl)  pendingEl.textContent = pending.length;
    if (sentEl)     sentEl.textContent = sent.length;
    if (skippedEl)  skippedEl.textContent = skipped.length;

    renderReviewRequestsTable(all);

  } catch (err) {
    console.error("Load reviews error:", err);
    toast("Failed to load reviews.", true);
  }
}

function renderReviewRequestsTable(requests) {
  const container = document.getElementById("reviewRequestsTable");
  if (!container) return;

  if (!requests?.length) {
    container.innerHTML = '<div class="notice">No review requests yet. When a lead is moved to Closed Won, a review request will be scheduled.</div>';
    return;
  }

  const header = `<div style="display:grid;grid-template-columns:1.2fr 1fr .8fr .8fr .8fr auto;padding:8px 14px;border-bottom:2px solid var(--border);font-weight:600;font-size:12px">
    <span>Customer</span><span>Phone</span><span>Status</span><span>Scheduled</span><span>Sent</span><span></span>
  </div>`;

  const rows = requests.map((r) => {
    const name = `${r.leads?.first_name || ""} ${r.leads?.last_name || ""}`.trim() || "Unknown";
    const phone = r.leads?.phone || "-";
    const statusColors = { pending: "var(--yellow)", sent: "var(--green)", skipped: "var(--text-3)", failed: "var(--red)" };
    const statusColor = statusColors[r.status] || "var(--text-2)";
    const scheduled = r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString() : "-";
    const sentAt = r.sent_at ? new Date(r.sent_at).toLocaleDateString() : "-";

    let actions = "";
    if (r.status === "pending") {
      actions = `<div style="display:flex;gap:6px">
        <button class="btn" style="font-size:11px;padding:3px 8px" onclick="sendReviewRequest('${r.id}')">Send Now</button>
        <button class="btn" style="font-size:11px;padding:3px 8px" onclick="skipReviewRequest('${r.id}')">Skip</button>
      </div>`;
    }

    return `<div style="display:grid;grid-template-columns:1.2fr 1fr .8fr .8fr .8fr auto;padding:8px 14px;border-bottom:1px solid var(--border);font-size:13px;align-items:center">
      <span>${esc(name)}</span>
      <span class="muted">${esc(phone)}</span>
      <span style="color:${statusColor};font-weight:600;text-transform:capitalize">${r.status}</span>
      <span class="muted">${scheduled}</span>
      <span class="muted">${sentAt}</span>
      ${actions}
    </div>`;
  }).join("");

  container.innerHTML = header + rows;
}

async function handleReviewSettingsSave(e) {
  e.preventDefault();
  if (!currentCompanyId) return;

  const payload = {
    company_id:         currentCompanyId,
    review_enabled:     document.getElementById("reviewEnabled")?.checked ?? false,
    review_delay_days:  Number(document.getElementById("reviewDelayDays")?.value) || 7,
    review_auto_send:   document.getElementById("reviewAutoSend")?.checked ?? false,
    review_message:     document.getElementById("reviewMessage")?.value || DEFAULT_REVIEW_MESSAGE,
    google_review_link: document.getElementById("googleReviewLink")?.value || null,
  };

  try {
    const { error } = await sb
      .from("sms_agent_config")
      .upsert(payload, { onConflict: "company_id" });

    if (error) {
      toast(error.message, true);
      return;
    }
    toast("Review settings saved.");
  } catch (err) {
    toast("Failed to save review settings.", true);
    console.error("Save review settings error:", err);
  }
}

async function scheduleReviewRequest(leadId) {
  if (!currentCompanyId) return;
  try {
    // Check if reviews are enabled and configured
    const { data: smsConfig } = await sb
      .from("sms_agent_config")
      .select("review_enabled, review_delay_days, review_auto_send, review_message, google_review_link, twilio_number, is_active")
      .eq("company_id", currentCompanyId)
      .maybeSingle();

    if (!smsConfig?.review_enabled || !smsConfig.google_review_link) return;

    // Get lead details for message interpolation
    const { data: lead } = await sb
      .from("leads")
      .select("id, first_name, phone")
      .eq("id", leadId)
      .single();

    if (!lead?.phone) return;

    // Build the message body
    const firstName = lead.first_name || "there";
    const messageBody = (smsConfig.review_message || DEFAULT_REVIEW_MESSAGE)
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{review_link\}\}/gi, smsConfig.google_review_link);

    const delayDays = smsConfig.review_delay_days ?? 7;
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + delayDays);

    // Check if there's already a pending or sent review request for this lead
    const { data: existing } = await sb
      .from("review_requests")
      .select("id")
      .eq("lead_id", leadId)
      .in("status", ["pending", "sent"])
      .maybeSingle();

    if (existing) return; // Already has a review request

    // Create review request
    const { data: created, error } = await sb
      .from("review_requests")
      .insert({
        company_id:   currentCompanyId,
        lead_id:      leadId,
        status:       "pending",
        scheduled_at: scheduledAt.toISOString(),
        message_body: messageBody,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("Failed to schedule review request:", error.message);
      return;
    }

    // If auto-send is enabled and delay is 0, send immediately
    if (smsConfig.review_auto_send && delayDays === 0 && created) {
      await sendReviewRequestSms(created.id, messageBody, lead.phone);
    }
  } catch (err) {
    console.warn("scheduleReviewRequest error:", err);
  }
}

async function sendReviewRequest(requestId) {
  try {
    // Get the review request with lead details
    const { data: request } = await sb
      .from("review_requests")
      .select("*, leads!inner(phone, first_name)")
      .eq("id", requestId)
      .single();

    if (!request || request.status !== "pending") {
      toast("Review request not found or already processed.", true);
      return;
    }

    // Get SMS config for Twilio
    const { data: smsConfig } = await sb
      .from("sms_agent_config")
      .select("twilio_number, is_active, google_review_link")
      .eq("company_id", currentCompanyId)
      .maybeSingle();

    if (!smsConfig?.twilio_number || !smsConfig.is_active) {
      toast("SMS agent not configured or inactive. Enable SMS in AI Settings first.", true);
      return;
    }

    await sendReviewRequestSms(requestId, request.message_body, request.leads.phone);
    toast("Review request sent!");
    loadReviews();
  } catch (err) {
    toast("Failed to send review request.", true);
    console.error("sendReviewRequest error:", err);
  }
}

async function sendReviewRequestSms(requestId, body, phone) {
  // Send the SMS via the existing send-sms edge function
  const { data: session } = await sb.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  // Get the lead_id for send-sms
  const { data: request } = await sb
    .from("review_requests")
    .select("lead_id")
    .eq("id", requestId)
    .single();

  const res = await fetch(`${sb.supabaseUrl}/functions/v1/send-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lead_id: request.lead_id,
      body: body,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Mark as failed
    await sb.from("review_requests").update({ status: "failed" }).eq("id", requestId);
    throw new Error(err.error || "Failed to send SMS");
  }

  // Mark as sent
  await sb.from("review_requests").update({
    status: "sent",
    sent_at: new Date().toISOString(),
  }).eq("id", requestId);
}

async function skipReviewRequest(requestId) {
  try {
    const { error } = await sb
      .from("review_requests")
      .update({ status: "skipped" })
      .eq("id", requestId);

    if (error) {
      toast(error.message, true);
      return;
    }
    toast("Review request skipped.");
    loadReviews();
  } catch (err) {
    toast("Failed to skip review request.", true);
  }
}

// =============================================================================
// Buy Leads helpers
// =============================================================================
function nicheLabel(niche) {
  if (niche === 'solar_battery' || niche === 'solar-battery') return 'Solar + Battery';
  if (niche === 'battery_retrofit' || niche === 'battery-retrofit') return 'Battery Retrofit';
  return (niche || '').split(/[_-]/).map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}

// =============================================================================
// Buy Leads state
// =============================================================================
let _pplPricing      = [];  // kept for sub-niche compat; primary prices are _blCityPrices
let _blDiscountTiers = [];  // [{min_quantity, discount_percent, label, is_popular}]
let _blNiche         = null;
let _blSubNiche      = null;
let _blCity          = null;
let _blLocType       = 'radius';
let _blStatewide     = false;       // true when an entire state is selected
let _blCovMode       = 'radius';    // remembers radius/postcodes when not state-wide
let _blPPL           = null;
let _blQty           = 25;
let _blDiscount      = 0;
let _blCityPrices    = {};  // niche → price_per_lead for selected city
let _blCitySubPrices = {};  // 'niche:sub_niche' → price_per_lead for selected city
let _blSoldOut       = {};  // 'niche' or 'niche:sub_niche' → true when sold out for selected city
let _blMax           = {};  // 'niche' or 'niche:sub_niche' → max leads per order for selected city (null = unlimited)
const BL_HARD_MAX    = 500; // absolute ceiling per order regardless of cap
const _pplOrdersCache = new Map();

// Effective per-order cap for the current selection (sub-niche cap wins, then
// niche cap; null cap means unlimited, so fall back to the hard ceiling).
function blActiveMax() {
  let cap = null;
  if (_blNiche && _blSubNiche && _blMax[_blNiche + ':' + _blSubNiche] != null) cap = _blMax[_blNiche + ':' + _blSubNiche];
  else if (_blNiche && _blMax[_blNiche] != null) cap = _blMax[_blNiche];
  return cap == null ? BL_HARD_MAX : Math.min(cap, BL_HARD_MAX);
}

// Sub-niche definitions per parent niche
const NICHE_SUB_NICHES = {
  hvac: [
    { id: 'split_ducted',              label: 'Installations (Split & Ducted)' },
    { id: 'installations_maintenance', label: 'Installations & Maintenance'    },
  ],
};

function subNicheLabel(subNiche) {
  for (const subs of Object.values(NICHE_SUB_NICHES)) {
    const found = subs.find(s => s.id === subNiche);
    if (found) return found.label;
  }
  return nicheLabel(subNiche);
}

async function loadBuyLeads() {
  if (!currentCompanyId) return;

  const [{ data: orders }, { data: tiers }] = await Promise.all([
    sb.from('ppl_lead_orders').select('*').eq('company_id', currentCompanyId).order('created_at', { ascending: false }),
    sb.from('volume_discount_tiers').select('min_quantity, discount_percent, label, is_popular').eq('active', true).order('sort_order'),
  ]);

  _pplPricing = []; _blCityPrices = {}; _blCitySubPrices = {}; _blSoldOut = {}; _blMax = {};
  _blDiscountTiers = tiers || [];
  _blNiche = null; _blSubNiche = null; _blCity = null; _blPPL = null; _blLocType = 'radius';
  _blStatewide = false; _blCovMode = 'radius';
  _blQty = _blDiscountTiers[0]?.min_quantity ?? 25;
  _blDiscount = 0;

  // City visible from the start; niche hidden until city chosen
  document.getElementById('buyLeadsCityField').style.display = '';
  document.getElementById('buyLeadsNicheField').style.display = 'none';
  document.getElementById('buyLeadsSubNicheField').style.display = 'none';
  document.getElementById('buyLeadsLocationField').style.display = 'none';
  document.getElementById('buyLeadsQtyField').style.display = 'none';
  document.getElementById('buyLeadsSummary').style.display = 'none';

  const cityEl = document.getElementById('buyLeadsCity');
  if (cityEl) {
    cityEl.value = '';
    cityEl.onchange = () => {
      _blCity = cityEl.value || null;
      _blStatewide = !!cityEl.value && cityEl.selectedOptions[0]?.dataset.statewide === '1';
      buyLeadsOnCityChange();
    };
  }

  renderBuyLeadsNiches();
  renderBuyLeadsOrders(orders || []);

  document.getElementById('buyLeadsRadius')?.addEventListener('change', buyLeadsUpdateSummary);
  document.getElementById('buyLeadsPostcodes')?.addEventListener('input', buyLeadsUpdateSummary);
}

const BL_NICHES = ['solar', 'solar-battery', 'hvac', 'battery-retrofit'];

function renderBuyLeadsNiches() {
  const el = document.getElementById('buyLeadsNicheCards');
  if (!el) return;
  el.innerHTML = BL_NICHES.map(niche => {
    const label = nicheLabel(niche);
    // Sold out for this city - render greyed out, non-selectable, no price.
    if (_blSoldOut[niche]) {
      return `<button type="button" disabled
        id="nicheCard-${niche}"
        style="padding:10px 20px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2,var(--bg-lift));color:var(--text,var(--ink));font-size:13px;font-weight:500;cursor:not-allowed;opacity:0.45;transition:all 0.15s;font-family:inherit;text-align:left;line-height:1.4">
        ${label} - <span style="color:#f87171">Sold out</span>
      </button>`;
    }
    const price = _blCityPrices[niche];
    const priceNote = _blCity
      ? (price ? ` - $${price}/lead` : ' - loading…')
      : '';
    const isSelected = niche === _blNiche;
    return `<button type="button" onclick="buyLeadsSelectNiche('${niche}')"
      id="nicheCard-${niche}"
      style="padding:10px 20px;border-radius:10px;border:1px solid ${isSelected ? 'var(--accent,#4797FF)' : 'var(--border)'};background:${isSelected ? 'var(--accent,#4797FF)' : 'var(--surface-2,var(--bg-lift))'};color:${isSelected ? '#fff' : 'var(--text,var(--ink))'};font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;font-family:inherit;text-align:left;line-height:1.4">
      ${label}${priceNote}
    </button>`;
  }).join('');
}

function renderBuyLeadsSubNiches(niche) {
  const field = document.getElementById('buyLeadsSubNicheField');
  const el    = document.getElementById('buyLeadsSubNicheCards');
  const subs  = NICHE_SUB_NICHES[niche];
  if (!field || !el || !subs) { if (field) field.style.display = 'none'; return; }

  const parentPPL = _blCityPrices[niche] ?? null;
  const anyNote   = parentPPL != null ? ` - $${parentPPL}/lead` : '';
  const isAny     = _blSubNiche === null;

  let html = `<button type="button" onclick="buyLeadsSelectSubNiche(null)"
    id="subNicheCard-any"
    style="padding:10px 20px;border-radius:10px;border:1px solid ${isAny ? 'var(--accent,#4797FF)' : 'var(--border)'};background:${isAny ? 'var(--accent,#4797FF)' : 'var(--surface-2,var(--bg-lift))'};color:${isAny ? '#fff' : 'var(--text,var(--ink))'};font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;font-family:inherit;text-align:left;line-height:1.4">
    Any ${nicheLabel(niche)}${anyNote}
  </button>`;

  html += subs.map(s => {
    // Sold out for this city - render greyed out, non-selectable, no price.
    if (_blSoldOut[niche + ':' + s.id]) {
      return `<button type="button" disabled
        id="subNicheCard-${s.id}"
        style="padding:10px 20px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2,var(--bg-lift));color:var(--text,var(--ink));font-size:13px;font-weight:500;cursor:not-allowed;opacity:0.45;transition:all 0.15s;font-family:inherit;text-align:left;line-height:1.4">
        ${s.label} - <span style="color:#f87171">Sold out</span>
      </button>`;
    }
    const cached    = _blCitySubPrices[niche + ':' + s.id];
    const priceNote = cached != null ? ` - $${cached}/lead` : (_blCity ? ' - loading…' : '');
    const isSel     = _blSubNiche === s.id;
    return `<button type="button" onclick="buyLeadsSelectSubNiche('${s.id}')"
      id="subNicheCard-${s.id}"
      style="padding:10px 20px;border-radius:10px;border:1px solid ${isSel ? 'var(--accent,#4797FF)' : 'var(--border)'};background:${isSel ? 'var(--accent,#4797FF)' : 'var(--surface-2,var(--bg-lift))'};color:${isSel ? '#fff' : 'var(--text,var(--ink))'};font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;font-family:inherit;text-align:left;line-height:1.4">
      ${s.label}${priceNote}
    </button>`;
  }).join('');

  el.innerHTML = html;
  field.style.display = '';

  // Prefetch sub-niche prices in background
  if (_blCity) subs.forEach(s => blFetchSubNichePrice(niche, s.id));
}

async function blFetchSubNichePrice(niche, subNicheId) {
  const cacheKey = niche + ':' + subNicheId;
  if (_blCitySubPrices[cacheKey] != null || _blSoldOut[cacheKey] || !_blCity) return;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/get-ppl-pricing?niche=${encodeURIComponent(niche)}&sub_niche=${encodeURIComponent(subNicheId)}&area=${encodeURIComponent(_blCity)}`
    );
    if (!r.ok) return;
    const d = await r.json();
    if (d.sold_out === true) {
      _blSoldOut[cacheKey] = true;
      // If this sub-niche is currently selected, drop it back to "Any".
      if (_blNiche === niche && _blSubNiche === subNicheId) {
        _blSubNiche = null;
        _blPPL = _blCityPrices[niche] ?? null;
        buyLeadsUpdateSummary();
      }
      renderBuyLeadsSubNiches(niche);
    } else if (d.price_per_lead != null) {
      _blCitySubPrices[cacheKey] = d.price_per_lead;
      _blMax[cacheKey] = d.max_order_qty ?? null;
      renderBuyLeadsSubNiches(niche);
      // If this sub-niche is currently selected, update PPL
      if (_blNiche === niche && _blSubNiche === subNicheId) {
        _blPPL = d.price_per_lead;
        buyLeadsUpdateSummary();
      }
    }
  } catch {}
}

function renderBuyLeadsPacks() {
  const el = document.getElementById('buyLeadsPackGrid');
  if (!el) return;
  if (!_blDiscountTiers.length) {
    el.innerHTML = `<p style="font-size:13px;color:var(--muted)">No packs available.</p>`;
    return;
  }
  const cap = blActiveMax();
  el.innerHTML = _blDiscountTiers.map(t => {
    const isSelected = t.min_quantity === _blQty;
    const overCap = t.min_quantity > cap;
    const badge = t.discount_percent > 0
      ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:20px;font-size:10px;font-weight:700;background:${isSelected ? 'rgba(255,255,255,0.25)' : '#22c55e22'};color:${isSelected ? '#fff' : '#16a34a'}">${t.discount_percent}% off</span>`
      : '';
    const popular = t.is_popular
      ? `<div style="font-size:10px;font-weight:600;color:${isSelected ? 'rgba(255,255,255,0.8)' : 'var(--accent,#4797FF)'};margin-top:2px">Most popular</div>`
      : '';
    if (overCap) {
      return `<button type="button" disabled title="Not available in this area right now"
        style="padding:12px 18px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2,var(--bg-lift));color:var(--muted);font-size:13px;font-weight:600;cursor:not-allowed;opacity:0.5;font-family:inherit;text-align:left;line-height:1.4;min-width:100px">
        ${t.label}
      </button>`;
    }
    return `<button type="button" id="packCard-${t.min_quantity}"
      onclick="buyLeadsSelectPack(${t.min_quantity}, ${t.discount_percent})"
      style="padding:12px 18px;border-radius:10px;border:1px solid ${isSelected ? '#4797FF' : 'var(--border)'};background:${isSelected ? '#4797FF' : 'var(--surface-2,var(--bg-lift))'};color:${isSelected ? '#fff' : 'var(--text,var(--ink))'};font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s;font-family:inherit;text-align:left;line-height:1.4;min-width:100px">
      ${t.label}${badge}
      ${popular}
    </button>`;
  }).join('');
  const note = document.getElementById('buyLeadsCapNote');
  if (note) {
    if (cap < BL_HARD_MAX) {
      note.textContent = `Up to ${cap} leads per order available for this lead type in this area.`;
      note.style.display = '';
    } else {
      note.style.display = 'none';
    }
  }
}

function buyLeadsSelectNiche(niche) {
  if (_blSoldOut[niche]) return;   // sold out for this city - not selectable
  _blNiche    = niche;
  _blSubNiche = null;
  _blPPL      = _blCityPrices[niche] ?? null;

  // Re-render niche cards to update selection highlight
  renderBuyLeadsNiches();

  document.getElementById('buyLeadsLocationField').style.display = 'none';
  document.getElementById('buyLeadsQtyField').style.display = 'none';
  document.getElementById('buyLeadsSummary').style.display = 'none';

  const hasSubs = !!NICHE_SUB_NICHES[niche];
  if (hasSubs) {
    renderBuyLeadsSubNiches(niche);
  } else {
    const subField = document.getElementById('buyLeadsSubNicheField');
    if (subField) subField.style.display = 'none';
    // Go straight to coverage
    document.getElementById('buyLeadsLocationField').style.display = '';
    document.getElementById('buyLeadsQtyField').style.display = '';
    buyLeadsApplyCoverageMode();
    renderBuyLeadsPacks();
    wireCustomQtyInput();
  }
}

function buyLeadsSelectSubNiche(subNicheId) {
  if (subNicheId && _blSoldOut[_blNiche + ':' + subNicheId]) return;   // sold out - not selectable
  _blSubNiche = subNicheId;

  // Resolve price: use cached city-specific price or fall back to parent niche price
  if (subNicheId) {
    const cached = _blCitySubPrices[_blNiche + ':' + subNicheId];
    _blPPL = cached ?? _blCityPrices[_blNiche] ?? null;
    if (!cached && _blCity) blFetchSubNichePrice(_blNiche, subNicheId);
  } else {
    _blPPL = _blCityPrices[_blNiche] ?? null;
  }

  // Re-render sub-niche cards to update selection highlight
  renderBuyLeadsSubNiches(_blNiche);

  // Advance to coverage + quantity
  document.getElementById('buyLeadsLocationField').style.display = '';
  document.getElementById('buyLeadsQtyField').style.display = '';
  document.getElementById('buyLeadsSummary').style.display = 'none';
  buyLeadsApplyCoverageMode();
  renderBuyLeadsPacks();
  wireCustomQtyInput();
}
window.buyLeadsSelectSubNiche = buyLeadsSelectSubNiche;

function buyLeadsSelectPack(qty, discountPct) {
  _blQty      = qty;
  _blDiscount = discountPct;
  const input = document.getElementById('buyLeadsCustomQty');
  if (input) input.value = qty;
  renderBuyLeadsPacks();
  buyLeadsUpdateSummary();
}

// Returns the best active discount tier for a given quantity (highest min_qty ≤ qty)
function blGetTierForQty(qty) {
  let best = null;
  for (const t of _blDiscountTiers) {
    if (t.min_quantity <= qty) best = t;
    else break;
  }
  return best;
}

async function buyLeadsOnCityChange() {
  const city = _blCity;
  if (!city) {
    _blCityPrices = {}; _blCitySubPrices = {}; _blSoldOut = {};
    document.getElementById('buyLeadsNicheField').style.display = 'none';
    document.getElementById('buyLeadsSubNicheField').style.display = 'none';
    document.getElementById('buyLeadsLocationField').style.display = 'none';
    document.getElementById('buyLeadsQtyField').style.display = 'none';
    document.getElementById('buyLeadsSummary').style.display = 'none';
    return;
  }

  // Show niche field with loading placeholders
  _blCityPrices = {}; _blSoldOut = {}; _blMax = {};
  renderBuyLeadsNiches();
  document.getElementById('buyLeadsNicheField').style.display = '';

  // Fetch all niche prices in parallel
  const results = await Promise.allSettled(
    BL_NICHES.map(niche =>
      fetch(`${SUPABASE_URL}/functions/v1/get-ppl-pricing?niche=${encodeURIComponent(niche)}&area=${encodeURIComponent(city)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => ({ niche, price: d.price_per_lead, soldOut: d.sold_out === true, maxQty: d.max_order_qty ?? null, tiers: d.discount_tiers }))
    )
  );

  results.forEach(r => {
    if (r.status !== 'fulfilled') return;
    if (r.value.tiers?.length) _blDiscountTiers = r.value.tiers;
    if (r.value.soldOut) {
      _blSoldOut[r.value.niche] = true;
    } else if (r.value.price != null) {
      _blCityPrices[r.value.niche] = r.value.price;
      _blMax[r.value.niche] = r.value.maxQty;
    }
  });

  renderBuyLeadsNiches();

  // If niche already selected (city changed after), re-resolve PPL and re-render sub-niches
  if (_blNiche) {
    if (_blSoldOut[_blNiche]) {
      // The trade the user had selected is sold out for this city - drop the
      // selection so they can't proceed on a greyed-out card.
      _blNiche = null; _blSubNiche = null; _blPPL = null;
      document.getElementById('buyLeadsSubNicheField').style.display = 'none';
      document.getElementById('buyLeadsLocationField').style.display = 'none';
      document.getElementById('buyLeadsQtyField').style.display = 'none';
      document.getElementById('buyLeadsSummary').style.display = 'none';
      renderBuyLeadsNiches();
    } else {
      _blPPL = _blCityPrices[_blNiche] || null;
      _blCitySubPrices = {};
      if (NICHE_SUB_NICHES[_blNiche]) {
        renderBuyLeadsSubNiches(_blNiche);
        if (_blSubNiche) blFetchSubNichePrice(_blNiche, _blSubNiche);
      }
      buyLeadsApplyCoverageMode();
    }
  }
  buyLeadsUpdateSummary();
}

function wireCustomQtyInput() {
  const input = document.getElementById('buyLeadsCustomQty');
  if (!input) return;
  const fresh = input.cloneNode(true);
  fresh.max = blActiveMax();
  input.parentNode.replaceChild(fresh, input);
  fresh.value = _blQty;
  fresh.addEventListener('input', buyLeadsOnCustomQtyChange);
}

function buyLeadsOnCustomQtyChange() {
  const input = document.getElementById('buyLeadsCustomQty');
  let raw = parseInt(input?.value || '0');
  if (isNaN(raw) || raw < 25) return; // wait until valid
  const cap = blActiveMax();
  if (raw > cap) { raw = cap; if (input) input.value = cap; toast(`Up to ${cap} leads per order for this area.`, true); }
  _blQty = raw;
  const tier = blGetTierForQty(_blQty);
  _blDiscount = tier ? tier.discount_percent : 0;
  renderBuyLeadsPacks(); // re-render to reflect active state
  buyLeadsUpdateSummary();
}

// Locks coverage to "state-wide" when an entire state is selected; otherwise
// restores the Radius / Postcode controls for a specific city.
function buyLeadsApplyCoverageMode() {
  const toggle = document.getElementById('buyLeadsLocToggle');
  const sPanel = document.getElementById('locStatewidePanel');
  if (_blStatewide) {
    _blLocType = 'statewide';
    if (toggle) toggle.style.display = 'none';
    document.getElementById('locRadiusPanel').style.display    = 'none';
    document.getElementById('locPostcodesPanel').style.display = 'none';
    if (sPanel) sPanel.style.display = '';
    const nm = document.getElementById('buyLeadsStatewideName');
    if (nm) nm.textContent = _blCity || 'this state';
    buyLeadsUpdateSummary();
  } else {
    if (toggle) toggle.style.display = '';
    if (sPanel) sPanel.style.display = 'none';
    buyLeadsSetLocType(_blCovMode);
  }
}

function buyLeadsSetLocType(type) {
  _blLocType = type;
  _blCovMode = type;
  const isRadius = type === 'radius';

  const rBtn = document.getElementById('locTypeRadius');
  const pBtn = document.getElementById('locTypePostcodes');
  if (rBtn) { rBtn.style.background = isRadius ? 'var(--accent,#4797FF)' : 'var(--surface-2,var(--bg-lift))'; rBtn.style.borderColor = isRadius ? 'var(--accent,#4797FF)' : 'var(--border)'; rBtn.style.color = isRadius ? '#fff' : 'var(--text,var(--ink))'; }
  if (pBtn) { pBtn.style.background = !isRadius ? 'var(--accent,#4797FF)' : 'var(--surface-2,var(--bg-lift))'; pBtn.style.borderColor = !isRadius ? 'var(--accent,#4797FF)' : 'var(--border)'; pBtn.style.color = !isRadius ? '#fff' : 'var(--text,var(--ink))'; }

  document.getElementById('locRadiusPanel').style.display    = isRadius ? '' : 'none';
  document.getElementById('locPostcodesPanel').style.display = !isRadius ? '' : 'none';
  buyLeadsUpdateSummary();
}

function buyLeadsUpdateSummary() {
  if (!_blNiche || !_blCity || !_blPPL) return;
  if (_blQty < 10) { document.getElementById('buyLeadsSummary').style.display = 'none'; return; }

  const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v);

  let coverage = '';
  if (_blStatewide) {
    coverage = 'State wide';
  } else if (_blLocType === 'postcodes') {
    const raw = (document.getElementById('buyLeadsPostcodes')?.value || '').trim();
    const count = raw ? raw.split(/[\s,]+/).filter(Boolean).length : 0;
    if (!count) { document.getElementById('buyLeadsSummary').style.display = 'none'; return; }
    coverage = `${count} postcode${count !== 1 ? 's' : ''}`;
  } else {
    const radius = document.getElementById('buyLeadsRadius')?.value || 50;
    coverage = `${radius}km radius`;
  }

  const subtotal = _blQty * _blPPL;
  const saving   = subtotal * (_blDiscount / 100);
  const total    = subtotal - saving;

  document.getElementById('buyLeadsSumNiche').textContent    = nicheLabel(_blNiche);
  const subNicheRow = document.getElementById('buyLeadsSumSubNicheRow');
  if (subNicheRow) {
    if (_blSubNiche) {
      document.getElementById('buyLeadsSumSubNiche').textContent = subNicheLabel(_blSubNiche);
      subNicheRow.style.display = 'flex';
    } else {
      subNicheRow.style.display = 'none';
    }
  }
  const cityLbl = document.getElementById('buyLeadsSumCityLbl');
  if (cityLbl) cityLbl.textContent = _blStatewide ? 'State' : 'City';
  document.getElementById('buyLeadsSumCity').textContent     = _blCity;
  document.getElementById('buyLeadsSumCoverage').textContent = coverage;
  document.getElementById('buyLeadsSumQty').textContent      = `${_blQty} leads`;
  document.getElementById('buyLeadsSumPPL').textContent      = fmt(_blPPL);
  document.getElementById('buyLeadsSumTotal').textContent    = fmt(total);

  const discRow = document.getElementById('buyLeadsSumDiscountRow');
  if (discRow) {
    if (_blDiscount > 0) {
      document.getElementById('buyLeadsSumDiscount').textContent = `−${fmt(saving)} (${_blDiscount}% off)`;
      discRow.style.display = 'flex';
    } else {
      discRow.style.display = 'none';
    }
  }

  document.getElementById('buyLeadsSummary').style.display = '';
  const btn = document.getElementById('buyLeadsCheckoutBtn');
  if (btn) btn.onclick = () => startPplCheckout();
}

async function startPplCheckout() {
  const radius    = parseInt(document.getElementById('buyLeadsRadius')?.value || 50);
  const postcodes = (document.getElementById('buyLeadsPostcodes')?.value || '').trim();

  if (!_blNiche || !_blCity) { toast('Please select a niche and city.', true); return; }
  if (_blSoldOut[_blNiche] || (_blSubNiche && _blSoldOut[_blNiche + ':' + _blSubNiche])) {
    toast('That trade is sold out in this area. Please choose another.', true); return;
  }
  const cap = blActiveMax();
  if (_blQty > cap) { toast(`Up to ${cap} leads per order for this area. Please lower the quantity.`, true); return; }
  if (_blLocType === 'postcodes' && !postcodes) { toast('Please paste your postcode list.', true); return; }

  const btn = document.getElementById('buyLeadsCheckoutBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecting to checkout…'; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-ppl-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        company_id:    currentCompanyId,
        niche:         _blNiche,
        sub_niche:     _blSubNiche || null,
        area_city:     _blCity,
        location_type: _blLocType,
        radius_km:     _blLocType === 'radius' ? radius : null,
        postcode_list: _blLocType === 'postcodes' ? postcodes : null,
        quantity:      _blQty,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'No checkout URL returned');
    window.location.href = data.url;
  } catch (err) {
    toast(err.message || 'Failed to start checkout', true);
    if (btn) { btn.disabled = false; btn.textContent = 'Purchase Leads →'; }
  }
}

function renderBuyLeadsOrders(orders) {
  const el = document.getElementById('buyLeadsOrdersTable');
  if (!el) return;
  orders.forEach(o => _pplOrdersCache.set(o.id, o));
  if (!orders.length) { el.innerHTML = `<div class="notice">No orders yet. Purchase your first lead pack above.</div>`; return; }

  const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v);
  const statusColor = s => ({ paid:'#4797FF', active:'#22c55e', fulfilled:'#22c55e', cancelled:'#9a9a9a' }[s] || '#9a9a9a');

  const pending = orders.filter(o => o.status === 'pending');
  const active  = orders.filter(o => o.status !== 'pending');

  let html = '';

  // Pending (incomplete checkout) - shown as banners above the table
  if (pending.length) {
    html += pending.map(o => {
      const city  = o.area_city || o.area || '-';
      const pendingNicheDisplay = nicheLabel(o.niche) + (o.sub_niche ? ` › ${subNicheLabel(o.sub_niche)}` : '');
      const label = `${pendingNicheDisplay} - ${city} - ${o.quantity} leads - ${fmt(o.total_amount)}`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-radius:12px;border:1px solid #f59e0b44;background:#fffbeb;margin-bottom:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <div>
            <div style="font-size:13px;font-weight:600;color:#92400e">Payment not completed</div>
            <div style="font-size:12px;color:#b45309;margin-top:1px">${label}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button onclick="retryPplOrder('${o.id}')" style="font-size:12px;padding:6px 14px;border-radius:8px;border:1px solid #f59e0b;background:#f59e0b;color:#fff;cursor:pointer;font-family:inherit;font-weight:500">Complete Payment</button>
          <button onclick="deletePendingOrder('${o.id}')" style="font-size:12px;padding:6px 14px;border-radius:8px;border:1px solid #ef4444;background:transparent;color:#ef4444;cursor:pointer;font-family:inherit">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  // Active / fulfilled / cancelled orders - table
  if (active.length) {
    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="border-bottom:1px solid var(--border)">
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">Niche</th>
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">City</th>
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">Coverage</th>
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">Delivered</th>
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">Total</th>
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">Status</th>
      <th style="padding:8px 10px;text-align:left;font-weight:500;color:var(--muted)">Date</th>
    </tr></thead><tbody>
    ${active.map(o => {
      const city = o.area_city || o.area || '-';
      const coverage = o.location_type === 'statewide'
        ? 'State wide'
        : o.location_type === 'postcodes'
        ? (o.postcode_list ? `${o.postcode_list.split(/[\s,]+/).filter(Boolean).length} postcodes` : 'Postcodes')
        : `${o.radius_km || 50}km radius`;
      const nicheDisplay = nicheLabel(o.niche) + (o.sub_niche ? ` › ${subNicheLabel(o.sub_niche)}` : '');
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:10px">${nicheDisplay}</td>
        <td style="padding:10px">${city}</td>
        <td style="padding:10px;color:var(--muted)">${coverage}</td>
        <td style="padding:10px">${o.delivered_count} / ${o.quantity}</td>
        <td style="padding:10px">${fmt(o.total_amount)}</td>
        <td style="padding:10px"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;background:${statusColor(o.status)}22;color:${statusColor(o.status)};font-weight:500">${o.status}</span></td>
        <td style="padding:10px;color:var(--muted)">${new Date(o.created_at).toLocaleDateString('en-AU')}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
  }

  el.innerHTML = html;
}

async function retryPplOrder(orderId) {
  const o = _pplOrdersCache.get(orderId);
  if (!o) { toast('Order not found.', true); return; }

  const btn = document.getElementById('buyLeadsCheckoutBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecting to checkout…'; }

  try {
    // Delete the stale pending row before creating a fresh checkout
    await sb.from('ppl_lead_orders').delete().eq('id', orderId).eq('status', 'pending');

    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-ppl-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({
        company_id:    currentCompanyId,
        niche:         o.niche,
        sub_niche:     o.sub_niche || null,
        area_city:     o.area_city || o.area,
        location_type: o.location_type || 'radius',
        radius_km:     o.radius_km || 50,
        postcode_list: o.postcode_list || null,
        quantity:      o.quantity,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'No checkout URL returned');
    window.location.href = data.url;
  } catch (err) {
    toast(err.message || 'Failed to start checkout', true);
    if (btn) { btn.disabled = false; btn.textContent = 'Purchase Leads →'; }
  }
}
window.retryPplOrder = retryPplOrder;

async function deletePendingOrder(orderId) {
  confirmAction('Delete this pending order? This cannot be undone.', async () => {
    try {
      const { error } = await sb.from('ppl_lead_orders').delete().eq('id', orderId).eq('status', 'pending');
      if (error) { toast(error.message, true); return; }
      toast('Pending order deleted.');
      _pplOrdersCache.delete(orderId);
      await loadBuyLeads();
    } catch (err) {
      toast('Failed to delete order.', true);
    }
  });
}
window.deletePendingOrder = deletePendingOrder;

async function deletePendingOrderFromSettings(orderId) {
  confirmAction('Delete this pending order? This cannot be undone.', async () => {
    try {
      const { error } = await sb.from('ppl_lead_orders').delete().eq('id', orderId).eq('status', 'pending');
      if (error) { toast(error.message, true); return; }
      toast('Pending order deleted.');
      _pplOrdersCache.delete(orderId);
      await loadPplOrdersUI();
    } catch (err) {
      toast('Failed to delete order.', true);
    }
  });
}
window.deletePendingOrderFromSettings = deletePendingOrderFromSettings;


// =============================================================================
// PPL Admin (super admin only)
// =============================================================================

// =============================================================================
// Add to Home Screen (PWA install prompt - shown once per new device/user)
// =============================================================================

let _a2hsDeferredPrompt = null;

// Capture the Android/Chrome install prompt before it fires automatically
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _a2hsDeferredPrompt = e;
});

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
}

function isMobileDevice() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }
  return navigator.maxTouchPoints > 0 && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

async function _markA2hsDismissed(userId) {
  localStorage.setItem(`ql_aths_${userId}`, '1');
  await sb.from('profiles').update({ a2hs_dismissed: true }).eq('id', userId);
}

function maybeShowInstallPrompt(userId, alreadyDismissed) {
  // Desktop browsers - home screen prompt is not relevant
  if (!isMobileDevice()) return;

  // Already installed as a standalone app - no need to prompt
  if (isInStandaloneMode()) return;

  // DB says this user has already seen and dismissed the banner
  if (alreadyDismissed) return;

  // Fast local cache (survives page refreshes within the same browser)
  if (localStorage.getItem(`ql_aths_${userId}`)) return;

  const banner = document.getElementById('a2hsBanner');
  if (!banner) return;

  const instructions = document.getElementById('a2hsInstructions');
  const installBtn   = document.getElementById('a2hsInstallBtn');
  const dismissBtn   = document.getElementById('a2hsDismissBtn');

  if (isIosDevice()) {
    if (instructions) instructions.textContent = 'Tap the Share button (↑) in Safari then "Add to Home Screen".';
    setTimeout(() => { banner.style.display = ''; }, 1500);
  } else if (_a2hsDeferredPrompt) {
    if (instructions) instructions.textContent = 'Install for quick access - works like a native app, no app store needed.';
    if (installBtn) installBtn.style.display = '';
    if (installBtn) installBtn.addEventListener('click', async () => {
      banner.style.display = 'none';
      _a2hsDeferredPrompt.prompt();
      await _a2hsDeferredPrompt.userChoice;
      _a2hsDeferredPrompt = null;
      _markA2hsDismissed(userId);
    });
    setTimeout(() => { banner.style.display = ''; }, 1500);
  }

  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    _markA2hsDismissed(userId);
  });
}

