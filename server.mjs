import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 3000);

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

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    await writeDb(starterDb);
  }
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await readFile(dbPath, "utf8"));
}

async function writeDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function normalizeBooking(body) {
  return {
    id: `booking-${Date.now()}`,
    status: "angefragt",
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

function findAvailableWorkers(db, booking) {
  const weekday = booking.appointment.date
    ? new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${booking.appointment.date}T12:00:00`))
    : "";

  return db.workers
    .filter((worker) => worker.active)
    .filter((worker) => booking.services.length === 0 || booking.services.some((service) => worker.skills.includes(service)))
    .map((worker) => ({
      id: worker.id,
      name: worker.name,
      city: worker.city,
      skills: worker.skills,
      availableThatDay: Boolean(worker.availability?.[weekday]?.length),
      availability: worker.availability?.[weekday] || [],
    }));
}

async function handleApi(req, res, url) {
  const db = await readDb();

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    return sendJson(res, 200, db.bookings);
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const booking = normalizeBooking(await readBody(req));
    db.bookings.unshift(booking);
    await writeDb(db);
    return sendJson(res, 201, {
      booking,
      matchingWorkers: findAvailableWorkers(db, booking),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/workers") {
    return sendJson(res, 200, db.workers);
  }

  if (req.method === "POST" && url.pathname === "/api/workers") {
    const body = await readBody(req);
    const worker = {
      id: `worker-${Date.now()}`,
      name: body.name || "",
      email: body.email || "",
      phone: body.phone || "",
      city: body.city || "",
      skills: Array.isArray(body.skills) ? body.skills : [],
      availability: body.availability || {},
      active: true,
    };
    db.workers.unshift(worker);
    await writeDb(db);
    return sendJson(res, 201, worker);
  }

  const assignMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/assign$/);
  if (req.method === "PATCH" && assignMatch) {
    const body = await readBody(req);
    const booking = db.bookings.find((item) => item.id === assignMatch[1]);
    const worker = db.workers.find((item) => item.id === body.workerId);
    if (!booking || !worker) return sendJson(res, 404, { error: "Buchung oder Arbeiter nicht gefunden." });
    booking.assignedWorkerId = worker.id;
    booking.status = "zugewiesen";
    await writeDb(db);
    return sendJson(res, 200, booking);
  }

  const statusMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const body = await readBody(req);
    const booking = db.bookings.find((item) => item.id === statusMatch[1]);
    if (!booking) return sendJson(res, 404, { error: "Buchung nicht gefunden." });
    booking.status = body.status || booking.status;
    await writeDb(db);
    return sendJson(res, 200, booking);
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
    sendJson(res, 500, { error: "Serverfehler" });
  }
}).listen(port, () => {
  console.log(`Dienstleistungs-Projekt läuft auf http://localhost:${port}`);
  console.log(`Admin-Portal: http://localhost:${port}/admin-portal.html`);
  console.log(`Arbeiter-Portal: http://localhost:${port}/arbeiter-portal.html`);
});
