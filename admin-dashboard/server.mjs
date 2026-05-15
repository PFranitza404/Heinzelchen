import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.ADMIN_PORT || 4000);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const resendApiKey = process.env.RESEND_API_KEY;
const mailFrom = process.env.MAIL_FROM || "Helfende Hände <noreply@helfende-haende.de>";
const loginAttempts = new Map();
const maxAttempts = 3;
const lockMs = 15 * 60 * 1000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function serviceHeaders(prefer) {
  return {
    apikey: supabaseServiceKey,
    Authorization: `Bearer ${supabaseServiceKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function supabase(table, options = {}) {
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: serviceHeaders(options.prefer),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  return response.json();
}

async function requireAdmin(req, res) {
  if (!supabaseUrl || !supabaseServiceKey) {
    json(res, 500, { error: "Supabase ist nicht konfiguriert." });
    return null;
  }
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    json(res, 401, { error: "Login erforderlich." });
    return null;
  }
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) {
    json(res, 401, { error: "Session ungültig." });
    return null;
  }
  const user = await userResponse.json();
  const admins = await supabase("admin_profiles", {
    query: `select=user_id,email&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
  });
  if (!admins.length) {
    json(res, 403, { error: "Keine Admin-Berechtigung." });
    return null;
  }
  return user;
}

function loginKey(req, email) {
  return `${req.socket.remoteAddress || "unknown"}:${String(email || "").toLowerCase()}`;
}

function lockedUntil(key) {
  return loginAttempts.get(key)?.lockedUntil || 0;
}

function recordFailedLogin(key) {
  const current = loginAttempts.get(key) || { attempts: 0, lockedUntil: 0 };
  current.attempts += 1;
  if (current.attempts >= maxAttempts) {
    current.attempts = 0;
    current.lockedUntil = Date.now() + lockMs;
  }
  loginAttempts.set(key, current);
}

async function handleLogin(req, res) {
  if (!supabaseUrl || !supabaseAnonKey) return json(res, 500, { error: "Supabase Auth ist nicht konfiguriert." });
  const data = await body(req);
  const key = loginKey(req, data.email);
  const until = lockedUntil(key);
  if (until && Date.now() < until) {
    return json(res, 423, { error: `Zu viele Fehlversuche. Bitte in ${Math.ceil((until - Date.now()) / 60000)} Minuten erneut versuchen.` });
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: data.email, password: data.password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    recordFailedLogin(key);
    return json(res, 401, { error: "E-Mail oder Passwort ist falsch." });
  }

  const admins = await supabase("admin_profiles", {
    query: `select=user_id,email&user_id=eq.${encodeURIComponent(payload.user.id)}&limit=1`,
  });
  if (!admins.length) return json(res, 403, { error: "Dieser Account hat keine Admin-Berechtigung." });
  loginAttempts.delete(key);
  return json(res, 200, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    user: payload.user,
  });
}

const rowData = (row) => row?.data || row;
const bookingRow = (booking) => ({
  id: booking.id,
  status: booking.status,
  assigned_worker_id: booking.assignedWorkerId,
  appointment_date: booking.appointment?.date || null,
  city: booking.customer?.city || "",
  data: booking,
});

async function readDb() {
  const [bookings, workers] = await Promise.all([
    supabase("bookings", { query: "select=*&order=created_at.desc" }),
    supabase("workers", { query: "select=*&order=created_at.desc" }),
  ]);
  return { bookings: bookings.map(rowData), workers: workers.map(rowData) };
}

function weekday(date) {
  return date ? new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${date}T12:00:00`)) : "";
}

function matches(worker, booking, bookings) {
  const day = weekday(booking.appointment?.date);
  const city = (booking.customer?.city || "").toLowerCase();
  const area = (worker.serviceArea || worker.city || "").toLowerCase();
  const skillOk = !booking.services?.length || booking.services.some((service) => worker.skills?.includes(service));
  const dayOk = Boolean(worker.availability?.[day]?.length);
  const areaOk = !city || !area || city.includes(area) || area.includes(city);
  const busy = bookings.some((item) => item.assignedWorkerId === worker.id && item.status !== "Erledigt" && item.id !== booking.id);
  return worker.active !== false && skillOk && dayOk && areaOk && !busy;
}

async function updateBooking(booking) {
  const [row] = await supabase("bookings", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(booking.id)}`,
    prefer: "return=representation",
    body: bookingRow(booking),
  });
  return rowData(row);
}

function address(customer = {}) {
  return [customer.street, customer.zip, customer.city].filter(Boolean).join(", ");
}

async function sendMail({ to, subject, html }) {
  if (!to) return;
  if (!resendApiKey) {
    console.log("[Mail-Vorschau]", { to, subject, html });
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json", "User-Agent": "helfende-haende-admin/1.0" },
    body: JSON.stringify({ from: mailFrom, to, subject, html }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function notify(booking, worker) {
  await Promise.all([
    sendMail({
      to: worker.email,
      subject: `Neuer Auftrag: ${booking.services?.join(", ") || "Alltagshilfe"}`,
      html: `<h2>Neuer Auftrag</h2><p>${booking.appointment?.date || "-"} um ${booking.appointment?.time || "-"} Uhr</p><p>${address(booking.customer) || "-"}</p>`,
    }),
    sendMail({
      to: booking.customer?.email,
      subject: "Ihre Buchung wurde zugewiesen",
      html: `<h2>Ihre Buchung ist bestätigt</h2><p>${worker.name} übernimmt Ihren Auftrag.</p><p>${booking.appointment?.date || "-"} um ${booking.appointment?.time || "-"} Uhr</p>`,
    }),
  ]);
}

async function assign(booking, worker) {
  booking.assignedWorkerId = worker.id;
  booking.status = "Zugewiesen";
  const updated = await updateBooking(booking);
  await notify(updated, worker);
  return updated;
}

async function api(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") return await handleLogin(req, res);

  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === "GET" && url.pathname === "/api/session") {
    return json(res, 200, { user: { id: user.id, email: user.email } });
  }

  const db = await readDb();

  if (req.method === "GET" && url.pathname === "/api/overview") {
    return json(res, 200, {
      ...db,
      assignments: db.bookings
        .filter((booking) => booking.assignedWorkerId && booking.status !== "Erledigt")
        .map((booking) => ({ booking, worker: db.workers.find((worker) => worker.id === booking.assignedWorkerId) || null })),
    });
  }

  const assignMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/assign$/);
  if (req.method === "PATCH" && assignMatch) {
    const data = await body(req);
    const booking = db.bookings.find((item) => item.id === assignMatch[1]);
    const worker = db.workers.find((item) => item.id === data.workerId);
    if (!booking || !worker) return json(res, 404, { error: "Buchung oder Student nicht gefunden." });
    return json(res, 200, await assign(booking, worker));
  }

  const autoMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/auto-assign$/);
  if (req.method === "POST" && autoMatch) {
    const booking = db.bookings.find((item) => item.id === autoMatch[1]);
    if (!booking) return json(res, 404, { error: "Buchung nicht gefunden." });
    const worker = db.workers.find((item) => matches(item, booking, db.bookings));
    if (!worker) return json(res, 404, { error: "Kein verfügbarer Student gefunden." });
    return json(res, 200, await assign(booking, worker));
  }

  const statusMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const data = await body(req);
    const booking = db.bookings.find((item) => item.id === statusMatch[1]);
    if (!booking) return json(res, 404, { error: "Buchung nicht gefunden." });
    booking.status = ["Neu", "Zugewiesen", "Erledigt"].includes(data.status) ? data.status : "Neu";
    return json(res, 200, await updateBooking(booking));
  }

  return json(res, 404, { error: "Nicht gefunden." });
}

async function staticFile(req, res, url) {
  if (url.pathname === "/config.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(`window.HH_ADMIN_CONFIG=${JSON.stringify({
      supabaseUrl: supabaseUrl || "",
      supabaseAnonKey,
      apiBase: "",
    })};`);
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nicht gefunden");
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Serverfehler" });
  }
}).listen(port, () => {
  console.log(`Admin-Dashboard läuft getrennt auf http://localhost:${port}`);
});
