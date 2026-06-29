import nodemailer from "npm:nodemailer@6.9.16";

const STRIPE_ONBOARDING_URL = "[STRIPE_ONBOARDING_URL]";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: WorkerRecord;
};

type WorkerRecord = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  birthdate?: string | null;
  service_area?: string | null;
  radius_km?: number | string | null;
  local_areas?: unknown;
  skills?: unknown;
  extra_skills?: string | null;
  availability?: unknown;
  lead_time?: string | null;
  service_details?: unknown;
  childcare_certificate_name?: string | null;
  qualification_confirmed?: boolean | null;
  adult_self_employed_confirmed?: boolean | null;
  terms_accepted?: boolean | null;
  privacy_accepted?: boolean | null;
  registration_type?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

const textValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(", ") : "-";
  return JSON.stringify(value, null, 2);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const rawText = (record: WorkerRecord, key: string) => textValue(record.raw_payload?.[key]);

const firstName = (record: WorkerRecord) =>
  textValue(record.first_name) || rawText(record, "first_name") || rawText(record, "firstName");

const lastName = (record: WorkerRecord) =>
  textValue(record.last_name) || rawText(record, "last_name") || rawText(record, "lastName");

const fullName = (record: WorkerRecord) =>
  [firstName(record), lastName(record)].filter(Boolean).join(" ").trim() ||
  textValue(record.raw_payload?.name) ||
  "-";

const skillsText = (record: WorkerRecord) =>
  displayValue(record.skills ?? record.raw_payload?.skills);

const hasChildcareSkill = (record: WorkerRecord) => {
  const skills = record.skills ?? record.raw_payload?.skills;
  if (Array.isArray(skills)) {
    return skills.some((skill) => textValue(skill).toLowerCase().includes("kinderbetreuung"));
  }
  return displayValue(skills).toLowerCase().includes("kinderbetreuung");
};

const mailTransport = () => {
  const host = Deno.env.get("REGISTRATION_SMTP_HOST");
  const port = Number(Deno.env.get("REGISTRATION_SMTP_PORT") || "587");
  const user = Deno.env.get("REGISTRATION_SMTP_USER");
  const pass = Deno.env.get("REGISTRATION_SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("REGISTRATION_SMTP_HOST, REGISTRATION_SMTP_USER oder REGISTRATION_SMTP_PASS fehlt.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const internalMailBody = (record: WorkerRecord) => {
  const childcareNotice = hasChildcareSkill(record)
    ? `\nHinweis: Führungszeugnis wurde eingereicht – bitte prüfen: ${displayValue(record.childcare_certificate_name)}\n`
    : "";

  return `WO:

PLZ: ${displayValue(record.zip)}
Ort: ${displayValue(record.city)}
Straße: ${displayValue(record.street)}
Einsatzgebiet: ${displayValue(record.service_area)}
Radius: ${displayValue(record.radius_km)} km
Lokale Gebiete: ${displayValue(record.local_areas)}

WAS:

Dienstleistungen: ${skillsText(record)}
Zusätzliche Skills: ${displayValue(record.extra_skills)}
Dienstleistungsdetails: ${displayValue(record.service_details)}

STUNDENLOHN:

Je Dienstleistung in ${displayValue(record.service_details)}

WANN:

Verfügbarkeit: ${displayValue(record.availability)}
Vorlaufzeit: ${displayValue(record.lead_time)}

KONTAKT:

Name: ${fullName(record)}
E-Mail: ${displayValue(record.email)}
Telefon: ${displayValue(record.phone)}
Geburtsdatum: ${displayValue(record.birthdate)}
Registrierungstyp: ${displayValue(record.registration_type)}

BESTÄTIGUNGEN:

AGB akzeptiert: ${displayValue(record.terms_accepted)}
Datenschutz akzeptiert: ${displayValue(record.privacy_accepted)}
Qualifikation bestätigt: ${displayValue(record.qualification_confirmed)}
Selbstständigkeit bestätigt: ${displayValue(record.adult_self_employed_confirmed)}
${childcareNotice}`;
};

const welcomeMailBody = (record: WorkerRecord) => {
  const greetingName = firstName(record) || "Heinzelchen";

  return `Liebe/-r ${greetingName},

wir freuen uns sehr, Dich als Heinzelchen für ${skillsText(record)} begrüßen zu dürfen. Wir werden Dich mit passenden Aufgaben in Deiner Umgebung belohnen.

Damit Du möglichst schnell nach Deiner ersten erledigten Aufgabe Deinen Lohn erhältst, solltest Du – wenn Du es noch nicht nach der Registrierung auf der Website gemacht hast – noch Dein gewünschtes Auszahlungskonto angeben.

Auszahlungskonto für meinen Lohn angeben:
${STRIPE_ONBOARDING_URL}

Behalte Deine Mailbox aktiv im Auge. Sobald ein passender Auftrag in Deiner Nähe eingeht, bekommst Du eine Mail – es gilt: first come, first serve!

Solltest Du Deine Angaben (Stundenlohn, Dienstleistungsbereiche usw.) ändern wollen oder Fragen haben, kontaktiere uns gerne jederzeit.

Herzliche Grüße

Dein Heinzelchen-Team

info@heinzelchen.com

0174 2997866

[Link zur Datenschutzerklärung – Platzhalter]

[Link zu den Nutzungsbedingungen – Platzhalter]
`;
};

const welcomeMailHtml = (record: WorkerRecord) => {
  const greetingName = escapeHtml(firstName(record) || "Heinzelchen");
  const escapedSkills = escapeHtml(skillsText(record));
  const escapedUrl = escapeHtml(STRIPE_ONBOARDING_URL);

  return `
    <p>Liebe/-r ${greetingName},</p>
    <p>wir freuen uns sehr, Dich als Heinzelchen für ${escapedSkills} begrüßen zu dürfen. Wir werden Dich mit passenden Aufgaben in Deiner Umgebung belohnen.</p>
    <p>Damit Du möglichst schnell nach Deiner ersten erledigten Aufgabe Deinen Lohn erhältst, solltest Du – wenn Du es noch nicht nach der Registrierung auf der Website gemacht hast – noch Dein gewünschtes Auszahlungskonto angeben.</p>
    <p>
      <a href="${escapedUrl}" style="display:inline-block;background:#5578A8;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
        Auszahlungskonto für meinen Lohn angeben
      </a>
    </p>
    <p>Behalte Deine Mailbox aktiv im Auge. Sobald ein passender Auftrag in Deiner Nähe eingeht, bekommst Du eine Mail – es gilt: first come, first serve!</p>
    <p>Solltest Du Deine Angaben (Stundenlohn, Dienstleistungsbereiche usw.) ändern wollen oder Fragen haben, kontaktiere uns gerne jederzeit.</p>
    <p>Herzliche Grüße</p>
    <p>Dein Heinzelchen-Team</p>
    <p>info@heinzelchen.com</p>
    <p>0174 2997866</p>
    <p>[Link zur Datenschutzerklärung – Platzhalter]</p>
    <p>[Link zu den Nutzungsbedingungen – Platzhalter]</p>
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

    if (payload.table !== "workers" || !record.id) {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    const workerEmail = textValue(record.email);
    if (!workerEmail) throw new Error("Heinzelchen-E-Mail fehlt.");

    const transporter = mailTransport();
    const workerName = fullName(record);

    await transporter.sendMail({
      from: "Heinzelchen Registrierungen <registrierungen@heinzelchen.com>",
      to: "registrierungen@heinzelchen.com",
      replyTo: workerEmail,
      subject: `Neue Heinzelchen-Registrierung – ${workerName}`,
      text: internalMailBody(record),
    });

    await transporter.sendMail({
      from: "Heinzelchen <registrierungen@heinzelchen.com>",
      to: workerEmail,
      replyTo: "info@heinzelchen.com",
      subject: "Willkommen bei den Heinzelchen!",
      text: welcomeMailBody(record),
      html: welcomeMailHtml(record),
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("ON REGISTRIERUNG ERROR:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
