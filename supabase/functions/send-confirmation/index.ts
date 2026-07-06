import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

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

const resend = () => {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY fehlt.");
  return new Resend(apiKey);
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
    html: `
      <p>Hallo ${displayName},</p>
      <p>deine Buchung bei den Heinzelchen ist bei uns eingegangen.</p>
      <p>Wir prüfen deine Anfrage und melden uns persönlich mit einem passenden Vorschlag.</p>
      <p>Herzliche Grüße<br>Dein Heinzelchen-Team</p>
      <p><a href="${PRIVACY_URL}">Datenschutzerklärung</a></p>
      <p><a href="${TERMS_URL}">Nutzungsbedingungen</a></p>
    `,
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
    html: `
      <p>Hallo ${displayName},</p>
      <p>willkommen bei den Heinzelchen. Deine Anmeldung ist bei uns eingegangen.</p>
      <p>Wir prüfen deine Angaben und melden uns, sobald passende Aufgaben verfügbar sind.</p>
      <p>Herzliche Grüße<br>Dein Heinzelchen-Team</p>
      <p><a href="${PRIVACY_URL}">Datenschutzerklärung</a></p>
      <p><a href="${TERMS_URL}">Nutzungsbedingungen</a></p>
    `,
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

    const { error } = await resend().emails.send({
      from: recipient.from,
      to: recipient.email,
      replyTo: recipient.replyTo,
      subject: recipient.subject,
      html: recipient.html,
    });

    if (error) {
      console.error("RESEND ERROR:", error);
      return new Response(JSON.stringify({ error: "Resend email failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

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
