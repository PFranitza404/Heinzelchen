import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

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
  zip?: string | null;
  city?: string | null;
  street?: string | null;
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

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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

async function getOrCreateAuftragsnummer(record: BookingRecord): Promise<number> {
  if (!record.id) throw new Error("Booking id fehlt im Webhook payload.");

  const { data: auftragsnummer, error } = await supabase()
    .rpc("assign_auftragsnummer", { booking_id: record.id });

  if (error) throw error;
  if (typeof auftragsnummer !== "number") throw new Error("assign_auftragsnummer gab keine Zahl zurück.");

  return auftragsnummer;
}

const internalMailBody = (record: BookingRecord, auftragsnummer: number) => `Auftragsnummer: ${auftragsnummer}

WO:

PLZ: ${displayValue(record.zip)}
Ort: ${displayValue(record.city)}
Straße: ${displayValue(record.street)}

WAS:

Dienstleistungen: ${displayValue(record.services_summary)}
Details: ${displayValue(record.detail_notes)}
Geschätzte Dauer: ${displayValue(record.duration)} Stunden
Zusatzaufgaben: ${displayValue(record.extra_task)}

WANN:

Datum: ${displayValue(record.date)}
Uhrzeit: ${displayValue(record.time)}
Häufigkeit: ${displayValue(record.frequency)}
Verfügbarkeit: ${displayValue(record.availability)}

KONTAKT:

Name: ${fullName(record)}
E-Mail: ${displayValue(record.email)}
Telefon: ${displayValue(record.phone)}
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
    const transporter = mailTransport();

    await transporter.sendMail({
      from: "Heinzelchen Buchungen <buchungen@heinzelchen.com>",
      to: "buchungen@heinzelchen.com",
      replyTo: customerEmail,
      subject: `Neue Buchungsanfrage [${auftragsnummer}]`,
      text: internalMailBody(record, auftragsnummer),
    });

    await transporter.sendMail({
      from: "Heinzelchen <buchungen@heinzelchen.com>",
      to: customerEmail,
      replyTo: "info@heinzelchen.com",
      subject: "Ihre Anfrage bei den Heinzelchen",
      text: customerMailBody(record),
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
