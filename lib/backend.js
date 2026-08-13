const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");
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
const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST;
const smtpPort = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || "587");
const smtpUser = process.env.SMTP_USER || process.env.MAIL_USER;
const smtpPass = process.env.SMTP_PASS || process.env.MAIL_PASS;
const smtpSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : smtpPort === 465;
const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);
const mailMode = emailNotificationsEnabled
  ? (smtpConfigured ? "smtp" : (resendApiKey ? "resend" : "preview"))
  : "disabled";
const assignmentPaymentUrl = "https://book.stripe.com/8x23cu4URd0vaXRcji3Ru00";
const privacyUrl = "https://heinzelchen.com/datenschutz.html";
const agbUrl = "https://heinzelchen.com/agb.html";
const workerDocumentsBucket = process.env.SUPABASE_WORKER_DOCUMENTS_BUCKET || "worker-documents";

const workerSessions = new Map();
const workerSessionMaxAgeSeconds = 8 * 60 * 60;
const minimumWorkerAge = 18;
const minimumHourlyRate = 13.9;
let smtpTransporter;

function getSmtpTransporter() {
  if (!smtpConfigured) return null;
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }
  return smtpTransporter;
}

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

function childcareCertificateAttachment(worker) {
  const certificate = (worker.documents || []).find((doc) => doc.label === "Führungszeugnis");
  const dataUrl = certificate?.dataUrl || worker.childcareCertificateDataUrl || "";
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const contentType = certificate?.type || worker.childcareCertificateType || parsed.contentType;
  const fileName = safeFileName(certificate?.name || worker.childcareCertificateName, "fuehrungszeugnis");
  return {
    filename: fileName,
    content: parsed.buffer,
    contentType,
    cid: contentType.startsWith("image/") ? "childcare-certificate@heinzelchen" : undefined,
  };
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
  const uploadedWorker = {
    ...worker,
    documents: [],
    serviceDetails: Array.isArray(worker.serviceDetails)
      ? worker.serviceDetails.map((detail) => detail.service === "Kinderbetreuung"
        ? { ...detail, childcareCertificateName: "" }
        : detail)
      : [],
    childcareCertificateName: "",
    childcareCertificateType: "",
    childcareCertificateSize: 0,
    childcareCertificateUrl: "",
  };

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

function formatDateWindow(window) {
  const date = window?.date || "";
  const dateEnd = window?.dateEnd || "";
  if (date && dateEnd && dateEnd !== date) return `${date} bis ${dateEnd}`;
  return date || dateEnd || "";
}

function formatTimeWindows(times) {
  return Array.isArray(times)
    ? times
        .map((time) => [time?.from || "", time?.to || ""].filter(Boolean).join("-"))
        .filter(Boolean)
        .join(", ")
    : "";
}

function serviceAppointmentSummaries(availability) {
  const appointments = Array.isArray(availability?.serviceAppointments)
    ? availability.serviceAppointments
    : [];

  return appointments
    .map((appointment) => {
      const windows = Array.isArray(appointment.windows)
        ? appointment.windows.map((window) => {
            const dateWindow = formatDateWindow(window);
            const times = formatTimeWindows(window.times);
            return [dateWindow, times].filter(Boolean).join(": ");
          }).filter(Boolean).join(" | ")
        : "";

      return {
        service: appointment.service || "",
        duration: appointment.duration || "?",
        frequency: appointment.frequency || "",
        windows,
      };
    })
    .filter((summary) => summary.service || summary.windows);
}

function servicesSummaryText(booking) {
  const summaries = serviceAppointmentSummaries(booking.availability);
  return summaries.length
    ? summaries
        .map((summary) => `${summary.service} – ${summary.duration} – ${summary.frequency} – ${summary.windows}`)
        .join(" / ")
    : "";
}

function scheduleSummaryText(booking) {
  const summaries = serviceAppointmentSummaries(booking.availability);
  if (!summaries.length) return `${booking.appointment?.date || ""} ${booking.appointment?.time || ""}`.trim();
  return summaries
    .map((summary) => [summary.service, summary.windows].filter(Boolean).join(" - "))
    .filter(Boolean)
    .join("\n");
}

function firstScheduleDate(availability) {
  const appointments = Array.isArray(availability?.serviceAppointments)
    ? availability.serviceAppointments
    : [];
  const firstWindow = appointments
    .flatMap((appointment) => Array.isArray(appointment.windows) ? appointment.windows : [])
    .find((window) => window?.date || window?.dateEnd);
  return firstWindow?.date || firstWindow?.dateEnd || "";
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
    services_summary: servicesSummaryText(booking),
    contact_summary: [
      `${booking.customer?.firstName || ""} ${booking.customer?.lastName || ""}`.trim(),
      booking.customer?.phone || "",
      booking.customer?.email || "",
      [booking.customer?.street, booking.customer?.zip, booking.customer?.city]
        .filter(Boolean).join(", "),
    ].filter(Boolean).join(" | "),
    date: firstScheduleDate(booking.availability) || booking.appointment?.date || null,
    time: scheduleSummaryText(booking) || booking.appointment?.time || "",
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
    date: firstScheduleDate(booking.availability) || booking.appointment?.date || null,
    time: scheduleSummaryText(booking) || booking.appointment?.time || "",
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
  const availability = body.availability && typeof body.availability === "object" ? body.availability : {};
  const scheduleBooking = { availability, appointment: { date: body.date || "", time: body.time || "" } };
  return {
    id: crypto.randomUUID(),
    status: "Neu",
    createdAt: new Date().toISOString(),
    services: Array.isArray(body.services) ? body.services : [],
    extraTask: body.extraTask || "",
    locationNotes: body.locationNotes || "",
    availability,
    detailNotes: body.detailNotes && typeof body.detailNotes === "object" ? body.detailNotes : {},
    name: body.name || `${customer.firstName} ${customer.lastName}`.trim(),
    address: body.address || [customer.city, customer.street, customer.zip].filter(Boolean).join(", "),
    contact: body.contact || [customer.email, customer.phone].filter(Boolean).join(", "),
    duration: body.duration || "",
    frequency: body.frequency || "",
    customer,
    appointment: {
      date: firstScheduleDate(availability) || body.date || "",
      time: scheduleSummaryText(scheduleBooking) || body.time || "",
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
  return rate ? `${escapeHtml(rate)} €` : "den vereinbarten Stundenlohn";
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

function bookingServiceLabel(booking) {
  return Array.isArray(booking.services) && booking.services.length
    ? booking.services.join(", ")
    : "Alltagshilfe";
}

function bookingTaskDetailsText(booking) {
  const details = booking.detailNotes || {};
  const labels = {
    garden: "Gartenarbeit",
    cleaning: "Reinigung",
    laundry: "Bügeln/Wäsche",
    tutoring: "Nachhilfe",
    care: "Betreuung",
    build: "Aufbau/Montage",
    painting: "Malerarbeiten",
    other: "Sonstiges",
  };
  const rows = Object.entries(labels).flatMap(([key, label]) => {
    const detail = details[key];
    if (!detail || typeof detail !== "object") return [];
    const parts = [
      Array.isArray(detail.tasks) && detail.tasks.length ? `Aufgaben: ${detail.tasks.join(", ")}` : "",
      detail.size ? `Größe/Fläche: ${detail.size}` : "",
      detail.custom ? `Freitext: ${detail.custom}` : "",
      detail.materialEquipment ? `Material/Equipment: ${detail.materialEquipment}` : "",
      Array.isArray(detail.requests) && detail.requests.length ? `Anfragen: ${detail.requests.join(", ")}` : "",
    ].filter(Boolean);
    return parts.length ? [`${label}: ${parts.join("; ")}`] : [];
  });
  return rows.length ? rows.join("\n") : booking.extraTask || "-";
}

function bookingScheduleText(booking) {
  return scheduleSummaryText(booking) || "-";
}

function bookingDurationText(booking) {
  const schedules = Array.isArray(booking.availability?.serviceAppointments)
    ? booking.availability.serviceAppointments
    : [];
  if (schedules.length) {
    return schedules.map((schedule) => [schedule.service, schedule.duration].filter(Boolean).join(": ")).join("\n");
  }
  return booking.duration || "-";
}

function bookingFrequencyText(booking) {
  const schedules = Array.isArray(booking.availability?.serviceAppointments)
    ? booking.availability.serviceAppointments
    : [];
  if (schedules.length) {
    return schedules.map((schedule) => [schedule.service, schedule.frequency].filter(Boolean).join(": ")).join("\n");
  }
  return booking.frequency || "-";
}

function certificatePreviewHtml(worker) {
  const certificate = (worker.documents || []).find((doc) => doc.label === "Führungszeugnis");
  const attachment = childcareCertificateAttachment(worker);
  const contentType = attachment?.contentType || certificate?.type || worker.childcareCertificateType || "";
  if (!attachment && !certificate?.signedUrl) return "";
  const size = Number(certificate?.size || worker.childcareCertificateSize);
  const sizeText = size ? ` (${Math.round(size / 1024)} KB)` : "";
  const imageSrc = attachment?.cid ? "cid:childcare-certificate@heinzelchen" : certificate?.signedUrl;
  const preview = contentType.startsWith("image/") && imageSrc
    ? `<img src="${imageSrc}" alt="Führungszeugnis" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid rgba(85,120,168,.22);border-radius:12px;margin:8px 0 16px;">`
    : mailParagraph("Das Führungszeugnis ist als Anhang beigefügt.");
  return `
    ${mailHeading("Führungszeugnis")}
    ${mailParagraph(`Datei: ${escapeHtml(certificate?.name || worker.childcareCertificateName) || "-"}${sizeText}${certificate?.signedUrl ? `<br>${mailLink(certificate.signedUrl, "Führungszeugnis öffnen")}` : ""}`)}
    ${preview}
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

async function sendEmail({ to, subject, html, attachments }) {
  if (!to) return { skipped: true, reason: "Keine Empfängeradresse" };
  if (!emailNotificationsEnabled) {
    console.log("[Mail deaktiviert]", { to, subject });
    return { skipped: true, reason: "E-Mail-Versand deaktiviert" };
  }

  const transporter = getSmtpTransporter();
  if (transporter) {
    return transporter.sendMail({
      from: mailFrom,
      to,
      subject,
      html,
      attachments,
    });
  }

  if (resendApiKey) {
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

  if (!smtpConfigured) {
    console.log("[Mail-Vorschau]", { to, subject, html });
    return { preview: true, reason: "SMTP/Resend nicht konfiguriert" };
  }

  return { skipped: true, reason: "Keine nutzbare Mail-Konfiguration" };
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
  await sendEmail({
    to: "info@heinzelchen.com",
    subject: `Neue Buchungsanfrage: ${bookingServiceLabel(booking)}`,
    html: renderMailLayout({
      title: "Neue Buchungsanfrage",
      preheader: "Eine neue Buchungsanfrage ist eingegangen.",
      children: `
        ${mailHeading("1. Auftragsnummer")}
        ${mailInfoTable([
          ["Auftragsnummer", escapeHtml(booking.auftragsnummer || booking.id || "-")],
        ])}
        ${mailHeading("2. Name")}
        ${mailInfoTable([
          ["Name", escapeHtml(customerName(booking))],
        ])}
        ${mailHeading("3. E-Mail")}
        ${mailInfoTable([
          ["E-Mail", escapeHtml(booking.customer.email) || "-"],
        ])}
        ${mailHeading("4. Telefon")}
        ${mailInfoTable([
          ["Telefon", escapeHtml(booking.customer.phone) || "-"],
        ])}
        ${mailHeading("5. Adresse")}
        ${mailInfoTable([
          ["Adresse", escapeHtml(formatAddress(booking.customer)) || "-"],
        ])}
        ${mailHeading("6. Dienstleistung")}
        ${mailInfoTable([
          ["Dienstleistung", escapeHtml(bookingServiceLabel(booking))],
        ])}
        ${mailHeading("7. Aufgabendetails")}
        ${mailInfoTable([
          ["Details", escapeHtml(bookingTaskDetailsText(booking)).replace(/\n/g, "<br>")],
        ])}
        ${mailHeading("8. Geschätzte Dauer")}
        ${mailInfoTable([
          ["Dauer", escapeHtml(bookingDurationText(booking)).replace(/\n/g, "<br>")],
        ])}
        ${mailHeading("9. Datum / Zeitfenster")}
        ${mailInfoTable([
          ["Zeitfenster", escapeHtml(bookingScheduleText(booking)).replace(/\n/g, "<br>")],
        ])}
        ${mailHeading("10. Häufigkeit")}
        ${mailInfoTable([
          ["Häufigkeit", escapeHtml(bookingFrequencyText(booking)).replace(/\n/g, "<br>")],
        ])}
        ${mailHeading("11. Zusätzliche Hinweise")}
        ${mailInfoTable([
          ["Hinweise", escapeHtml(booking.locationNotes || "-")],
          ["Zusatzaufgaben", escapeHtml(booking.extraTask || "-")],
        ])}
        ${mailHeading("12. Status / Zuweisung")}
        ${mailInfoTable([
          ["Status", escapeHtml(booking.status || "-")],
          ["Zugewiesenes Heinzelchen", escapeHtml(booking.assignedWorkerId || "-")],
        ])}
      `,
    }),
  });
}

const registrationServiceOrder = [
  { label: "Gartenarbeit", aliases: ["gartenarbeit", "garten"] },
  { label: "Reinigung", aliases: ["reinigung", "hausreinigung"] },
  { label: "Bügeln", aliases: ["buegeln", "bügeln", "waescheservice", "wäscheservice"] },
  { label: "Nachhilfe", aliases: ["nachhilfe"] },
  { label: "Kinderbetreuung", aliases: ["kinderbetreuung", "babysitting", "betreuung"] },
  { label: "Haustierbetreuung", aliases: ["haustierbetreuung", "tierbetreuung"] },
  { label: "Aufbau/Montage", aliases: ["aufbaumontage", "aufbau", "montage", "aufbau / montage"] },
  { label: "Malerarbeiten", aliases: ["malerarbeiten"] },
  { label: "Sonstiges", aliases: ["sonstiges", "sonstige"] },
];

function normalizeRegistrationService(value) {
  return `${value || ""}`
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

function registrationFullName(worker) {
  return `${worker.firstName || ""} ${worker.lastName || ""}`.trim() || worker.name || "-";
}

function registrationReversedName(worker) {
  return [worker.lastName, worker.firstName].filter(Boolean).join(", ").trim() || worker.name || "-";
}

function registrationAgeNotice(worker) {
  const birthdate = worker.birthdate || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return birthdate || "-";
  const birth = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return birthdate;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age > 30 ? `${birthdate} - ACHTUNG: älter als 30 Jahre (${age})` : `${birthdate} (${age} Jahre)`;
}

function registrationServiceDetail(worker, serviceConfig) {
  const details = Array.isArray(worker.serviceDetails) ? worker.serviceDetails : [];
  return details.find((detail) => {
    const normalized = normalizeRegistrationService(detail.service);
    return serviceConfig.aliases.some((alias) => normalized.includes(normalizeRegistrationService(alias)));
  });
}

function registrationServiceRows(worker) {
  const skillText = normalizeRegistrationService((worker.skills || []).join(", "));
  return registrationServiceOrder.map((service) => {
    const detail = registrationServiceDetail(worker, service);
    const selected = Boolean(detail) || service.aliases.some((alias) => skillText.includes(normalizeRegistrationService(alias)));
    const hourlyRate = detail?.hourlyRate ? `${escapeHtml(detail.hourlyRate)} EUR / Stunde` : "nicht angegeben";
    return [
      service.label,
      selected ? `Ja - gewünschter Stundenlohn: ${hourlyRate}` : "Nein",
    ];
  });
}

function compactRegistrationGrades(grades) {
  if (!Array.isArray(grades) || !grades.length) return "";
  const numbers = grades
    .map((grade) => Number(`${grade}`.replace(/\D/g, "")))
    .filter((grade) => Number.isFinite(grade))
    .sort((a, b) => a - b);
  if (numbers.length !== grades.length || numbers.length <= 1) return grades.join(", ");

  const ranges = [];
  let start = numbers[0];
  let previous = numbers[0];
  for (const current of numbers.slice(1)) {
    if (current === previous + 1) {
      previous = current;
    } else {
      ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = current;
      previous = current;
    }
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(", ");
}

function registrationTutoringInfo(worker) {
  const detail = registrationServiceDetail(worker, registrationServiceOrder[3]);
  if (!detail) return "";
  const subjects = Array.isArray(detail.tutoringSubjects) ? detail.tutoringSubjects.join(", ") : "";
  const grades = compactRegistrationGrades(detail.tutoringGrades);
  const byGrade = Array.isArray(detail.tutoringByGrade) && detail.tutoringByGrade.length
    ? detail.tutoringByGrade.map((item) => `${item.grade}: ${(item.subjects || []).join(", ")}`).join("; ")
    : "";
  return [
    subjects && grades ? `${subjects} in den Klassen ${grades}` : "",
    subjects && !grades ? `Fächer: ${subjects}` : "",
    byGrade ? `Zuordnung nach Klasse: ${byGrade}` : "",
  ].filter(Boolean).join("; ") || "Nachhilfe ausgewählt, keine Fächer/Klassen angegeben";
}

function registrationAdditionalInfo(worker) {
  const otherDetail = registrationServiceDetail(worker, registrationServiceOrder[8]);
  const otherText = otherDetail?.description || otherDetail?.details || otherDetail?.custom || "";
  const items = [
    registrationTutoringInfo(worker),
    worker.extraSkills ? `Zusätzliche Skills: ${worker.extraSkills}` : "",
    otherText ? `Sonstiges: ${otherText}` : "",
  ].filter(Boolean);
  return items.length ? items.join("\n") : "-";
}

function registrationAvailabilityText(worker) {
  const entries = Object.entries(worker.availability || {})
    .filter(([, windows]) => Array.isArray(windows) ? windows.length : windows)
    .map(([day, windows]) => `${day}: ${Array.isArray(windows) ? windows.join(", ") : windows}`);
  return entries.length ? entries.join("\n") : "-";
}

async function sendWorkerRegistrationEmail(worker) {
  const certificateAttachment = childcareCertificateAttachment(worker);
  const localAreas = Array.isArray(worker.localAreas) ? worker.localAreas.join(", ") : "";
  const region = [worker.serviceArea || worker.city, localAreas].filter(Boolean).join(" / ") || "-";
  const address = [worker.street, [worker.zip, worker.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "-";

  await sendEmail({
    to: "info@heinzelchen.com",
    subject: `Neue Heinzelchen-Registrierung: ${escapeHtml(registrationFullName(worker)) || "ohne Namen"}`,
    html: renderMailLayout({
      title: "Neue Heinzelchen-Registrierung",
      preheader: "Eine neue Heinzelchen-Registrierung ist eingegangen.",
      children: `
        ${mailHeading("1. Nachname, Vorname")}
        ${mailInfoTable([
          ["Name", escapeHtml(registrationReversedName(worker))],
        ])}
        ${mailHeading("2. Geburtsdatum")}
        ${mailInfoTable([
          ["Geburtsdatum", escapeHtml(registrationAgeNotice(worker))],
        ])}
        ${mailHeading("3. E-Mail-Adresse")}
        ${mailInfoTable([
          ["E-Mail", escapeHtml(worker.email) || "-"],
        ])}
        ${mailHeading("4. Telefonnummer")}
        ${mailInfoTable([
          ["Telefon", escapeHtml(worker.phone) || "-"],
        ])}
        ${mailHeading("5. Ausgewählte Dienstleistungen")}
        ${mailInfoTable(registrationServiceRows(worker).map(([service, value]) => [
          escapeHtml(service),
          escapeHtml(value),
        ]))}
        ${mailHeading("6. Weiterführende Informationen")}
        ${mailInfoTable([
          ["Informationen", escapeHtml(registrationAdditionalInfo(worker)).replace(/\n/g, "<br>")],
        ])}
        ${mailHeading("7. Angegebener Stadtteil / Region als Einsatzgebiet")}
        ${mailInfoTable([
          ["Einsatzgebiet", escapeHtml(region)],
        ])}
        ${mailHeading("8. Wohnadresse")}
        ${mailInfoTable([
          ["Adresse", escapeHtml(address)],
        ])}
        ${mailHeading("9. Angegebener Radius")}
        ${mailInfoTable([
          ["Radius", `${escapeHtml(worker.radiusKm) || "-"} km`],
        ])}
        ${mailHeading("10. Bevorzugte Arbeitszeiten")}
        ${mailInfoTable([
          ["Arbeitszeiten", escapeHtml(registrationAvailabilityText(worker)).replace(/\n/g, "<br>")],
          ["Vorlaufzeit", escapeHtml(worker.leadTime || "-")],
        ])}
        ${workerDocumentsHtml(worker)}
        ${certificatePreviewHtml(worker)}
        ${mailHeading("Bestätigungen")}
        ${mailInfoTable([
          ["Volljährig/selbstständig/Haftpflicht", worker.adultSelfEmployedConfirmed ? "Ja" : "Nein"],
          ["Nutzungsbedingungen", worker.termsAccepted ? "Ja" : "Nein"],
          ["Datenschutz", worker.privacyAccepted ? "Ja" : "Nein"],
        ])}
      `,
    }),
    attachments: certificateAttachment ? [certificateAttachment] : undefined,
  });
}

async function sendAssignmentEmails(booking, worker) {
  const customerSubject = `Ihr Heinzelchen ist gefunden - Auftrag bestätigen`;
  const workerFirstName = firstNameFromWorker(worker);
  const hourlyRate = serviceHourlyRate(worker, booking);
  const scheduleText = bookingScheduleText(booking);

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
            ["Termin", escapeHtml(scheduleText).replace(/\n/g, "<br>")],
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
          ${mailParagraph(`wir haben ein Heinzelchen für Sie gefunden. ${escapeHtml(workerFirstName)} kann zu folgendem Termin/Zeitfenster zu Ihnen kommen:<br>${escapeHtml(scheduleText).replace(/\n/g, "<br>")}<br><br>Der Stundenlohn beträgt ${hourlyRate} pro Stunde. Wissen Sie Ihre Aufgabe in guten Händen und bestätigen Sie Ihren Auftrag mit der Zahlung der Vermittlungsgebühr.`)}
          ${mailButton({ href: assignmentPaymentUrl, label: "Jetzt 3 € zahlen und Auftrag bestätigen" })}
          ${mailParagraph("Wir freuen uns sehr über Ihre Buchung und die Gelegenheit, Ihnen den Alltag leichter zu machen.")}
          ${mailParagraph("Herzliche Grüße<br>Ihre Heinzelchen")}
          ${mailParagraph(`Mail: ${mailLink("mailto:info@heinzelchen.com", "info@heinzelchen.com")}<br>Telefon: ${mailLink("tel:+491742997866", "0174 2997866")}`)}
          ${mailHeading("Stornierung")}
          ${mailParagraph(`Die Vermittlungsgebühr von 3,00 € ist nach Zahlung nicht erstattbar. Möchten Sie umbuchen oder einen anderen Termin vereinbaren, wenden Sie sich direkt an uns oder stellen Sie eine neue Buchungsanfrage über ${mailLink("https://heinzelchen.com", "heinzelchen.com")}. Bei Nichterscheinen Ihres Heinzelchens erstatten wir die Vermittlungsgebühr auf Anfrage kulanzweise zurück.`)}
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
    await runEmailTask("Heinzelchen-Registrierung", () => sendWorkerRegistrationEmail(normalizedWorker));
    return sendJson(res, 201, worker);
  }

  return sendJson(res, 404, { error: "API-Endpunkt nicht gefunden." });
}

module.exports = {
  handleApi,
};
