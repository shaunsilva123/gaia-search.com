// Supabase Edge Function "outlook" — connects Gaia Search CRM to Microsoft 365.
// Deploy with "Verify JWT" switched OFF (Microsoft's sign-in redirect can't send one);
// every action below does its own check.
//
// Secrets needed (Supabase → Edge Functions → Secrets):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://gaia-search.com/recruitCRM.html";
const SCOPES = "offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite";
const GRAPH = "https://graph.microsoft.com/v1.0";
const env = (k: string) => Deno.env.get(k) ?? "";
const SUPABASE_URL = env("SUPABASE_URL");
const FN_URL = `${SUPABASE_URL}/functions/v1/outlook`;
const admin = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const authority = () => `https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0`;

// ── who is calling? ──────────────────────────────────────────────────────
async function callerKind(req: Request): Promise<"user" | "system" | null> {
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  if (tok === env("SUPABASE_SERVICE_ROLE_KEY")) return "system";
  const { data } = await admin.auth.getUser(tok);
  if (data?.user) return "user";
  if (tok === env("SUPABASE_ANON_KEY")) return "system"; // scheduled sync from Supabase Cron
  return null;
}

// ── tokens ───────────────────────────────────────────────────────────────
async function tokenRequest(params: Record<string, string>) {
  const body = new URLSearchParams({
    client_id: env("MS_CLIENT_ID"), client_secret: env("MS_CLIENT_SECRET"), scope: SCOPES, ...params,
  });
  const r = await fetch(`${authority()}/token`, { method: "POST", body });
  const j = await r.json();
  if (!r.ok) throw new Error(`Microsoft sign-in: ${j.error_description || j.error || r.status}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}

async function accessToken(): Promise<string> {
  const { data: c } = await admin.from("ms_connection").select("*").eq("id", 1).maybeSingle();
  if (!c?.refresh_token) throw new Error("Outlook is not connected");
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 120_000) return c.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  await admin.from("ms_connection").update({
    access_token: t.access_token,
    refresh_token: t.refresh_token || c.refresh_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  return t.access_token;
}

async function graph(path: string, init: RequestInit = {}) {
  const tok = await accessToken();
  const r = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    ...init,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="Europe/London"', ...(init.headers || {}) },
  });
  if (r.status === 202 || r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Outlook: ${j?.error?.message || r.status}`);
  return j;
}

// ── sync: Outlook → CRM ──────────────────────────────────────────────────
const lower = (s?: string | null) => String(s || "").trim().toLowerCase();
const domainOf = (e: string) => lower(e).split("@")[1] || "";
const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|protonmail|btinternet|sky|msn)\./;

async function allRows(table: string, cols: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function fetchFolder(folder: "sentitems" | "inbox", since: string, cap = 500) {
  const field = folder === "sentitems" ? "sentDateTime" : "receivedDateTime";
  const sel = "id,internetMessageId,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,webLink,hasAttachments";
  let url: string | null = `/me/mailFolders/${folder}/messages?$filter=${field} ge ${since}&$orderby=${field} asc&$top=50&$select=${sel}`;
  const out: any[] = [];
  while (url && out.length < cap) {
    const page: any = await graph(url);
    out.push(...(page?.value || []));
    url = page?.["@odata.nextLink"] || null;
  }
  return out;
}

async function sync() {
  const { data: conn } = await admin.from("ms_connection").select("account,last_sync").eq("id", 1).maybeSingle();
  if (!conn) throw new Error("Outlook is not connected");
  const me = lower(conn.account);
  const since = new Date(conn.last_sync ? new Date(conn.last_sync).getTime() - 10 * 60_000 : Date.now() - 2 * 86_400_000).toISOString();
  const started = new Date().toISOString();

  const [sent, inbox, cands, contacts, cos] = await Promise.all([
    fetchFolder("sentitems", since), fetchFolder("inbox", since),
    allRows("candidates", "id,name,email"), allRows("contacts", "company_id,email"), allRows("companies", "id,name,website"),
  ]);
  const candByEmail = new Map<string, any>();
  for (const c of cands) if (c.email) candByEmail.set(lower(c.email), c);
  const coByEmail = new Map<string, string>();
  for (const ct of contacts) if (ct.email && ct.company_id) coByEmail.set(lower(ct.email), ct.company_id);
  const coByDomain = new Map<string, any>();
  for (const co of cos) {
    const d = lower(co.website).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (d && d.includes(".") && !FREE_MAIL.test(d)) coByDomain.set(d, co);
  }
  const coName = new Map(cos.map((c: any) => [c.id, c.name]));

  // existing activity markers (for de-duplication with earlier runs / the daily task)
  const { data: recentActs } = await admin.from("activity_log").select("id,entity_id,activity_type,subject,body,created_at")
    .gte("created_at", new Date(Date.parse(since) - 86_400_000).toISOString());
  const seenMid = new Set<string>();
  for (const a of recentActs || []) { const m = /\[mid:([^\]]+)\]/.exec(a.body || ""); if (m) seenMid.add(m[1] + "|" + a.entity_id); }

  let logged = 0, stored = 0, cvs = 0;
  const unmatched = new Set<string>();
  const handle = async (m: any, direction: "sent" | "received") => {
    const fromE = lower(m.from?.emailAddress?.address);
    const toE = [...(m.toRecipients || []), ...(m.ccRecipients || [])].map((r: any) => lower(r.emailAddress?.address)).filter(Boolean);
    const others = direction === "sent" ? toE.filter((e: string) => e !== me) : [fromE].filter((e) => e && e !== me);
    if (!others.length) return; // e.g. website copies sent to himself
    const candIds = new Set<string>(), coIds = new Set<string>();
    for (const e of others) {
      const c = candByEmail.get(e); if (c) candIds.add(c.id);
      const co = coByEmail.get(e) || coByDomain.get(domainOf(e))?.id; if (co) coIds.add(co);
      if (!c && !co && direction === "sent") unmatched.add(e);
    }
    if (!candIds.size && !coIds.size) return;
    const when = direction === "sent" ? m.sentDateTime : m.receivedDateTime;
    const { error } = await admin.from("emails").upsert({
      graph_id: m.id, internet_message_id: m.internetMessageId, conversation_id: m.conversationId, direction,
      from_email: fromE, from_name: m.from?.emailAddress?.name || null, to_emails: toE,
      subject: m.subject || "", preview: (m.bodyPreview || "").slice(0, 400), sent_at: when, web_link: m.webLink,
      has_attachments: !!m.hasAttachments, candidate_ids: [...candIds], company_ids: [...coIds],
    }, { onConflict: "graph_id" });
    if (!error) stored++;
    if (direction !== "sent") return; // only sent mail counts on the scorecard
    const mid = m.internetMessageId;
    const marker = `Auto-logged from Outlook [mid:${mid}]`;
    const subj = `Email: ${(m.subject || "(no subject)").slice(0, 80)}`;
    const day = String(when).slice(0, 10);
    for (const id of candIds) {
      if (seenMid.has(mid + "|" + id)) continue;
      // merge with a tap on the CRM "Email" button that day instead of double-counting
      const tap = (recentActs || []).find((a: any) => a.entity_id === id && a.activity_type === "Email" && a.subject === "Emailed from CRM" && !a.body && String(a.created_at).slice(0, 10) === day);
      if (tap) { await admin.from("activity_log").update({ subject: subj, body: marker }).eq("id", tap.id); tap.body = marker; }
      else await admin.from("activity_log").insert({ entity_type: "candidate", entity_id: id, entity_name: candByEmail.get(others.find((e: string) => candByEmail.get(e)?.id === id)!)?.name || "", activity_type: "Email", subject: subj, body: marker });
      seenMid.add(mid + "|" + id); logged++;
    }
    for (const id of coIds) {
      if (seenMid.has(mid + "|" + id)) continue;
      await admin.from("activity_log").insert({ entity_type: "company", entity_id: id, entity_name: coName.get(id) || "", activity_type: "Email", subject: subj, body: marker });
      seenMid.add(mid + "|" + id); logged++;
      // a CV sent to a client → submittal
      if (m.hasAttachments && /\bcv\b|\bresume\b|profile/i.test(`${m.subject} ${m.bodyPreview}`)) {
        const { data: dup } = await admin.from("submittals").select("id").ilike("notes", `%[mid:${mid}]%`).limit(1);
        if (!dup?.length) {
          const text = `${m.subject} ${m.bodyPreview}`.toLowerCase();
          const named = cands.find((c: any) => c.name && c.name.length > 5 && text.includes(String(c.name).toLowerCase()));
          const to = (m.toRecipients || [])[0]?.emailAddress;
          await admin.from("submittals").insert({
            candidate_id: named?.id || null, job_id: null, status: "Submitted", submitted_date: day,
            notes: `Company: ${coName.get(id) || ""}\nRole: ${m.subject || ""}\nSent to: ${[to?.name, to?.address].filter(Boolean).join(" ")}\nAuto-logged from Outlook [mid:${mid}]`,
          });
          cvs++;
        }
      }
    }
  };
  for (const m of sent) await handle(m, "sent");
  for (const m of inbox) await handle(m, "received");
  const result = `${sent.length} sent / ${inbox.length} received checked · ${logged} logged · ${cvs} CVs · ${stored} on record`;
  await admin.from("ms_connection").update({ last_sync: started, last_sync_result: result, updated_at: started }).eq("id", 1);
  return { ok: true, sent: sent.length, received: inbox.length, logged, cvs, stored, unmatched: [...unmatched].slice(0, 15) };
}

// ── request router ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  try {
    // Microsoft redirects the browser here after sign-in
    if (url.searchParams.has("code") || url.searchParams.has("error")) {
      const back = (q: string) => Response.redirect(`${APP_URL}?outlook=${q}`, 302);
      if (url.searchParams.get("error")) return back("denied");
      const { data: c } = await admin.from("ms_connection").select("pending_state,pending_expires").eq("id", 1).maybeSingle();
      if (!c?.pending_state || c.pending_state !== url.searchParams.get("state") || new Date(c.pending_expires) < new Date()) return back("expired");
      const t = await tokenRequest({ grant_type: "authorization_code", code: url.searchParams.get("code")!, redirect_uri: FN_URL });
      const me = await (await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
      await admin.from("ms_connection").update({
        account: me.mail || me.userPrincipalName, refresh_token: t.refresh_token, access_token: t.access_token,
        expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), pending_state: null, pending_expires: null,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      return back("connected");
    }

    const who = await callerKind(req);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || url.searchParams.get("action");
    if (!who) return json({ error: "Not signed in" }, 401);
    if (action === "sync") return json(await sync());
    if (who !== "user") return json({ error: "Not allowed" }, 403);

    switch (action) {
      case "start": {
        const state = crypto.randomUUID();
        await admin.from("ms_connection").upsert({ id: 1, pending_state: state, pending_expires: new Date(Date.now() + 15 * 60_000).toISOString() });
        const q = new URLSearchParams({ client_id: env("MS_CLIENT_ID"), response_type: "code", redirect_uri: FN_URL, response_mode: "query", scope: SCOPES, state, prompt: "select_account" });
        return json({ url: `${authority()}/authorize?${q}` });
      }
      case "disconnect":
        await admin.from("ms_connection").update({ refresh_token: null, access_token: null, expires_at: null, account: null }).eq("id", 1);
        return json({ ok: true });
      case "send": {
        const to = (Array.isArray(body.to) ? body.to : [body.to]).filter(Boolean);
        if (!to.length || !body.subject) return json({ error: "Recipient and subject needed" }, 400);
        await graph("/me/sendMail", { method: "POST", body: JSON.stringify({
          message: { subject: body.subject, body: { contentType: "Text", content: body.body || "" },
            toRecipients: to.map((a: string) => ({ emailAddress: { address: a } })),
            ccRecipients: (body.cc || []).map((a: string) => ({ emailAddress: { address: a } })) },
          saveToSentItems: true }) });
        // log it straight away so the scorecard updates without waiting for the next sync
        // @ts-ignore EdgeRuntime is provided by Supabase
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(new Promise((r) => setTimeout(r, 8000)).then(() => sync()).catch(() => {}));
        return json({ ok: true });
      }
      case "event": {
        const ev: any = await graph("/me/events", { method: "POST", body: JSON.stringify({
          subject: body.subject, body: { contentType: "Text", content: body.body || "" },
          start: { dateTime: body.start, timeZone: "Europe/London" }, end: { dateTime: body.end, timeZone: "Europe/London" },
          location: body.location ? { displayName: body.location } : undefined,
          attendees: (body.attendees || []).filter(Boolean).map((a: string) => ({ emailAddress: { address: a }, type: "required" })),
          isOnlineMeeting: !!body.teams, onlineMeetingProvider: body.teams ? "teamsForBusiness" : undefined,
        }) });
        return json({ ok: true, id: ev?.id, webLink: ev?.webLink, joinUrl: ev?.onlineMeeting?.joinUrl || null });
      }
      case "today": {
        const d = body.date || new Date().toISOString().slice(0, 10);
        const r: any = await graph(`/me/calendarView?startDateTime=${d}T00:00:00&endDateTime=${d}T23:59:59&$orderby=start/dateTime&$top=30&$select=subject,start,end,location,webLink,onlineMeeting,attendees,isCancelled`);
        return json({ events: (r?.value || []).filter((e: any) => !e.isCancelled).map((e: any) => ({
          subject: e.subject, start: e.start?.dateTime, end: e.end?.dateTime, location: e.location?.displayName || "",
          webLink: e.webLink, joinUrl: e.onlineMeeting?.joinUrl || null,
          attendees: (e.attendees || []).map((a: any) => a.emailAddress?.address).filter(Boolean),
        })) });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
