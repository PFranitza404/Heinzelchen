import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import {
  mailHeading,
  mailInfoTable,
  mailLink,
  mailParagraph,
  renderMailLayout,
} from "../_shared/html-mail-template.ts";

const PRIVACY_URL = "https://heinzelchen.com/datenschutz.html";
const TERMS_URL = "https://heinzelchen.com/nutzungsbedingungen.html";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: BookingRecord;
};

type BookingRecord = {
  id?: string;
  auftragsnummer?: number | null;
  status?: string | null;
  assigned_worker_id?: string | null;
  zip?: string | null;
  city?: string | null;
  street?: string | null;
  location_notes?: string | null;
  services?: unknown;
  services_summary?: string | null;
  detail_notes?: unknown;
  duration?: number | string | null;
  extra_task?: string | null;
  date?: string | null;
  time?: string | null;
  frequency?: string | null;
  availability?: unknown;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

const textValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const escapeHtml = (value: unknown) =>
  `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(", ") : "-";
  if (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) return "-";
  return JSON.stringify(value, null, 2);
};

const fullName = (record: BookingRecord) => {
  const firstName = textValue(record.first_name);
  const lastName = textValue(record.last_name);
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || textValue(record.name) || "-";
};

const lastNameForGreeting = (record: BookingRecord) =>
  textValue(record.last_name) || textValue(record.name) || "";

const supabase = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
};

const mailTransport = () => {
  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER oder SMTP_PASS fehlt.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const smtpSenderAddress = () => Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_USER") || "info@heinzelchen.com";

const senderFrom = (name: string) => `${name} <${smtpSenderAddress()}>`;

async function getOrCreateAuftragsnummer(record: BookingRecord): Promise<number> {
  if (!record.id) throw new Error("Booking id fehlt im Webhook payload.");

  const { data: auftragsnummer, error } = await supabase()
    .rpc("assign_auftragsnummer", { booking_id: record.id });

  if (error) throw error;
  if (typeof auftragsnummer !== "number") throw new Error("assign_auftragsnummer gab keine Zahl zurück.");

  return auftragsnummer;
}

async function assignedWorkerLabel(record: BookingRecord): Promise<string> {
  const workerId = textValue(record.assigned_worker_id);
  if (!workerId) return "-";

  try {
    const { data, error } = await supabase()
      .from("workers")
      .select("first_name,last_name,email")
      .eq("id", workerId)
      .maybeSingle();

    if (error) throw error;

    const worker = (data || {}) as Record<string, unknown>;
    const name = [textValue(worker.first_name), textValue(worker.last_name)].filter(Boolean).join(" ").trim();
    const email = textValue(worker.email);
    return [name, email].filter(Boolean).join(" - ") || workerId;
  } catch (error) {
    console.warn("Assigned worker lookup failed", error);
    return workerId;
  }
}

const parseStructuredValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const bookingServices = (record: BookingRecord) =>
  Array.isArray(record.services) && record.services.length
    ? record.services.map(displayValue).join(", ")
    : displayValue(record.services_summary).split("–")[0]?.trim() || "-";

const serviceAppointments = (record: BookingRecord): Array<Record<string, unknown>> => {
  const availability = parseStructuredValue(record.availability);
  if (availability && typeof availability === "object") {
    const appointments = (availability as Record<string, unknown>).serviceAppointments;
    if (Array.isArray(appointments)) return appointments.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  }
  return [];
};

const dateWindowText = (window: Record<string, unknown>) => {
  const date = displayValue(window.date);
  const dateEnd = displayValue(window.dateEnd);
  if (date !== "-" && dateEnd !== "-" && dateEnd !== date) return `${date} bis ${dateEnd}`;
  if (date !== "-") return date;
  return dateEnd !== "-" ? dateEnd : "";
};

const serviceDurationText = (record: BookingRecord) => {
  const appointments = serviceAppointments(record);
  if (appointments.length) {
    return appointments.map((appointment) => {
      const service = textValue(appointment.service);
      const duration = textValue(appointment.duration);
      return [service, duration].filter(Boolean).join(": ");
    }).filter(Boolean).join("\n");
  }
  return displayValue(record.duration);
};

const frequencyText = (record: BookingRecord) => {
  const appointments = serviceAppointments(record);
  if (appointments.length) {
    return appointments.map((appointment) => {
      const service = textValue(appointment.service);
      const frequency = textValue(appointment.frequency);
      return service && frequency ? `${service}: ${frequency}` : frequency;
    }).filter(Boolean).join("\n");
  }
  return displayValue(record.frequency);
};

const timeWindowText = (record: BookingRecord) => {
  const appointments = serviceAppointments(record);
  if (!appointments.length) return `${displayValue(record.date)} ${displayValue(record.time)}`.trim();

  return appointments.map((appointment) => {
    const service = textValue(appointment.service);
    const windows = Array.isArray(appointment.windows) ? appointment.windows as Array<Record<string, unknown>> : [];
    const windowText = windows.map((window) => {
      const date = dateWindowText(window);
      const times = Array.isArray(window.times) ? window.times as Array<Record<string, unknown>> : [];
      const timeText = times.map((time) => {
        const from = displayValue(time.from);
        const to = displayValue(time.to);
        return from !== "-" && to !== "-" ? `${from}-${to}` : [from, to].filter((value) => value !== "-").join("-");
      }).filter(Boolean).join(", ");
      return [date, timeText].filter((value) => value && value !== "-").join(": ");
    }).filter(Boolean).join(" | ");
    return [service, windowText].filter(Boolean).join(" - ");
  }).filter(Boolean).join("\n");
};

const detailNotesObject = (record: BookingRecord): Record<string, unknown> => {
  const parsed = parseStructuredValue(record.detail_notes);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
};

const taskDetailsText = (record: BookingRecord) => {
  const details = detailNotesObject(record);
  const labels: Record<string, string> = {
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
    const value = detail as Record<string, unknown>;
    const parts = [
      Array.isArray(value.tasks) && value.tasks.length ? `Aufgaben: ${value.tasks.map(displayValue).join(", ")}` : "",
      textValue(value.size) ? `Größe/Fläche: ${textValue(value.size)}` : "",
      textValue(value.custom) ? `Freitext: ${textValue(value.custom)}` : "",
      textValue(value.materialEquipment) ? `Material/Equipment: ${textValue(value.materialEquipment)}` : "",
      Array.isArray(value.requests) && value.requests.length ? `Anfragen: ${value.requests.map(displayValue).join(", ")}` : "",
    ].filter(Boolean);
    return parts.length ? [`${label}: ${parts.join("; ")}`] : [];
  });

  return rows.length ? rows.join("\n") : displayValue(record.extra_task);
};

const internalMailBody = (record: BookingRecord, auftragsnummer: number, assignedWorker = "-") => `1. AUFTRAGSNUMMER:

${auftragsnummer}

2. NAME:

${fullName(record)}

3. E-MAIL:

${displayValue(record.email)}

4. TELEFON:

${displayValue(record.phone)}

5. ADRESSE:

${displayValue(record.street)}
${displayValue(record.zip)} ${displayValue(record.city)}

6. DIENSTLEISTUNG:

${bookingServices(record)}

7. AUFGABENDETAILS:

${taskDetailsText(record)}

8. GESCHÄTZTE DAUER:

${serviceDurationText(record)}

9. DATUM / ZEITFENSTER:

${timeWindowText(record)}

10. HÄUFIGKEIT:

${frequencyText(record)}

11. ZUSÄTZLICHE HINWEISE:

${displayValue(record.location_notes)}
${displayValue(record.extra_task) !== "-" ? `Zusatzaufgaben: ${displayValue(record.extra_task)}` : ""}

12. STATUS / ZUWEISUNG:

Status: ${displayValue(record.status)}
Zugewiesenes Heinzelchen: ${assignedWorker}
`;

const customerMailBody = (record: BookingRecord) => {
  const lastName = lastNameForGreeting(record);
  const greeting = lastName ? `Sehr geehrte/-r Herr/Frau ${lastName},` : "Sehr geehrte Damen und Herren,";

  return `${greeting}

wir haben Ihre Anfrage erhalten und melden uns bei Ihnen schnellstmöglich mit einem Termin und Stundenlohn, sodass Sie den Buchungsprozess abschließen können und Ihre Aufgabe zuverlässig erledigt wird.

Sollten Sie Fragen haben, kontaktieren Sie uns gerne.

Herzliche Grüße von Ihren Heinzelchen

Mail: info@heinzelchen.com

Telefon: 0174 2997866

Datenschutzerklärung:
${PRIVACY_URL}

Nutzungsbedingungen:
${TERMS_URL}
`;
};

const internalMailHtml = (record: BookingRecord, auftragsnummer: number, assignedWorker = "-") =>
  renderMailLayout({
    title: `Neue Buchungsanfrage [${auftragsnummer}]`,
    preheader: "Eine neue Buchungsanfrage ist eingegangen.",
    children: `
      ${mailHeading("1. Auftragsnummer")}
      ${mailInfoTable([
        ["Auftragsnummer", escapeHtml(auftragsnummer)],
      ])}
      ${mailHeading("2. Name")}
      ${mailInfoTable([
        ["Name", escapeHtml(fullName(record))],
      ])}
      ${mailHeading("3. E-Mail")}
      ${mailInfoTable([
        ["E-Mail", escapeHtml(displayValue(record.email))],
      ])}
      ${mailHeading("4. Telefon")}
      ${mailInfoTable([
        ["Telefon", escapeHtml(displayValue(record.phone))],
      ])}
      ${mailHeading("5. Adresse")}
      ${mailInfoTable([
        ["Straße", escapeHtml(displayValue(record.street))],
        ["PLZ", escapeHtml(displayValue(record.zip))],
        ["Ort", escapeHtml(displayValue(record.city))],
      ])}
      ${mailHeading("6. Dienstleistung")}
      ${mailInfoTable([
        ["Dienstleistung", escapeHtml(bookingServices(record))],
      ])}
      ${mailHeading("7. Aufgabendetails")}
      ${mailInfoTable([
        ["Details", escapeHtml(taskDetailsText(record)).replace(/\n/g, "<br>")],
      ])}
      ${mailHeading("8. Geschätzte Dauer")}
      ${mailInfoTable([
        ["Dauer", escapeHtml(serviceDurationText(record)).replace(/\n/g, "<br>")],
      ])}
      ${mailHeading("9. Datum / Zeitfenster")}
      ${mailInfoTable([
        ["Zeitfenster", escapeHtml(timeWindowText(record)).replace(/\n/g, "<br>")],
      ])}
      ${mailHeading("10. Häufigkeit")}
      ${mailInfoTable([
        ["Häufigkeit", escapeHtml(frequencyText(record)).replace(/\n/g, "<br>")],
      ])}
      ${mailHeading("11. Zusätzliche Hinweise")}
      ${mailInfoTable([
        ["Hinweise", escapeHtml(displayValue(record.location_notes))],
        ["Zusatzaufgaben", escapeHtml(displayValue(record.extra_task))],
      ])}
      ${mailHeading("12. Status / Zuweisung")}
      ${mailInfoTable([
        ["Status", escapeHtml(displayValue(record.status))],
        ["Zugewiesenes Heinzelchen", escapeHtml(assignedWorker)],
      ])}
    `,
  });

const customerMailHtml = (record: BookingRecord) => {
  const lastName = lastNameForGreeting(record);
  const greeting = lastName ? `Sehr geehrte Frau / sehr geehrter Herr ${escapeHtml(lastName)},` : "Sehr geehrte Damen und Herren,";

  return renderMailLayout({
    title: "Ihre Anfrage bei den Heinzelchen",
    preheader: "Ihre Anfrage ist bei uns eingegangen.",
    children: `
      ${mailParagraph(greeting)}
      ${mailParagraph("wir haben Ihre Anfrage erhalten und melden uns bei Ihnen schnellstmöglich mit einem Termin und Stundenlohn, sodass Sie den Buchungsprozess abschließen können und Ihre Aufgabe zuverlässig erledigt wird.")}
      ${mailParagraph("Sollten Sie Fragen haben, kontaktieren Sie uns gerne.")}
      ${mailParagraph("Herzliche Grüße von Ihren Heinzelchen")}
      ${mailParagraph(`Mail: ${mailLink("mailto:info@heinzelchen.com", "info@heinzelchen.com")}<br>Telefon: ${mailLink("tel:+491742997866", "0174 2997866")}`)}
      ${mailParagraph(`${mailLink(PRIVACY_URL, "Datenschutzerklärung")}<br>${mailLink(TERMS_URL, "Nutzungsbedingungen")}`)}
    `,
  });
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: jsonHeaders,
      });
    }

    const payload = await req.json() as WebhookPayload;
    const record = payload.record || {};

    if (payload.table !== "bookings" || !record.id) {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const customerEmail = textValue(record.email);
    if (!customerEmail) throw new Error("Kunden-E-Mail fehlt.");

    const auftragsnummer = await getOrCreateAuftragsnummer(record);
    const assignedWorker = await assignedWorkerLabel(record);
    const transporter = mailTransport();

    await transporter.sendMail({
      from: senderFrom("Heinzelchen Buchungen"),
      to: "buchungen@heinzelchen.com",
      replyTo: customerEmail,
      subject: `Neue Buchungsanfrage [${auftragsnummer}]`,
      text: internalMailBody(record, auftragsnummer, assignedWorker),
      html: internalMailHtml(record, auftragsnummer, assignedWorker),
    });

    await transporter.sendMail({
      from: senderFrom("Heinzelchen"),
      to: customerEmail,
      replyTo: "info@heinzelchen.com",
      subject: "Ihre Anfrage bei den Heinzelchen",
      text: customerMailBody(record),
      html: customerMailHtml(record),
    });

    return new Response(JSON.stringify({ ok: true, auftragsnummer }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("ON BUCHUNG ERROR:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
