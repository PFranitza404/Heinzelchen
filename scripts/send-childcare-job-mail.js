const fs = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");
const {
  buildManualWorkerAssignmentMail,
  fullName,
} = require("../lib/manual-worker-assignment-template");

const root = path.dirname(__dirname);

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const dryRun = process.argv.includes("--dry-run");
const bookingIdArg = process.argv.find((arg) => arg.startsWith("--booking-id="));
const bookingId = bookingIdArg ? bookingIdArg.slice("--booking-id=".length) : "";
const unquote = (value) => String(value || "").replace(/^['"]|['"]$/g, "");

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
const mailFrom = unquote(env.MAIL_FROM || env.EMAIL_FROM || "Heinzelchen <info@heinzelchen.com>");
const trackingRecipient = "buchungen@heinzelchen.com";

const smtpHost = env.SMTP_HOST || env.MAIL_HOST;
const smtpPort = Number(env.SMTP_PORT || env.MAIL_PORT || "587");
const smtpUser = unquote(env.SMTP_USER || env.MAIL_USER);
const smtpPass = unquote(env.SMTP_PASS || env.MAIL_PASS);
const smtpSecure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : smtpPort === 465;

function requireConfig() {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseKey) missing.push("SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_ANON_KEY");
  if (!smtpHost) missing.push("SMTP_HOST");
  if (!smtpUser) missing.push("SMTP_USER");
  if (!smtpPass) missing.push("SMTP_PASS");
  if (missing.length) throw new Error(`Fehlende Konfiguration: ${missing.join(", ")}`);
}

async function supabaseGet(pathname) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function hasChildcareSkill(worker) {
  const aliases = ["babysitting", "kinderbetreuung", "betreuung"];
  const skills = Array.isArray(worker.skills) ? worker.skills : [];
  const details = Array.isArray(worker.service_details) ? worker.service_details : [];
  return [...skills, ...details.map((detail) => detail?.service)]
    .some((service) => aliases.includes(String(service || "").trim().toLowerCase()));
}

function workerName(worker) {
  return fullName([worker.first_name, worker.last_name]) || worker.raw_payload?.name || worker.email;
}

async function loadBooking() {
  const query = bookingId
    ? `bookings?select=*&id=eq.${encodeURIComponent(bookingId)}&limit=1`
    : "bookings?select=*&order=created_at.desc&limit=1";
  const [booking] = await supabaseGet(query);
  if (!booking) throw new Error("Keine Buchung gefunden.");
  return booking;
}

async function main() {
  requireConfig();

  const booking = await loadBooking();
  const workers = await supabaseGet("workers?select=*&order=created_at.desc");
  const recipients = [...new Map(
    workers
      .filter(hasChildcareSkill)
      .filter((worker) => worker.email)
      .map((worker) => [String(worker.email).trim().toLowerCase(), worker]),
  ).values()];

  if (!recipients.length) throw new Error("Keine Heinzelchen mit Kinderbetreuung gefunden.");

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "send",
    booking: {
      id: booking.id,
      auftragsnummer: booking.auftragsnummer,
      services: booking.services,
      services_summary: booking.services_summary,
      city: booking.city,
      date: booking.date,
      time: booking.time,
    },
    recipients: recipients.map((worker) => ({
      name: workerName(worker),
      email: worker.email,
      status: worker.status,
      serviceArea: worker.service_area,
    })),
  }, null, 2));

  if (dryRun) return;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const results = await Promise.all(recipients.map(async (worker) => {
    const mail = buildManualWorkerAssignmentMail({ booking, worker });
    const result = await transporter.sendMail({
      from: mailFrom,
      to: worker.email,
      bcc: trackingRecipient,
      replyTo: trackingRecipient,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    return {
      name: workerName(worker),
      email: worker.email,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
    };
  }));

  console.log(JSON.stringify({ sent: results }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
