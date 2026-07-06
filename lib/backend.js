const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");
const {
  renderMailLayout,
  mailParagraph,
  mailHeading,
  mailButton,
  mailLink,
  mailInfoTable,
  mailList,
  mailListHtml,
} = require("./html-mail-template");

const root = path.dirname(__dirname);
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const mailFrom = process.env.MAIL_FROM || "Heinzelchen <noreply@heinzelchen.com>";
const emailNotificationsEnabled = process.env.ENABLE_EMAIL_NOTIFICATIONS === "true";
const mailMode = emailNotificationsEnabled && resendApiKey ? "resend" : "disabled";
const assignmentPaymentUrl = "https://book.stripe.com/8x23cu4URd0vaXRcji3Ru00";
const privacyUrl = "https://heinzelchen.com/datenschutz.html";
const agbUrl = "https://heinzelchen.com/agb.html";
const workerDocumentsBucket = process.env.SUPABASE_WORKER_DOCUMENTS_BUCKET || "worker-documents";

const workerSessions = new Map();
const workerSessionMaxAgeSeconds = 8 * 60 * 60;
const minimumWorkerAge = 18;
const minimumHourlyRate = 13.9;

function parseCookies(req) {
  return Object.fromEntries(`${req.headers.cookie || ""}`
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return [part, ""];
      return [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))];
    }));
}

function workerSessionCookie(value, maxAgeSeconds = workerSessionMaxAgeSeconds) {
  return [
    `worker_session=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function clearWorkerSessionCookie() {
  return "worker_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

function cleanupWorkerSessions() {
  const now = Date.now();
  for (const [token, session] of workerSessions.entries()) {
    if (!session || session.expiresAt <= now) workerSessions.delete(token);
  }
}

function currentWorkerSession(req) {
  cleanupWorkerSessions();
  const token = parseCookies(req).worker_session;
  if (!token) return null;
  const session = workerSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    workerSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function createWorkerSession(workerId) {
  const token = crypto.randomUUID();
  workerSessions.set(token, {
    workerId,
    expiresAt: Date.now() + workerSessionMaxAgeSeconds * 1000,
  });
  return token;
}

function protectedApiRoute(req, pathname) {
  if (pathname === "/api/vermittlung") return true;
  if (/^\/api\/bookings\/[^/]+\/assignment$/.test(pathname)) return true;
  if (/^\/api\/workers\/[^/]+\/status$/.test(pathname)) return true;
  if (pathname.startsWith("/api/worker/") && pathname !== "/api/worker/register" && pathname !== "/api/worker/login") return true;
  return false;
}

function requireWorkerSession(req, res) {
  const session = currentWorkerSession(req);
  if (session) return session;
  sendJson(res, 401, { error: "Nicht angemeldet." }, { "Set-Cookie": clearWorkerSessionCookie() });
  return null;
}

const starterDb = {
  workers: [
    {
      id: "worker-1",
      name: "Max Beispiel",
      email: "max@heinzelchen.com",
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
    console.error("SUPABASE ERROR:", detail);
    throw new Error(`Supabase ${table}: ${response.status} ${detail}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function supabaseStorageRequest(pathname, options = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase ist nicht konfiguriert.");
  const response = await fetch(`${supabaseUrl}/storage/v1${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Storage ${pathname}: ${response.status} ${detail}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function ensureWorkerDocumentsBucket() {
  if (!supabaseEnabled()) return;
  try {
    await supabaseStorageRequest(`/bucket/${encodeURIComponent(workerDocumentsBucket)}`);
  } catch {
    try {
      await supabaseStorageRequest("/bucket", {
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
          id: workerDocumentsBucket,
          name: workerDocumentsBucket,
          public: false,
          file_size_limit: 10485760,
          allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
        }),
      });
    } catch (error) {
      console.warn("Supabase worker document bucket could not be created automatically.", error.message);
    }
  }
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(`${dataUrl || ""}`);
  if (!match) return null;
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
    base64: match[2],
  };
}

function safeFileName(fileName, fallback) {
  const cleaned = `${fileName || fallback}`.normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

async function signedWorkerDocumentUrl(pathname) {
  if (!pathname || !supabaseEnabled()) return "";
  try {
    const result = await supabaseStorageRequest(`/object/sign/${encodeURIComponent(workerDocumentsBucket)}/${pathname}`, {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 14 }),
    });
    return result?.signedURL ? `${supabaseUrl}/storage/v1${result.signedURL}` : "";
  } catch (error) {
    console.warn("Could not create signed worker document URL.", error.message);
    return "";
  }
}

async function uploadWorkerDocument(worker, fieldBase, label) {
  const parsed = parseDataUrl(worker[`${fieldBase}DataUrl`]);
  const name = worker[`${fieldBase}Name`];
  if (!parsed || !name || !supabaseEnabled()) {
    return {
      label,
      name: name || "",
      type: worker[`${fieldBase}Type`] || parsed?.contentType || "",
      size: worker[`${fieldBase}Size`] || parsed?.buffer?.length || 0,
      path: "",
      signedUrl: "",
      dataUrl: worker[`${fieldBase}DataUrl`] || "",
    };
  }

  try {
    await ensureWorkerDocumentsBucket();
    const objectPath = `${worker.id}/${fieldBase}-${Date.now()}-${safeFileName(name, `${fieldBase}.jpg`)}`;
    await supabaseStorageRequest(`/object/${encodeURIComponent(workerDocumentsBucket)}/${objectPath}`, {
      method: "POST",
      contentType: parsed.contentType,
      headers: { "x-upsert": "true" },
      body: parsed.buffer,
    });

    return {
      label,
      name,
      type: worker[`${fieldBase}Type`] || parsed.contentType,
      size: worker[`${fieldBase}Size`] || parsed.buffer.length,
      bucket: workerDocumentsBucket,
      path: objectPath,
      signedUrl: await signedWorkerDocumentUrl(objectPath),
      dataUrl: worker[`${fieldBase}DataUrl`] || "",
    };
  } catch (error) {
    console.warn(`Worker document upload failed for ${label}.`, error.message);
    return {
      label,
      name,
      type: worker[`${fieldBase}Type`] || parsed.contentType,
      size: worker[`${fieldBase}Size`] || parsed.buffer.length,
      path: "",
      signedUrl: "",
      uploadError: error.message,
      dataUrl: worker[`${fieldBase}DataUrl`] || "",
    };
  }
}

async function persistWorkerDocuments(worker) {
  const documents = [
    await uploadWorkerDocument(worker, "identityDocumentFront", "Ausweis Vorderseite"),
    await uploadWorkerDocument(worker, "identityDocumentBack", "Ausweis Rückseite"),
  ];
  if (worker.childcareCertificateName || worker.childcareCertificateDataUrl) {
    documents.push(await uploadWorkerDocument(worker, "childcareCertificate", "Führungszeugnis"));
  }

  const uploadedWorker = {
    ...worker,
    documents,
    identityDocumentFrontUrl: documents.find((doc) => doc.label === "Ausweis Vorderseite")?.signedUrl || "",
    identityDocumentBackUrl: documents.find((doc) => doc.label === "Ausweis Rückseite")?.signedUrl || "",
    childcareCertificateUrl: documents.find((doc) => doc.label === "Führungszeugnis")?.signedUrl || "",
  };

  uploadedWorker.identityDocumentFrontDataUrl = "";
  uploadedWorker.identityDocumentBackDataUrl = "";
  uploadedWorker.childcareCertificateDataUrl = "";
  return uploadedWorker;
}

const rowToData = (row) => row?.raw_payload || row?.data || row;

function radiusToInteger(radiusKm) {
  const match = `${radiusKm || ""}`.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function durationToFloat(raw) {
  if (!raw) return null;
  const str = String(raw).replace(",", ".").replace("h", "").trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function extractServiceDurations(availability) {
  if (!availability || !Array.isArray(availability.serviceAppointments)) return [];
  return availability.serviceAppointments.map((appt) => ({
    service: appt.service || "",
    duration: durationToFloat(appt.duration),
    frequency: appt.frequency || "",
  }));
}

function bookingToRow(booking) {
  return {
    status: booking.status,
    assigned_worker_id: booking.assignedWorkerId,
    first_name: booking.customer?.firstName || "",
    last_name: booking.customer?.lastName || "",
    email: booking.customer?.email || "",
    phone: booking.customer?.phone || "",
    street: booking.customer?.street || "",
    zip: booking.customer?.zip || "",
    city: booking.customer?.city || "",
    name: booking.name || "",
    address: booking.address || "",
    contact: booking.contact || "",
    services: Array.isArray(booking.services) ? booking.services : [],
    services_summary: Array.isArray(booking.availability?.serviceAppointments)
      ? booking.availability.serviceAppointments
          .map((a) => {
            const windows = Array.isArray(a.windows)
              ? a.windows.map((w) => {
                  const times = Array.isArray(w.times)
                    ? w.times.map((t) => `${t.from}–${t.to}`).join(", ")
                    : "";
                  return `${w.date}: ${times}`;
                }).join(" | ")
              : "";
            return `${a.service} – ${a.duration || "?"} – ${a.frequency || ""} – ${windows}`;
          })
          .join(" / ")
      : "",
    contact_summary: [
      `${booking.customer?.firstName || ""} ${booking.customer?.lastName || ""}`.trim(),
      booking.customer?.phone || "",
      booking.customer?.email || "",
      [booking.customer?.street, booking.customer?.zip, booking.customer?.city]
        .filter(Boolean).join(", "),
    ].filter(Boolean).join(" | "),
    date: booking.appointment?.date || null,
    time: booking.appointment?.time || "",
    frequency: booking.frequency || "",
    duration: durationToFloat(booking.duration),
    service_durations: extractServiceDurations(booking.availability),
    extra_task: booking.extraTask || "",
    location_notes: booking.locationNotes || "",
    availability: booking.availability || {},
    detail_notes: booking.detailNotes || {},
    raw_payload: booking,
    created_at: new Date().toISOString(),
  };
}

function legacyBookingToRow(booking) {
  return {
    id: booking.id,
    status: booking.status,
    assigned_worker_id: booking.assignedWorkerId,
    appointment_date: booking.appointment?.date || null,
    city: booking.customer?.city || "",
    name: booking.name || "",
    address: booking.address || "",
    contact: booking.contact || "",
    extra_task: booking.extraTask || "",
    location_notes: booking.locationNotes || "",
    availability: booking.availability || {},
    detail_notes: booking.detailNotes || {},
    first_name: booking.customer?.firstName || "",
    last_name: booking.customer?.lastName || "",
    email: booking.customer?.email || "",
    phone: booking.customer?.phone || "",
    street: booking.customer?.street || "",
    zip: booking.customer?.zip || "",
    services: Array.isArray(booking.services) ? booking.services : [],
    date: booking.appointment?.date || null,
    time: booking.appointment?.time || "",
    frequency: booking.frequency || "",
    duration: durationToFloat(booking.duration),
    created_at: booking.createdAt,
    data: booking,
  };
}

function workerToRow(worker) {
  return {
    id: worker.id,
    status: worker.status || "neu",
    first_name: worker.firstName || "",
    last_name: worker.lastName || "",
    email: worker.email || "",
    phone: worker.phone || "",
    street: worker.street || "",
    zip: worker.zip || "",
    city: worker.city || "",
    birthdate: worker.birthdate || null,
    service_area: worker.serviceArea || worker.city || "",
    radius_km: radiusToInteger(worker.radiusKm),
    local_areas: Array.isArray(worker.localAreas) ? worker.localAreas : [],
    area_notes: worker.areaNotes || "",
    lead_time: worker.leadTime || "",
    skills: Array.isArray(worker.skills) ? worker.skills : [],
    extra_skills: worker.extraSkills || "",
    service_details: Array.isArray(worker.serviceDetails) ? worker.serviceDetails : [],
    childcare_certificate_name: worker.childcareCertificateName || "",
    qualification_confirmed: worker.qualificationConfirmed === true,
    adult_self_employed_confirmed: worker.adultSelfEmployedConfirmed === true,
    terms_accepted: worker.termsAccepted === true,
    privacy_accepted: worker.privacyAccepted === true,
    registration_type: worker.registrationType || "",
    raw_payload: worker,
    created_at: new Date().toISOString(),
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
  console.error("SUPABASE DEBUG:", supabaseUrl, supabaseKey ? "KEY OK" : "KEY FEHLT");
  const [row] = await supabaseRequest("bookings", {
    method: "POST",
    prefer: "return=representation",
    body: bookingToRow(booking),
  });
  console.log("SUPABASE RESPONSE:", JSON.stringify(row));
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
  let row;
  try {
    [row] = await supabaseRequest("bookings", {
      method: "PATCH",
      query: `id=eq.${encodeURIComponent(booking.id)}`,
      prefer: "return=representation",
      body: bookingToRow(booking),
    });
  } catch (error) {
    console.warn("Supabase bookings update failed with current schema, retrying legacy row shape.", error.message);
    [row] = await supabaseRequest("bookings", {
      method: "PATCH",
      query: `id=eq.${encodeURIComponent(booking.id)}`,
      prefer: "return=representation",
      body: legacyBookingToRow(booking),
    });
  }
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
  const customer = {
    firstName: body.firstName || "",
    lastName: body.lastName || "",
    street: body.street || "",
    zip: body.zip || "",
    city: body.city || "",
    phone: body.phone || "",
    email: body.email || "",
  };
  return {
    id: crypto.randomUUID(),
    status: "Neu",
    createdAt: new Date().toISOString(),
    services: Array.isArray(body.services) ? body.services : [],
    extraTask: body.extraTask || "",
    locationNotes: body.locationNotes || "",
    availability: body.availability && typeof body.availability === "object" ? body.availability : {},
    detailNotes: body.detailNotes && typeof body.detailNotes === "object" ? body.detailNotes : {},
    name: body.name || `${customer.firstName} ${customer.lastName}`.trim(),
    address: body.address || [customer.city, customer.street, customer.zip].filter(Boolean).join(", "),
    contact: body.contact || [customer.email, customer.phone].filter(Boolean).join(", "),
    duration: body.duration || "",
    frequency: body.frequency || "",
    customer,
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
    id: crypto.randomUUID(),
    name: body.name || "",
    firstName: body.firstName || "",
    lastName: body.lastName || "",
    email: body.email || "",
    phone: body.phone || "",
    street: body.street || "",
    zip: body.zip || "",
    city: body.city || "",
    birthdate: body.birthdate || "",
    serviceArea: body.serviceArea || body.city || "",
    radiusKm: body.radiusKm || "",
    leadTime: body.leadTime || "",
    skills: Array.isArray(body.skills) ? body.skills : [],
    serviceDetails: Array.isArray(body.serviceDetails) ? body.serviceDetails : [],
    extraSkills: body.extraSkills || "",
    localAreas: Array.isArray(body.localAreas) ? body.localAreas : [],
    areaNotes: body.areaNotes || "",
    qualificationConfirmed: body.qualificationConfirmed === true,
    adultSelfEmployedConfirmed: body.adultSelfEmployedConfirmed === true,
    termsAccepted: body.termsAccepted === true,
    privacyAccepted: body.privacyAccepted === true,
    identityNotes: body.identityNotes || "",
    identityDocumentName: body.identityDocumentName || "",
    identityDocumentFrontName: body.identityDocumentFrontName || "",
    identityDocumentFrontType: body.identityDocumentFrontType || "",
    identityDocumentFrontSize: body.identityDocumentFrontSize || 0,
    identityDocumentFrontDataUrl: body.identityDocumentFrontDataUrl || "",
    identityDocumentBackName: body.identityDocumentBackName || "",
    identityDocumentBackType: body.identityDocumentBackType || "",
    identityDocumentBackSize: body.identityDocumentBackSize || 0,
    identityDocumentBackDataUrl: body.identityDocumentBackDataUrl || "",
    childcareCertificateName: body.childcareCertificateName || "",
    childcareCertificateType: body.childcareCertificateType || "",
    childcareCertificateSize: body.childcareCertificateSize || 0,
    childcareCertificateDataUrl: body.childcareCertificateDataUrl || "",
    registrationType: body.registrationType || "",
    availability,
    active: true,
  };
}

function minimumBirthdateIso() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - minimumWorkerAge);
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
}

function normalizeBirthdate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(`${value || ""}`.trim());
  if (!match) return "";
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function validateWorkerBirthdate(value) {
  const birthdate = normalizeBirthdate(value);
  if (!birthdate) {
    return { error: "Bitte geben Sie ein gültiges Geburtsdatum an." };
  }
  if (birthdate > minimumBirthdateIso()) {
    return { error: "Eine Registrierung als Heinzelchen ist erst ab 18 Jahren möglich." };
  }
  return { birthdate };
}

function validateWorkerHourlyRates(serviceDetails) {
  const details = Array.isArray(serviceDetails) ? serviceDetails : [];
  const hasTooLowRate = details.some((detail) => Number(detail?.hourlyRate) < minimumHourlyRate);
  if (hasTooLowRate) {
    return { error: "Der Stundenpreis muss mindestens 13,90 EUR betragen." };
  }
  return {};
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

function firstNameFromWorker(worker) {
  return worker.firstName || `${worker.name || ""}`.trim().split(/\s+/).filter(Boolean)[0] || "Ihr Heinzelchen";
}

function lastNameForCustomer(booking) {
  return booking.customer?.lastName || `${booking.name || ""}`.trim().split(/\s+/).filter(Boolean).slice(-1)[0] || "";
}

function assignmentGreeting(booking) {
  const lastName = lastNameForCustomer(booking);
  return lastName ? `Sehr geehrte Frau / sehr geehrter Herr ${escapeHtml(lastName)},` : "Sehr geehrte Damen und Herren,";
}

function serviceHourlyRate(worker, booking) {
  const details = Array.isArray(worker.serviceDetails) ? worker.serviceDetails : [];
  const bookingServices = Array.isArray(booking.services) ? booking.services : [];
  const matchingDetail = details.find((detail) => bookingServices.includes(detail.service)) || details[0];
  const rate = matchingDetail?.hourlyRate;
  return rate ? `${escapeHtml(rate)} EUR` : "den vereinbarten Stundenlohn";
}

function assignmentDate(booking, override = {}) {
  return override.date || booking.appointment?.date || "dem vereinbarten Termin";
}

function assignmentTime(booking, override = {}) {
  return override.time || booking.appointment?.time || "der vereinbarten Uhrzeit";
}

function escapeHtml(value) {
  return `${value || ""}`.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function certificatePreviewHtml(worker) {
  const certificate = (worker.documents || []).find((doc) => doc.label === "Führungszeugnis");
  const imageSrc = certificate?.signedUrl || certificate?.dataUrl || worker.childcareCertificateDataUrl || "";
  if (!imageSrc || !(certificate?.type || worker.childcareCertificateType || "").startsWith("image/")) return "";
  const size = Number(certificate?.size || worker.childcareCertificateSize);
  const sizeText = size ? ` (${Math.round(size / 1024)} KB)` : "";
  return `
    ${mailHeading("Führungszeugnis")}
    ${mailParagraph(`Datei: ${escapeHtml(certificate?.name || worker.childcareCertificateName) || "-"}${sizeText}${certificate?.signedUrl ? `<br>${mailLink(certificate.signedUrl, "Führungszeugnis öffnen")}` : ""}`)}
    <img src="${imageSrc}" alt="Führungszeugnis" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid rgba(85,120,168,.22);border-radius:12px;margin:8px 0 16px;">
  `;
}

function workerDocumentsHtml(worker) {
  const documents = Array.isArray(worker.documents) ? worker.documents : [];
  if (!documents.length) return "";
  return `${mailHeading("Dokumente")}
    ${mailInfoTable(documents.map((doc) => [
      escapeHtml(doc.label),
      [
        escapeHtml(doc.name) || "-",
        doc.path ? `<br>Pfad: ${escapeHtml(`${doc.bucket || workerDocumentsBucket}/${doc.path}`)}` : "",
        doc.signedUrl ? `<br>${mailLink(doc.signedUrl, "Datei öffnen")}` : "",
        doc.uploadError ? `<br>Upload-Hinweis: ${escapeHtml(doc.uploadError)}` : "",
      ].join(""),
    ]))}`;
}

async function sendEmail({ to, subject, html }) {
  if (!to) return { skipped: true, reason: "Keine Empfängeradresse" };
  if (!emailNotificationsEnabled) {
    console.log("[Mail deaktiviert]", { to, subject });
    return { skipped: true, reason: "E-Mail-Versand deaktiviert" };
  }
  if (!resendApiKey) {
    console.log("[Mail-Vorschau]", { to, subject, html });
    return { preview: true };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "heinzelchen/1.0",
    },
    body: JSON.stringify({ from: mailFrom, to, subject, html }),
  });
  if (!response.ok) throw new Error(`Resend: ${response.status} ${await response.text()}`);
  return response.json();
}

async function runEmailTask(label, task) {
  if (!emailNotificationsEnabled) {
    console.log(`[Mail deaktiviert] ${label}`);
    return { skipped: true, reason: "E-Mail-Versand deaktiviert" };
  }
  try {
    return await task();
  } catch (error) {
    console.error(`[Mail Fehler ignoriert] ${label}:`, error);
    return { skipped: true, reason: error.message };
  }
}

async function sendBookingRequestEmail(booking) {
  const schedules = Array.isArray(booking.availability?.serviceAppointments)
    ? booking.availability.serviceAppointments
    : [];
  const scheduleHtml = schedules.length
    ? schedules.map((schedule) => `
      <li>
        <strong>${escapeHtml(schedule.service)}</strong><br>
        Dauer: ${escapeHtml(schedule.duration) || "-"}<br>
        Häufigkeit: ${escapeHtml(schedule.frequency) || "-"}<br>
        Zeitfenster:
        <ul>
          ${(Array.isArray(schedule.windows) ? schedule.windows : []).map((window) =>
            `<li>${escapeHtml(window.date) || "-"} von ${escapeHtml(window.from) || "-"} bis ${escapeHtml(window.to) || "-"}</li>`
          ).join("") || "<li>-</li>"}
        </ul>
      </li>
    `).join("")
    : `<li>${escapeHtml(booking.appointment?.date)} ${escapeHtml(booking.appointment?.time)}</li>`;

  await sendEmail({
    to: "info@heinzelchen.com",
    subject: `Neue Buchungsanfrage: ${booking.services.join(", ") || "Alltagshilfe"}`,
    html: renderMailLayout({
      title: "Neue Buchungsanfrage",
      preheader: "Eine neue Buchungsanfrage ist eingegangen.",
      children: `
        ${mailHeading("Was")}
        ${mailInfoTable([
          ["Dienstleistungen", escapeHtml(booking.services.join(", ")) || "-"],
          ["Details", escapeHtml(booking.extraTask || "-").replace(/\n/g, "<br>")],
        ])}
        ${mailHeading("Wann und wie lange")}
        ${mailListHtml(scheduleHtml)}
        ${mailHeading("Wo")}
        ${mailInfoTable([
          ["Adresse", escapeHtml(formatAddress(booking.customer)) || "-"],
          ["Hinweise", escapeHtml(booking.locationNotes) || "-"],
        ])}
        ${mailHeading("Wer")}
        ${mailInfoTable([
          ["Name", escapeHtml(customerName(booking))],
          ["E-Mail", escapeHtml(booking.customer.email) || "-"],
          ["Telefon", escapeHtml(booking.customer.phone) || "-"],
        ])}
      `,
    }),
  });
}

async function sendWorkerRegistrationEmail(worker) {
  const servicesHtml = Array.isArray(worker.serviceDetails) && worker.serviceDetails.length
    ? worker.serviceDetails.map((detail) => `
      <li>
        <strong>${escapeHtml(detail.service)}</strong><br>
        Stundenpreis: ${escapeHtml(detail.hourlyRate) || "-"} EUR / Stunde<br>
        ${Array.isArray(detail.tutoringByGrade) && detail.tutoringByGrade.length ? `Klassen & Fächer:<ul>${detail.tutoringByGrade.map((item) => `<li>${escapeHtml(item.grade)}: ${escapeHtml((item.subjects || []).join(", ")) || "-"}</li>`).join("")}</ul>` : ""}
        ${detail.childcareCertificateName ? `Erweitertes Führungszeugnis: ${escapeHtml(detail.childcareCertificateName)}<br>` : ""}
      </li>
    `).join("")
    : `<li>${escapeHtml((worker.skills || []).join(", ")) || "-"}</li>`;
  const availabilityHtml = Object.entries(worker.availability || {}).map(([day, windows]) =>
    `<li>${escapeHtml(day)}: ${escapeHtml(Array.isArray(windows) ? windows.join(", ") : windows)}</li>`
  ).join("") || "<li>-</li>";

  await sendEmail({
    to: "info@heinzelchen.com",
    subject: `Neue Heinzelchen-Registrierung: ${escapeHtml(worker.name) || "ohne Namen"}`,
    html: renderMailLayout({
      title: "Neue Heinzelchen-Registrierung",
      preheader: "Eine neue Heinzelchen-Registrierung ist eingegangen.",
      children: `
        ${mailHeading("Wer")}
        ${mailInfoTable([
          ["Name", escapeHtml(worker.name) || "-"],
          ["E-Mail", escapeHtml(worker.email) || "-"],
          ["Telefon", escapeHtml(worker.phone) || "-"],
          ["Geburtsdatum", escapeHtml(worker.birthdate) || "-"],
          ["Adresse", escapeHtml([worker.street, worker.zip, worker.city].filter(Boolean).join(", ")) || "-"],
        ])}
        ${workerDocumentsHtml(worker)}
        ${certificatePreviewHtml(worker)}
        ${mailHeading("Dienstleistungen")}
        ${mailListHtml(servicesHtml)}
        ${mailParagraph(`<strong>Sonstiges:</strong><br>${escapeHtml(worker.extraSkills || "-").replace(/\n/g, "<br>")}`)}
        ${mailHeading("Verfügbarkeit und Einsatzgebiet")}
        ${mailInfoTable([
          ["Umkreis", escapeHtml(worker.radiusKm) || "-"],
          ["Stadtteile", escapeHtml((worker.localAreas || []).join(", ")) || "-"],
          ["Hinweise", escapeHtml(worker.areaNotes) || "-"],
        ])}
        ${mailListHtml(availabilityHtml)}
        ${mailHeading("Bestätigungen")}
        ${mailInfoTable([
          ["Volljährig/selbstständig/Haftpflicht", worker.adultSelfEmployedConfirmed ? "Ja" : "Nein"],
          ["Nutzungsbedingungen", worker.termsAccepted ? "Ja" : "Nein"],
          ["Datenschutz", worker.privacyAccepted ? "Ja" : "Nein"],
        ])}
      `,
    }),
  });
}

async function sendAssignmentEmails(booking, worker) {
  const customerSubject = `Ihr Heinzelchen ist gefunden - Auftrag bestätigen`;
  const workerFirstName = firstNameFromWorker(worker);
  const date = assignmentDate(booking);
  const time = assignmentTime(booking);
  const hourlyRate = serviceHourlyRate(worker, booking);

  await Promise.all([
    sendEmail({
      to: worker.email,
      subject: `Neuer Auftrag: ${booking.services.join(", ") || "Alltagshilfe"}`,
      html: renderMailLayout({
        title: "Neuer Auftrag für dich",
        preheader: "Ein neuer Auftrag wartet auf dich.",
        children: `
          ${mailParagraph("Wir haben einen passenden Auftrag für dich gefunden. Bitte prüfe die Angaben und melde dich bei uns, falls etwas nicht passt.")}
          ${mailInfoTable([
            ["Kunde", escapeHtml(customerName(booking))],
            ["Leistung", escapeHtml(booking.services.join(", ") || booking.extraTask || "Freie Aufgabe")],
            ["Termin", `${escapeHtml(booking.appointment.date || "-")} um ${escapeHtml(booking.appointment.time || "-")} Uhr`],
            ["Adresse", escapeHtml(formatAddress(booking.customer)) || "-"],
            ["Dauer", escapeHtml(booking.duration) || "-"],
          ])}
        `,
      }),
    }),
    sendEmail({
      to: booking.customer.email,
      subject: customerSubject,
      html: renderMailLayout({
        title: "Ihr Heinzelchen ist gefunden",
        preheader: "Bestätigen Sie Ihren Auftrag mit der Vermittlungsgebühr.",
        children: `
          ${mailParagraph(assignmentGreeting(booking))}
          ${mailParagraph(`wir haben ein Heinzelchen für Sie gefunden. ${escapeHtml(workerFirstName)} kann am ${escapeHtml(date)} um ${escapeHtml(time)} zu Ihnen kommen und verlangt ${hourlyRate} pro Stunde.`)}
          ${mailParagraph("Wissen Sie Ihre Aufgabe in guten Händen und bestätigen Sie Ihren Auftrag mit der Zahlung der Vermittlungsgebühr.")}
          ${mailButton({ href: assignmentPaymentUrl, label: "Jetzt 3 € zahlen und Auftrag bestätigen" })}
          ${mailParagraph("Wir freuen uns sehr über Ihre Buchung und die Gelegenheit, Ihnen den Alltag leichter zu machen.")}
          ${mailParagraph("Herzliche Grüße<br>Ihre Heinzelchen")}
          ${mailParagraph(`Mail: ${mailLink("mailto:info@heinzelchen.com", "info@heinzelchen.com")}<br>Telefon: ${mailLink("tel:+491742997866", "0174 2997866")}`)}
          ${mailHeading("Stornierung")}
          ${mailParagraph(`Die Vermittlungsgebühr von 3,00 EUR ist nach Zahlung nicht erstattbar. Möchten Sie umbuchen oder einen anderen Termin vereinbaren, wenden Sie sich direkt an uns oder stellen Sie eine neue Buchungsanfrage über ${mailLink("https://heinzelchen.com", "heinzelchen.com")}. Bei Nichterscheinen Ihres Heinzelchens erstatten wir die Vermittlungsgebühr auf Anfrage kulanzweise zurück.`)}
          ${mailParagraph(`${mailLink(agbUrl, "AGB")}<br>${mailLink(privacyUrl, "Datenschutzerklärung")}`)}
        `,
      }),
    }),
  ]);
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/worker/logout") {
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearWorkerSessionCookie() });
  }

  if (req.method === "POST" && url.pathname === "/api/worker/login") {
    const body = await readBody(req);
    const db = await readDb();
    const worker = db.workers.find((item) => `${item.email || ""}`.toLowerCase() === `${body.email || ""}`.toLowerCase());
    if (!worker) return sendJson(res, 401, { error: "Login fehlgeschlagen." });
    if (!worker.passwordHash) {
      return sendJson(res, 501, { error: "Worker-Login benötigt noch eine sichere Passwortprüfung." });
    }
    return sendJson(res, 501, { error: "Worker-Login benötigt noch eine sichere Passwortprüfung." });
  }

  const session = protectedApiRoute(req, url.pathname) ? requireWorkerSession(req, res) : null;
  if (protectedApiRoute(req, url.pathname) && !session) return;

  const db = await readDb();

  if (req.method === "GET" && url.pathname === "/api/worker/session") {
    const worker = db.workers.find((item) => item.id === session.workerId);
    if (!worker) return sendJson(res, 404, { error: "Heinzelchen nicht gefunden." }, { "Set-Cookie": clearWorkerSessionCookie() });
    return sendJson(res, 200, { worker });
  }

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
    const updatedBooking = await updateBooking(booking);
    await runEmailTask("Zuweisung", () => sendAssignmentEmails(updatedBooking, worker));
    return sendJson(res, 200, { booking: updatedBooking });
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
    await runEmailTask("Buchungsanfrage", () => sendBookingRequestEmail(saved));
    if (worker) await runEmailTask("Zuweisung", () => sendAssignmentEmails(saved, worker));
    return sendJson(res, 201, {
      booking: saved,
      assignedWorker: worker || null,
      matchingWorkers: findAvailableWorkers({ ...db, bookings: [saved, ...db.bookings] }, saved),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/workers") {
    const body = await readBody(req);
    const birthdateValidation = validateWorkerBirthdate(body.birthdate);
    if (birthdateValidation.error) return sendJson(res, 400, { error: birthdateValidation.error });
    const hourlyRateValidation = validateWorkerHourlyRates(body.serviceDetails);
    if (hourlyRateValidation.error) return sendJson(res, 400, { error: hourlyRateValidation.error });
    body.birthdate = birthdateValidation.birthdate;
    const normalizedWorker = normalizeWorker(body);
    const workerWithDocuments = await persistWorkerDocuments(normalizedWorker);
    const worker = await insertWorker(workerWithDocuments);
    await runEmailTask("Heinzelchen-Registrierung", () => sendWorkerRegistrationEmail(worker));
    return sendJson(res, 201, worker);
  }

  return sendJson(res, 404, { error: "API-Endpunkt nicht gefunden." });
}

module.exports = {
  handleApi,
};
