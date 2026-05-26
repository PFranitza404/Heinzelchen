import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 3000);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const mailFrom = process.env.MAIL_FROM || "Helfende Hände <noreply@helfende-haende.de>";
const mailMode = resendApiKey ? "resend" : "console";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const starterDb = {
  workers: [
    {
      id: "worker-1",
      name: "Max Beispiel",
      email: "max@helfende-haende.de",
      phone: "+49 511 000001",
      city: "Hannover",
      serviceArea: "Hannover",
      radiusKm: "bis 10 km",
      leadTime: "Mindestens 24 Stunden",
      skills: ["Gartenarbeit", "Einkaufsservice", "Technik-Hilfe"],
      availability: {
        Montag: ["09:00-13:00"],
        Mittwoch: ["12:00-18:00"],
        Freitag: ["09:00-16:00"],
      },
      active: true,
    },
  ],
  bookings: [],
};

function supabaseEnabled() {
  return Boolean(supabaseUrl && supabaseKey);
}

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) await writeLocalDb(starterDb);
}

async function readLocalDb() {
  await ensureDb();
  return JSON.parse(await readFile(dbPath, "utf8"));
}

async function writeLocalDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function supabaseHeaders(prefer) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function supabaseRequest(table, options = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase ist nicht konfiguriert.");
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: supabaseHeaders(options.prefer),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${table}: ${response.status} ${detail}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

const rowToData = (row) => row?.data || row;

function radiusToInteger(radiusKm) {
  const match = `${radiusKm || ""}`.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function bookingToRow(booking) {
  return {
    id: booking.id,
    status: booking.status,
    assigned_worker_id: booking.assignedWorkerId,
    appointment_date: booking.appointment?.date || null,
    city: booking.customer?.city || "",
    created_at: booking.createdAt,
    data: booking,
  };
}

function workerToRow(worker) {
  return {
    id: worker.id,
    active: worker.active !== false,
    city: worker.city || "",
    service_area: worker.serviceArea || worker.city || "",
    name: worker.name || "",
    email: worker.email || "",
    phone: worker.phone || "",
    skills: Array.isArray(worker.skills) ? worker.skills : [],
    availability: worker.availability || {},
    radius_km: radiusToInteger(worker.radiusKm),
    local_areas: Array.isArray(worker.localAreas) ? worker.localAreas : [],
    data: worker,
  };
}

async function readDb() {
  if (!supabaseEnabled()) return readLocalDb();
  const [bookings, workers] = await Promise.all([
    supabaseRequest("bookings", { query: "select=*&order=created_at.desc" }),
    supabaseRequest("workers", { query: "select=*&order=created_at.desc" }),
  ]);
  return {
    bookings: bookings.map(rowToData),
    workers: workers.map(rowToData),
  };
}

async function insertBooking(booking) {
  if (!supabaseEnabled()) {
    const db = await readLocalDb();
    db.bookings.unshift(booking);
    await writeLocalDb(db);
    return booking;
  }
  const [row] = await supabaseRequest("bookings", {
    method: "POST",
    prefer: "return=representation",
    body: bookingToRow(booking),
  });
  return rowToData(row);
}

async function insertWorker(worker) {
  if (!supabaseEnabled()) {
    const db = await readLocalDb();
    db.workers.unshift(worker);
    await writeLocalDb(db);
    return worker;
  }
  const [row] = await supabaseRequest("workers", {
    method: "POST",
    prefer: "return=representation",
    body: workerToRow(worker),
  });
  return rowToData(row);
}

async function updateBooking(booking) {
  if (!supabaseEnabled()) {
    const db = await readLocalDb();
    const index = db.bookings.findIndex((item) => item.id === booking.id);
    if (index >= 0) db.bookings[index] = booking;
    await writeLocalDb(db);
    return booking;
  }
  const [row] = await supabaseRequest("bookings", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(booking.id)}`,
    prefer: "return=representation",
    body: bookingToRow(booking),
  });
  return rowToData(row);
}

async function updateWorker(worker) {
  if (!supabaseEnabled()) {
    const db = await readLocalDb();
    const index = db.workers.findIndex((item) => item.id === worker.id);
    if (index >= 0) db.workers[index] = worker;
    await writeLocalDb(db);
    return worker;
  }
  const [row] = await supabaseRequest("workers", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(worker.id)}`,
    prefer: "return=representation",
    body: workerToRow(worker),
  });
  return rowToData(row);
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(data));
}

function normalizeBooking(body) {
  return {
    id: `booking-${Date.now()}`,
    status: "Neu",
    createdAt: new Date().toISOString(),
    services: Array.isArray(body.services) ? body.services : [],
    extraTask: body.extraTask || "",
    duration: body.duration || "",
    frequency: body.frequency || "",
    customer: {
      firstName: body.firstName || "",
      lastName: body.lastName || "",
      street: body.street || "",
      zip: body.zip || "",
      city: body.city || "",
      phone: body.phone || "",
      email: body.email || "",
    },
    appointment: {
      date: body.date || "",
      time: body.time || "",
    },
    payment: {
      provider: "stripe-placeholder",
      status: "nicht_eingezogen",
    },
    assignedWorkerId: null,
    internalNote: "",
  };
}

function normalizeWorker(body) {
  const availability = body.availability || {};
  return {
    id: `worker-${Date.now()}`,
    name: body.name || "",
    email: body.email || "",
    phone: body.phone || "",
    city: body.city || "",
    serviceArea: body.serviceArea || body.city || "",
    radiusKm: body.radiusKm || "",
    leadTime: body.leadTime || "",
    skills: Array.isArray(body.skills) ? body.skills : [],
    extraSkills: body.extraSkills || "",
    localAreas: Array.isArray(body.localAreas) ? body.localAreas : [],
    areaNotes: body.areaNotes || "",
    qualificationConfirmed: body.qualificationConfirmed === true,
    identityNotes: body.identityNotes || "",
    identityDocumentName: body.identityDocumentName || "",
    availability,
    active: true,
  };
}

function weekdayFromDate(date) {
  return date
    ? new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${date}T12:00:00`))
    : "";
}

function cityMatches(worker, booking) {
  const bookingCity = booking.customer.city.trim().toLowerCase();
  const workerCity = `${worker.serviceArea || worker.city || ""}`.trim().toLowerCase();
  if (!bookingCity || !workerCity) return true;
  return bookingCity.includes(workerCity) || workerCity.includes(bookingCity);
}

function hasSkill(worker, booking) {
  return booking.services.length === 0 || booking.services.some((service) => worker.skills.includes(service));
}

function workerStatus(worker) {
  return worker.status || (worker.active === false ? "neu" : "aktiv");
}

function isAssignableWorker(worker) {
  return worker.active !== false && workerStatus(worker) === "aktiv";
}

function hasAvailability(worker, booking) {
  const weekday = weekdayFromDate(booking.appointment.date);
  return Boolean(worker.availability?.[weekday]?.length);
}

function workerHasOpenAssignment(db, workerId) {
  return db.bookings.some((booking) => booking.assignedWorkerId === workerId && booking.status !== "Erledigt");
}

function findBestWorker(db, booking) {
  return db.workers
    .filter(isAssignableWorker)
    .filter((worker) => hasSkill(worker, booking))
    .filter((worker) => hasAvailability(worker, booking))
    .filter((worker) => cityMatches(worker, booking))
    .filter((worker) => !workerHasOpenAssignment(db, worker.id))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .at(0);
}

function findAvailableWorkers(db, booking) {
  const weekday = weekdayFromDate(booking.appointment.date);
  return db.workers
    .filter(isAssignableWorker)
    .filter((worker) => hasSkill(worker, booking))
    .map((worker) => ({
      id: worker.id,
      name: worker.name,
      city: worker.city,
      serviceArea: worker.serviceArea || worker.city,
      skills: worker.skills,
      availableThatDay: Boolean(worker.availability?.[weekday]?.length),
      availability: worker.availability?.[weekday] || [],
      hasOpenAssignment: workerHasOpenAssignment(db, worker.id),
    }));
}

function formatAddress(customer) {
  return [customer.street, customer.zip, customer.city].filter(Boolean).join(", ");
}

function customerName(booking) {
  return `${booking.customer.firstName} ${booking.customer.lastName}`.trim() || "Kunde";
}

function workerName(db, booking) {
  return db.workers.find((worker) => worker.id === booking.assignedWorkerId)?.name || "";
}

async function sendEmail({ to, subject, html }) {
  if (!to) return { skipped: true, reason: "Keine Empfängeradresse" };
  if (!resendApiKey) {
    console.log("[Mail-Vorschau]", { to, subject, html });
    return { preview: true };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "helfende-haende/1.0",
    },
    body: JSON.stringify({ from: mailFrom, to, subject, html }),
  });
  if (!response.ok) throw new Error(`Resend: ${response.status} ${await response.text()}`);
  return response.json();
}

async function sendAssignmentEmails(booking, worker) {
  await Promise.all([
    sendEmail({
      to: worker.email,
      subject: `Neuer Auftrag: ${booking.services.join(", ") || "Alltagshilfe"}`,
      html: `<h2>Neuer Auftrag für dich</h2>
        <p><strong>Kunde:</strong> ${customerName(booking)}</p>
        <p><strong>Leistung:</strong> ${booking.services.join(", ") || booking.extraTask || "Freie Aufgabe"}</p>
        <p><strong>Termin:</strong> ${booking.appointment.date || "-"} um ${booking.appointment.time || "-"} Uhr</p>
        <p><strong>Adresse:</strong> ${formatAddress(booking.customer) || "-"}</p>
        <p><strong>Dauer:</strong> ${booking.duration || "-"}</p>`,
    }),
    sendEmail({
      to: booking.customer.email,
      subject: `Ihre Buchung bei Helfende Hände ist zugewiesen`,
      html: `<h2>Ihre Buchung ist bestätigt</h2>
        <p>Hallo ${booking.customer.firstName || "liebes Helfende-Hände-Mitglied"},</p>
        <p>${worker.name} übernimmt Ihre Anfrage.</p>
        <p><strong>Termin:</strong> ${booking.appointment.date || "-"} um ${booking.appointment.time || "-"} Uhr</p>
        <p><strong>Leistung:</strong> ${booking.services.join(", ") || booking.extraTask || "Alltagshilfe"}</p>`,
    }),
  ]);
}

async function handleApi(req, res, url) {
  const db = await readDb();

  if (req.method === "GET" && url.pathname === "/api/vermittlung") {
    return sendJson(res, 200, {
      bookings: db.bookings,
      workers: db.workers.map((worker) => ({
        ...worker,
        status: workerStatus(worker),
      })),
    });
  }

  const assignmentMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/assignment$/);
  if (req.method === "PATCH" && assignmentMatch) {
    const booking = db.bookings.find((item) => item.id === decodeURIComponent(assignmentMatch[1]));
    if (!booking) return sendJson(res, 404, { error: "Buchung nicht gefunden." });

    const body = await readBody(req);
    const worker = db.workers.find((item) => item.id === body.workerId);
    if (!worker) return sendJson(res, 404, { error: "Heinzelchen nicht gefunden." });
    if (!isAssignableWorker(worker) || !hasSkill(worker, booking) || !cityMatches(worker, booking)) {
      return sendJson(res, 400, { error: "Dieses Heinzelchen passt nicht zu Skill und Stadt der Buchung." });
    }

    booking.assignedWorkerId = worker.id;
    booking.status = "Zugewiesen";
    booking.internalNote = `Manuell zugewiesen an ${worker.name || worker.id}.`;
    return sendJson(res, 200, { booking: await updateBooking(booking) });
  }

  const workerStatusMatch = url.pathname.match(/^\/api\/workers\/([^/]+)\/status$/);
  if (req.method === "PATCH" && workerStatusMatch) {
    const worker = db.workers.find((item) => item.id === decodeURIComponent(workerStatusMatch[1]));
    if (!worker) return sendJson(res, 404, { error: "Heinzelchen nicht gefunden." });

    const body = await readBody(req);
    const allowed = ["neu", "geprüft", "aktiv", "abgelehnt"];
    if (!allowed.includes(body.status)) return sendJson(res, 400, { error: "Ungültiger Status." });

    worker.status = body.status;
    worker.active = body.status === "aktiv";
    return sendJson(res, 200, { worker: await updateWorker(worker) });
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const booking = normalizeBooking(await readBody(req));
    const worker = findBestWorker(db, booking);
    if (worker) {
      booking.assignedWorkerId = worker.id;
      booking.status = "Zugewiesen";
      booking.internalNote = "Automatisch zugewiesen.";
    }
    const saved = await insertBooking(booking);
    if (worker) await sendAssignmentEmails(saved, worker);
    return sendJson(res, 201, {
      booking: saved,
      assignedWorker: worker || null,
      matchingWorkers: findAvailableWorkers({ ...db, bookings: [saved, ...db.bookings] }, saved),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/workers") {
    return sendJson(res, 201, await insertWorker(normalizeWorker(await readBody(req))));
  }

  return sendJson(res, 404, { error: "API-Endpunkt nicht gefunden." });
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    const type = contentTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Datei nicht gefunden");
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Serverfehler", detail: error.message });
  }
}).listen(port, () => {
  console.log(`Dienstleistungs-Projekt läuft auf http://localhost:${port}`);
  console.log(`Arbeiter-Portal: http://localhost:${port}/arbeiter-portal.html`);
  console.log(`Speicher: ${supabaseEnabled() ? "Supabase" : "lokale JSON-Datei"}`);
  console.log(`E-Mail: ${mailMode}`);
});
