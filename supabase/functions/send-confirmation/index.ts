import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import {
  mailLink,
  mailParagraph,
  renderMailLayout,
} from "../_shared/html-mail-template.ts";

type WebhookPayload = {
  table?: string;
  record?: Record<string, unknown>;
};

type Recipient = {
  email: string;
  name: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
};

const PRIVACY_URL = "https://heinzelchen.com/datenschutz.html";
const TERMS_URL = "https://heinzelchen.com/nutzungsbedingungen.html";

const corsHeaders = {
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

const fullName = (firstName?: unknown, lastName?: unknown) =>
  [textValue(firstName), textValue(lastName)].filter(Boolean).join(" ").trim();

const greetingName = (name: string) => name || "du";

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

async function bookingRecipient(record: Record<string, unknown>): Promise<Recipient | null> {
  let email = textValue(record.email);
  let name = textValue(record.name) || fullName(record.first_name, record.last_name);

  if (!email && record.customer_id) {
    // TODO: Nur aktivieren, falls bookings später auf eine separate Kunden-Tabelle verweist.
    const { data, error } = await supabase()
      .from("customers")
      .select("email,name,first_name,last_name")
      .eq("id", record.customer_id)
      .maybeSingle();

    if (error) throw error;
    email = textValue(data?.email);
    name = name || textValue(data?.name) || fullName(data?.first_name, data?.last_name);
  }

  if (!email) return null;

  const displayName = greetingName(name);
  return {
    email,
    name,
    from: "Heinzelchen Buchungen <buchungen@heinzelchen.com>",
    replyTo: "info@heinzelchen.com",
    subject: "Deine Buchung ist bestätigt",
    html: renderMailLayout({
      title: "Ihre Buchung ist eingegangen",
      preheader: "Wir prüfen Ihre Anfrage und melden uns persönlich.",
      children: `
        ${mailParagraph(`Hallo ${escapeHtml(displayName)},`)}
        ${mailParagraph("Ihre Buchung bei den Heinzelchen ist bei uns eingegangen.")}
        ${mailParagraph("Wir prüfen Ihre Anfrage und melden uns persönlich mit einem passenden Vorschlag.")}
        ${mailParagraph("Herzliche Grüße<br>Ihr Heinzelchen-Team")}
        ${mailParagraph(`${mailLink(PRIVACY_URL, "Datenschutzerklärung")}<br>${mailLink(TERMS_URL, "Nutzungsbedingungen")}`)}
      `,
    }),
  };
}

async function workerRecipient(record: Record<string, unknown>): Promise<Recipient | null> {
  const email = textValue(record.email);
  const name = textValue(record.name) || fullName(record.first_name, record.last_name);

  if (!email) return null;

  const displayName = greetingName(name);
  return {
    email,
    name,
    from: "Heinzelchen <registrierung@heinzelchen.com>",
    replyTo: "info@heinzelchen.com",
    subject: "Willkommen bei den Heinzelchen",
    html: renderMailLayout({
      title: "Willkommen bei den Heinzelchen",
      preheader: "Deine Anmeldung ist bei uns eingegangen.",
      children: `
        ${mailParagraph(`Hallo ${escapeHtml(displayName)},`)}
        ${mailParagraph("willkommen bei den Heinzelchen. Deine Anmeldung ist bei uns eingegangen.")}
        ${mailParagraph("Wir prüfen deine Angaben und melden uns, sobald passende Aufgaben verfügbar sind.")}
        ${mailParagraph("Herzliche Grüße<br>Dein Heinzelchen-Team")}
        ${mailParagraph(`${mailLink(PRIVACY_URL, "Datenschutzerklärung")}<br>${mailLink(TERMS_URL, "Nutzungsbedingungen")}`)}
      `,
    }),
  };
}

async function recipientForPayload(payload: WebhookPayload): Promise<Recipient | null> {
  const table = payload.table;
  const record = payload.record || {};

  if (table === "bookings") return bookingRecipient(record);
  if (table === "workers") return workerRecipient(record);

  return null;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json() as WebhookPayload;
    const recipient = await recipientForPayload(payload);

    if (!recipient) {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    await mailTransport().sendMail({
      from: recipient.from,
      to: recipient.email,
      replyTo: recipient.replyTo,
      subject: recipient.subject,
      html: recipient.html,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("SEND CONFIRMATION ERROR:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
