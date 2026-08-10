const {
  renderMailLayout,
  mailParagraph,
  mailLink,
} = require("./html-mail-template");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));

const stripHouseNumber = (street) =>
  String(street || "")
    .replace(/\s+\d+[a-zA-Z]?(?:\s*[-/]\s*\d+[a-zA-Z]?)?\s*$/, "")
    .trim();

const formatDate = (isoDate) => {
  if (!isoDate) return "-";
  const date = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const fullName = (parts) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

const firstAppointment = (booking) => {
  const appointments = booking.availability?.serviceAppointments || booking.raw_payload?.availability?.serviceAppointments;
  const first = Array.isArray(appointments) ? appointments[0] : null;
  const window = Array.isArray(first?.windows) ? first.windows[0] : null;
  const time = Array.isArray(window?.times) ? window.times[0] : null;
  return {
    service: first?.service,
    duration: first?.duration,
    frequency: first?.frequency,
    date: window?.date,
    from: time?.from,
    to: time?.to,
  };
};

const appointmentOptions = (booking) => {
  const appointments = booking.availability?.serviceAppointments || booking.raw_payload?.availability?.serviceAppointments;
  const items = Array.isArray(appointments) ? appointments : [];
  const options = items.flatMap((appointment) => {
    const service = appointment?.service || "";
    const windows = Array.isArray(appointment?.windows) ? appointment.windows : [];
    return windows.flatMap((window) => {
      const times = Array.isArray(window?.times) ? window.times : [];
      return times.map((time) => ({
        service,
        date: window?.date || "",
        dateEnd: window?.dateEnd || "",
        from: time?.from || "",
        to: time?.to || "",
      }));
    });
  }).filter((option) => option.date || option.from || option.to);

  if (options.length) return options;

  const fallback = firstAppointment(booking);
  return [{
    service: fallback.service || "",
    date: fallback.date || booking.date || booking.raw_payload?.appointment?.date || "",
    dateEnd: "",
    from: fallback.from || booking.time || booking.raw_payload?.appointment?.time || "",
    to: fallback.to || "",
  }];
};

const appointmentOptionText = (option) => {
  const dateText = option.dateEnd
    ? `${formatDate(option.date)} bis ${formatDate(option.dateEnd)}`
    : formatDate(option.date);
  const timeText = option.from && option.to
    ? `zwischen ${option.from} und ${option.to} Uhr`
    : option.from ? `ab ${option.from} Uhr` : "nach Absprache";
  return [option.service, `${dateText} ${timeText}`].filter(Boolean).join(": ");
};

const appointmentOptionsText = (booking) =>
  appointmentOptions(booking).map((option, index) => `${index + 1}. ${appointmentOptionText(option)}`).join("\n");

const appointmentOptionsHtml = (booking) =>
  appointmentOptions(booking).map((option, index) => `${index + 1}. ${escapeHtml(appointmentOptionText(option))}`).join("<br>");

const workerFirstName = (worker) =>
  worker.first_name ||
  worker.firstName ||
  fullName([worker.name]).split(/\s+/).filter(Boolean)[0] ||
  "Heinzelchen";

const serviceCategory = (booking, appointment) =>
  appointment.service ||
  (Array.isArray(booking.services) ? booking.services[0] : "") ||
  booking.dienst ||
  "Auftrag";

const serviceDescription = (booking, category = "") => {
  const tasks = booking.detail_notes?.care?.tasks || booking.raw_payload?.detailNotes?.care?.tasks;
  if (/betreuung|kinder/i.test(category) && Array.isArray(tasks) && tasks.length) return tasks.join(", ");

  const detailNotes = booking.detail_notes || booking.raw_payload?.detailNotes || {};
  if (/garten/i.test(category)) {
    const garden = detailNotes.garden || {};
    const gardenTasks = Array.isArray(garden.tasks) ? garden.tasks.filter(Boolean).join(", ") : "";
    const custom = garden.custom || "";
    const size = garden.size ? ` (${garden.size})` : "";
    const material = garden.materialEquipment ? `; Material/Equipment: ${garden.materialEquipment}` : "";
    if (gardenTasks || custom || material) return `${gardenTasks || custom}${size}${material}`.trim();
  }

  const matchingDetails = Object.values(detailNotes)
    .filter((detail) => detail && typeof detail === "object")
    .flatMap((detail) => [
      ...(Array.isArray(detail.tasks) ? detail.tasks : []),
      detail.custom,
      detail.materialEquipment ? `Material/Equipment: ${detail.materialEquipment}` : "",
    ])
    .filter(Boolean);
  if (matchingDetails.length) return matchingDetails.join(", ");

  const extraTask = booking.extra_task || booking.raw_payload?.extraTask || "";
  return extraTask
    .replace(/^Betreuung Aufgaben:\s*/i, "")
    .replace(/^Gartenfläche:\s*/im, "")
    .replace(/^Garten Dienste:\s*/im, "")
    .replace(/\n+/g, ", ")
    .trim() || category;
};

function buildManualWorkerAssignmentMail({ booking, worker }) {
  const appointment = firstAppointment(booking);
  const category = serviceCategory(booking, appointment);
  const service = serviceDescription(booking, category);
  const street = stripHouseNumber(booking.street || booking.raw_payload?.customer?.street);
  const city = booking.city || booking.raw_payload?.customer?.city || "";
  const duration = appointment.duration || booking.raw_payload?.duration || booking.duration || "";
  const frequency = appointment.frequency || booking.frequency || booking.raw_payload?.frequency || "";
  const timeWindows = appointmentOptionsText(booking);
  const timeWindowsHtml = appointmentOptionsHtml(booking);
  const greeting = `Moin ${workerFirstName(worker)},`;

  const plainText = `${greeting}

Es gibt einen neuen Auftrag in Deiner Nähe. Sichere ihn Dir, bevor ein anderes Heinzelchen zuschlägt!

Was: ${category}${service && service !== category ? ` - ${service}` : ""} - ca. ${duration}

Wo: ${street}, ${city}

Wann:
${timeWindows}

Häufigkeit: ${frequency}

Die angegebene Dauer ist eine Schätzung des Kunden, woran Du Dich orientieren kannst. Dein Lohn entspricht Deinem bei uns hinterlegtem Stundenlohn multipliziert mit der finalen Dauer, die Du zur Erledigung der Aufgabe brauchst. Du regelst die Bezahlung nach Abschluss des Auftrags direkt und selbst mit dem Kunden.

Interesse? Schreib uns eine kurze Mail, ob einer der vorgeschlagenen Termine für Dich passt und wann Du konkret vor Ort sein kannst. Dann lassen wir Dich schnellstmöglich wissen, ob der Kunde Deinen Termin und Stundenlohn annimmt.

Herzliche Grüße

Dein Heinzelchen-Team

Kontaktdaten
info@heinzelchen.com
0174 2997866

Datenschutzerklärung: https://heinzelchen.com/datenschutz.html
Nutzungsbedingungen: https://heinzelchen.com/nutzungsbedingungen.html`;

  const html = renderMailLayout({
    title: "Neuer Auftrag in Deiner Nähe",
    preheader: "Es gibt einen neuen Auftrag in Deiner Nähe.",
    children: `
      ${mailParagraph(escapeHtml(greeting))}
      ${mailParagraph("Es gibt einen neuen Auftrag in Deiner Nähe. Sichere ihn Dir, bevor ein anderes Heinzelchen zuschlägt!")}
      ${mailParagraph(`<strong>Was:</strong> ${escapeHtml(category)}${service && service !== category ? ` - ${escapeHtml(service)}` : ""} - ca. ${escapeHtml(duration)}`)}
      ${mailParagraph(`<strong>Wo:</strong> ${escapeHtml(street)}, ${escapeHtml(city)}`)}
      ${mailParagraph(`<strong>Wann:</strong><br>${timeWindowsHtml}<br><strong>Häufigkeit:</strong> ${escapeHtml(frequency)}`)}
      ${mailParagraph("Die angegebene Dauer ist eine Schätzung des Kunden, woran Du Dich orientieren kannst. Dein Lohn entspricht Deinem bei uns hinterlegtem Stundenlohn multipliziert mit der finalen Dauer, die Du zur Erledigung der Aufgabe brauchst. Du regelst die Bezahlung nach Abschluss des Auftrags direkt und selbst mit dem Kunden.")}
      ${mailParagraph("Interesse? Schreib uns eine kurze Mail, ob einer der vorgeschlagenen Termine für Dich passt und wann Du konkret vor Ort sein kannst. Dann lassen wir Dich schnellstmöglich wissen, ob der Kunde Deinen Termin und Stundenlohn annimmt.")}
      ${mailParagraph("Herzliche Grüße<br><br>Dein Heinzelchen-Team")}
      ${mailParagraph(`<strong>Kontaktdaten</strong><br>${mailLink("mailto:info@heinzelchen.com", "info@heinzelchen.com")}<br>${mailLink("tel:+491742997866", "0174 2997866")}`)}
      ${mailParagraph(`${mailLink("https://heinzelchen.com/datenschutz.html", "Datenschutzerklärung")}<br>${mailLink("https://heinzelchen.com/nutzungsbedingungen.html", "Nutzungsbedingungen")}`)}
    `,
  });

  return {
    subject: `Neuer Auftrag in Deiner Nähe: ${category}`,
    text: plainText,
    html,
  };
}

module.exports = {
  buildManualWorkerAssignmentMail,
  fullName,
};
