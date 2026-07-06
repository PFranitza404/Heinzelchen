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

const childcareCertificateName = (record: WorkerRecord) =>
  textValue(record.childcare_certificate_name) || rawText(record, "childcareCertificateName");

const childcareCertificateDataUrl = (record: WorkerRecord) =>
  rawText(record, "childcareCertificateDataUrl");

const childcareCertificateType = (record: WorkerRecord) =>
  rawText(record, "childcareCertificateType");

const workerDocuments = (record: WorkerRecord) => {
  const documents = record.raw_payload?.documents;
  return Array.isArray(documents) ? documents as Array<Record<string, unknown>> : [];
};

const childcareCertificateAttachment = (record: WorkerRecord) => {
  const certificateDocument = workerDocuments(record).find((doc) => textValue(doc.label) === "Führungszeugnis");
  const dataUrl = textValue(certificateDocument?.dataUrl) || childcareCertificateDataUrl(record);
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return {
    filename: textValue(certificateDocument?.name) || childcareCertificateName(record) || "fuehrungszeugnis.jpg",
    content: match[2],
    encoding: "base64",
    contentType: textValue(certificateDocument?.type) || childcareCertificateType(record) || match[1],
    cid: "childcare-certificate@heinzelchen",
  };
};

const workerDocumentAttachments = (record: WorkerRecord) =>
  workerDocuments(record)
    .map((doc, index) => {
      const dataUrl = textValue(doc.dataUrl);
      const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
      if (!match) return null;
      return {
        filename: textValue(doc.name) || `dokument-${index + 1}`,
        content: match[2],
        encoding: "base64",
        contentType: textValue(doc.type) || match[1],
      };
    })
    .filter(Boolean);

const workerDocumentsHtml = (record: WorkerRecord) => {
  const documents = workerDocuments(record);
  if (!documents.length) return "";
  return `${mailHeading("Dokumente")}
    ${mailInfoTable(documents.map((doc) => [
      escapeHtml(textValue(doc.label) || "Dokument"),
      [
        escapeHtml(textValue(doc.name) || "-"),
        textValue(doc.bucket) && textValue(doc.path) ? `<br>Pfad: ${escapeHtml(`${textValue(doc.bucket)}/${textValue(doc.path)}`)}` : "",
        textValue(doc.signedUrl) ? `<br>${mailLink(textValue(doc.signedUrl), "Datei öffnen")}` : "",
        textValue(doc.uploadError) ? `<br>Upload-Hinweis: ${escapeHtml(textValue(doc.uploadError))}` : "",
      ].join(""),
    ]))}`;
};

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

const internalMailHtml = (record: WorkerRecord) => {
  const certificateAttachment = childcareCertificateAttachment(record);
  const childcareNotice = hasChildcareSkill(record)
    ? `Führungszeugnis wurde eingereicht - bitte prüfen: ${escapeHtml(displayValue(childcareCertificateName(record)))}`
    : "-";
  const certificatePreview = certificateAttachment
    ? `${mailHeading("Führungszeugnis")}
      ${mailParagraph(`Datei: ${escapeHtml(childcareCertificateName(record) || "-")}`)}
      <img src="cid:childcare-certificate@heinzelchen" alt="Führungszeugnis" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid rgba(85,120,168,.22);border-radius:12px;margin:8px 0 16px;">`
    : "";

  return renderMailLayout({
    title: "Neue Heinzelchen-Registrierung",
    preheader: "Eine neue Heinzelchen-Registrierung ist eingegangen.",
    children: `
      ${mailHeading("Wo")}
      ${mailInfoTable([
        ["PLZ", escapeHtml(displayValue(record.zip))],
        ["Ort", escapeHtml(displayValue(record.city))],
        ["Straße", escapeHtml(displayValue(record.street))],
        ["Einsatzgebiet", escapeHtml(displayValue(record.service_area))],
        ["Radius", `${escapeHtml(displayValue(record.radius_km))} km`],
        ["Lokale Gebiete", escapeHtml(displayValue(record.local_areas))],
      ])}
      ${mailHeading("Was")}
      ${mailInfoTable([
        ["Dienstleistungen", escapeHtml(skillsText(record))],
        ["Zusätzliche Skills", escapeHtml(displayValue(record.extra_skills))],
        ["Dienstleistungsdetails", escapeHtml(displayValue(record.service_details)).replace(/\n/g, "<br>")],
        ["Stundenlohn", `Je Dienstleistung in ${escapeHtml(displayValue(record.service_details)).replace(/\n/g, "<br>")}`],
      ])}
      ${mailHeading("Wann")}
      ${mailInfoTable([
        ["Verfügbarkeit", escapeHtml(displayValue(record.availability)).replace(/\n/g, "<br>")],
        ["Vorlaufzeit", escapeHtml(displayValue(record.lead_time))],
      ])}
      ${mailHeading("Kontakt")}
      ${mailInfoTable([
        ["Name", escapeHtml(fullName(record))],
        ["E-Mail", escapeHtml(displayValue(record.email))],
        ["Telefon", escapeHtml(displayValue(record.phone))],
        ["Geburtsdatum", escapeHtml(displayValue(record.birthdate))],
        ["Registrierungstyp", escapeHtml(displayValue(record.registration_type))],
      ])}
      ${workerDocumentsHtml(record)}
      ${certificatePreview}
      ${mailHeading("Bestätigungen")}
      ${mailInfoTable([
        ["AGB akzeptiert", escapeHtml(displayValue(record.terms_accepted))],
        ["Datenschutz akzeptiert", escapeHtml(displayValue(record.privacy_accepted))],
        ["Qualifikation bestätigt", escapeHtml(displayValue(record.qualification_confirmed))],
        ["Selbstständigkeit bestätigt", escapeHtml(displayValue(record.adult_self_employed_confirmed))],
        ["Kinderbetreuung", childcareNotice],
      ])}
    `,
  });
};

const welcomeMailBody = (record: WorkerRecord) => {
  const greetingName = firstName(record) || "Heinzelchen";

  return `Moin ${greetingName},

wir freuen uns sehr Dich als Heinzelchen für ${skillsText(record)} begrüßen zu dürfen. Wir werden Dich mit passenden Aufgaben in Deiner Umgebung belohnen.

Behalte Deine Mailbox aktiv im Auge, damit Du keine attraktiven Arbeitsgelegenheiten verpasst.

Solltest Du Deine Angaben (Stundenlohn, Dienstleistungsbereiche usw.) ändern wollen oder irgendwelche Fragen haben, kontaktiere uns gerne jederzeit.

Herzliche Grüße

Dein Heinzelchen-Team

E-Mail: info@heinzelchen.com

Telefon: 0174 2997866

Datenschutzerklärung:
${PRIVACY_URL}

Nutzungsbedingungen:
${TERMS_URL}
`;
};

const welcomeMailHtml = (record: WorkerRecord) => {
  const greetingName = escapeHtml(firstName(record) || "Heinzelchen");
  const escapedSkills = escapeHtml(skillsText(record));

  return renderMailLayout({
    title: "Willkommen bei den Heinzelchen",
    preheader: "Ihre Registrierung ist bei uns eingegangen.",
    children: `
      ${mailParagraph(`Moin ${greetingName},`)}
      ${mailParagraph(`wir freuen uns sehr Dich als Heinzelchen für ${escapedSkills} begrüßen zu dürfen. Wir werden Dich mit passenden Aufgaben in Deiner Umgebung belohnen.`)}
      ${mailParagraph("Behalte Deine Mailbox aktiv im Auge, damit Du keine attraktiven Arbeitsgelegenheiten verpasst.")}
      ${mailParagraph("Solltest Du Deine Angaben (Stundenlohn, Dienstleistungsbereiche usw.) ändern wollen oder irgendwelche Fragen haben, kontaktiere uns gerne jederzeit.")}
      ${mailParagraph("Herzliche Grüße<br>Dein Heinzelchen-Team")}
      ${mailParagraph(`E-Mail: ${mailLink("mailto:info@heinzelchen.com", "info@heinzelchen.com")}<br>Telefon: ${mailLink("tel:+491742997866", "0174 2997866")}`)}
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
    const attachments = workerDocumentAttachments(record);
    const certificateAttachment = childcareCertificateAttachment(record);
    const allAttachments = attachments.length ? attachments : (certificateAttachment ? [certificateAttachment] : undefined);

    await transporter.sendMail({
      from: "Heinzelchen Registrierungen <registrierungen@heinzelchen.com>",
      to: "registrierungen@heinzelchen.com",
      replyTo: workerEmail,
      subject: `Neue Heinzelchen-Registrierung – ${workerName}`,
      text: internalMailBody(record),
      html: internalMailHtml(record),
      attachments: allAttachments,
    });
    console.log("Internal registration mail sent to registrierungen@heinzelchen.com");

    await transporter.sendMail({
      from: "Heinzelchen <registrierungen@heinzelchen.com>",
      to: workerEmail,
      bcc: "registrierungen@heinzelchen.com",
      replyTo: "info@heinzelchen.com",
      subject: "Willkommen bei den Heinzelchen!",
      text: welcomeMailBody(record),
      html: welcomeMailHtml(record),
    });
    console.log(`Welcome mail sent to ${workerEmail} with bcc to registrierungen@heinzelchen.com`);

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
