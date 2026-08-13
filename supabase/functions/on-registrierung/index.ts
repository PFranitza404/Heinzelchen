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
  if (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) return "-";
  return JSON.stringify(value, null, 2);
};

const yesNo = (value: unknown) => value === true ? "Ja" : value === false ? "Nein" : displayValue(value);

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

const serviceDetails = (record: WorkerRecord): Array<Record<string, unknown>> => {
  const source = parseStructuredValue(record.service_details ?? record.raw_payload?.serviceDetails ?? record.raw_payload?.service_details);
  if (Array.isArray(source)) return source.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (source && typeof source === "object") return [source as Record<string, unknown>];
  return [];
};

const serviceLabel = (detail: Record<string, unknown>) =>
  textValue(detail.service) || textValue(detail.name) || "Dienstleistung";

const hourlyRateLabel = (detail: Record<string, unknown>) => {
  const rateValue = detail.hourlyRate ?? detail.hourly_rate ?? detail.rate;
  const rate = typeof rateValue === "number" ? String(rateValue) : textValue(rateValue);
  return rate ? `${rate} EUR/Stunde` : "kein Stundenlohn angegeben";
};

const normalizeService = (value: unknown) =>
  displayValue(value)
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "");

const orderedServices = [
  { label: "Gartenarbeit", aliases: ["gartenarbeit", "garten"] },
  { label: "Reinigung", aliases: ["reinigung", "hausreinigung", "reinigungputzen"] },
  { label: "Bügeln", aliases: ["buegeln", "bugeln", "waescheservice", "wascheservice"] },
  { label: "Nachhilfe", aliases: ["nachhilfe"] },
  { label: "Kinderbetreuung", aliases: ["kinderbetreuung"] },
  { label: "Haustierbetreuung", aliases: ["haustierbetreuung", "haustiere", "tierbetreuung"] },
  { label: "Aufbau/Montage", aliases: ["aufbaumontage", "aufbau", "montage"] },
  { label: "Malerarbeiten", aliases: ["malerarbeiten", "malereiarbeiten"] },
  { label: "Sonstiges", aliases: ["sonstiges", "sonstige"] },
];

const detailForService = (details: Array<Record<string, unknown>>, service: (typeof orderedServices)[number]) =>
  details.find((detail) => {
    const normalized = normalizeService(serviceLabel(detail));
    return service.aliases.some((alias) => normalized === alias || normalized.includes(alias));
  });

const orderedServiceRows = (record: WorkerRecord) => {
  const details = serviceDetails(record);
  const skillText = normalizeService(skillsText(record));

  return orderedServices.map((service) => {
    const detail = detailForService(details, service);
    const selected = Boolean(detail) || service.aliases.some((alias) => skillText.includes(alias));
    return [
      service.label,
      selected ? `Ja - gewünschter Stundenlohn: ${detail ? hourlyRateLabel(detail) : "nicht angegeben"}` : "Nein",
    ] as [string, string];
  });
};

const orderedServiceText = (record: WorkerRecord) =>
  orderedServiceRows(record).map(([service, value]) => `${service}: ${value}`).join("\n");

const ageFromBirthdate = (birthdate: unknown) => {
  const value = textValue(birthdate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
};

const birthdateWithAgeNotice = (record: WorkerRecord) => {
  const birthdate = displayValue(record.birthdate);
  const age = ageFromBirthdate(record.birthdate);
  if (age === null) return birthdate;
  return age > 30 ? `${birthdate} - ACHTUNG: älter als 30 Jahre (${age})` : `${birthdate} (${age} Jahre)`;
};

const compactGrades = (grades: unknown) => {
  if (!Array.isArray(grades) || !grades.length) return "";
  const numbers = grades
    .map((grade) => Number(String(grade).replace(/\D/g, "")))
    .filter((grade) => Number.isFinite(grade))
    .sort((a, b) => a - b);

  if (numbers.length === grades.length && numbers.length > 1) {
    const ranges: string[] = [];
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

  return displayValue(grades);
};

const tutoringInfo = (record: WorkerRecord) => {
  const detail = detailForService(serviceDetails(record), orderedServices[3]);
  if (!detail) return "";

  const subjects = displayValue(detail.tutoringSubjects);
  const grades = compactGrades(detail.tutoringGrades);
  const byGrade = displayValue(detail.tutoringByGrade);
  const parts = [
    subjects !== "-" && grades ? `${subjects} in den Klassen ${grades}` : "",
    subjects !== "-" && !grades ? `Fächer: ${subjects}` : "",
    byGrade !== "-" ? `Zuordnung nach Klasse: ${byGrade}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join("; ") : "Nachhilfe ausgewählt, keine Fächer/Klassen angegeben";
};

const additionalInformation = (record: WorkerRecord) => {
  const details = serviceDetails(record);
  const otherDetail = detailForService(details, orderedServices[8]);
  const items = [
    tutoringInfo(record),
    textValue(record.extra_skills) ? `Zusätzliche Skills: ${textValue(record.extra_skills)}` : "",
    otherDetail && textValue(otherDetail.description) ? `Sonstiges: ${textValue(otherDetail.description)}` : "",
    otherDetail && textValue(otherDetail.details) ? `Sonstiges: ${textValue(otherDetail.details)}` : "",
  ].filter(Boolean);
  return items.length ? items.join("\n") : "-";
};

const regionValue = (record: WorkerRecord) => {
  const values = [displayValue(record.service_area), displayValue(record.local_areas)].filter((value) => value !== "-");
  return values.length ? values.join(" / ") : "-";
};

const addressValue = (record: WorkerRecord) => {
  const cityLine = [displayValue(record.zip), displayValue(record.city)].filter((value) => value !== "-").join(" ");
  const values = [displayValue(record.street), cityLine].filter(Boolean);
  return values.length ? values.join(", ") : "-";
};

const availabilityValue = (record: WorkerRecord) => displayValue(record.availability);

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
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const contentType = textValue(certificateDocument?.type) || childcareCertificateType(record) || match[1];
  return {
    filename: textValue(certificateDocument?.name) || childcareCertificateName(record) || "fuehrungszeugnis.jpg",
    content: match[2],
    encoding: "base64",
    contentType,
    cid: contentType.startsWith("image/") ? "childcare-certificate@heinzelchen" : undefined,
  };
};

const workerDocumentAttachments = (record: WorkerRecord) =>
  workerDocuments(record)
    .filter((doc) => textValue(doc.label) !== "Führungszeugnis")
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

const reversedName = (record: WorkerRecord) =>
  [lastName(record), firstName(record)].filter(Boolean).join(", ").trim() ||
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

  return `1. NACHNAME, VORNAME:

${reversedName(record)}

2. GEBURTSDATUM:

${birthdateWithAgeNotice(record)}

3. E-MAIL-ADRESSE:

${displayValue(record.email)}

4. TELEFONNUMMER:

${displayValue(record.phone)}

5. AUSGEWÄHLTE DIENSTLEISTUNGEN:

${orderedServiceText(record)}

6. WEITERFÜHRENDE INFORMATIONEN:

${additionalInformation(record)}

7. ANGEGEBENER STADTTEIL / REGION ALS EINSATZGEBIET:

${regionValue(record)}

8. WOHNADRESSE:

${addressValue(record)}

9. ANGEGEBENER RADIUS:

${displayValue(record.radius_km)} km

10. BEVORZUGTE ARBEITSZEITEN:

${availabilityValue(record)}
Vorlaufzeit: ${displayValue(record.lead_time)}

BESTÄTIGUNGEN:

AGB akzeptiert: ${yesNo(record.terms_accepted)}
Datenschutz akzeptiert: ${yesNo(record.privacy_accepted)}
Qualifikation bestätigt: ${yesNo(record.qualification_confirmed)}
Selbstständigkeit bestätigt: ${yesNo(record.adult_self_employed_confirmed)}
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
      ${certificateAttachment.cid
        ? `<img src="cid:childcare-certificate@heinzelchen" alt="Führungszeugnis" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid rgba(85,120,168,.22);border-radius:12px;margin:8px 0 16px;">`
        : mailParagraph("Das Führungszeugnis ist als Anhang beigefügt.")}`
    : "";

  return renderMailLayout({
    title: "Neue Heinzelchen-Registrierung",
    preheader: "Eine neue Heinzelchen-Registrierung ist eingegangen.",
    children: `
      ${mailHeading("1. Nachname, Vorname")}
      ${mailInfoTable([
        ["Name", escapeHtml(reversedName(record))],
      ])}
      ${mailHeading("2. Geburtsdatum")}
      ${mailInfoTable([
        ["Geburtsdatum", escapeHtml(birthdateWithAgeNotice(record))],
      ])}
      ${mailHeading("3. E-Mail-Adresse")}
      ${mailInfoTable([
        ["E-Mail", escapeHtml(displayValue(record.email))],
      ])}
      ${mailHeading("4. Telefonnummer")}
      ${mailInfoTable([
        ["Telefon", escapeHtml(displayValue(record.phone))],
      ])}
      ${mailHeading("5. Ausgewählte Dienstleistungen")}
      ${mailInfoTable(orderedServiceRows(record).map(([service, value]) => [
        service,
        escapeHtml(value),
      ]))}
      ${mailHeading("6. Weiterführende Informationen")}
      ${mailInfoTable([
        ["Informationen", escapeHtml(additionalInformation(record)).replace(/\n/g, "<br>")],
      ])}
      ${mailHeading("7. Angegebener Stadtteil / Region als Einsatzgebiet")}
      ${mailInfoTable([
        ["Einsatzgebiet", escapeHtml(regionValue(record))],
      ])}
      ${mailHeading("8. Wohnadresse")}
      ${mailInfoTable([
        ["Adresse", escapeHtml(addressValue(record))],
      ])}
      ${mailHeading("9. Angegebener Radius")}
      ${mailInfoTable([
        ["Radius", `${escapeHtml(displayValue(record.radius_km))} km`],
      ])}
      ${mailHeading("10. Bevorzugte Arbeitszeiten")}
      ${mailInfoTable([
        ["Arbeitszeiten", escapeHtml(availabilityValue(record)).replace(/\n/g, "<br>")],
        ["Vorlaufzeit", escapeHtml(displayValue(record.lead_time))],
      ])}
      ${workerDocumentsHtml(record)}
      ${certificatePreview}
      ${mailHeading("Bestätigungen")}
      ${mailInfoTable([
        ["AGB akzeptiert", escapeHtml(yesNo(record.terms_accepted))],
        ["Datenschutz akzeptiert", escapeHtml(yesNo(record.privacy_accepted))],
        ["Qualifikation bestätigt", escapeHtml(yesNo(record.qualification_confirmed))],
        ["Selbstständigkeit bestätigt", escapeHtml(yesNo(record.adult_self_employed_confirmed))],
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
    const allAttachments = [...attachments, certificateAttachment].filter(Boolean);

    await transporter.sendMail({
      from: "Heinzelchen Registrierungen <registrierungen@heinzelchen.com>",
      to: "registrierungen@heinzelchen.com",
      replyTo: workerEmail,
      subject: `Neue Heinzelchen-Registrierung – ${workerName}`,
      text: internalMailBody(record),
      html: internalMailHtml(record),
      attachments: allAttachments.length ? allAttachments : undefined,
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
