const state = {
  applications: [],
  bookings: [],
  workers: [],
  activeWorkers: [],
  availabilities: [],
  availableToday: [],
  emailLogs: [],
};

const bookingStatuses = ["Neu", "Zugewiesen", "Unterwegs", "Erledigt", "Storniert"];
const els = {
  stats: document.querySelector("#adminStats"),
  applications: document.querySelector("#adminApplications"),
  recentBookings: document.querySelector("#adminRecentBookings"),
  bookings: document.querySelector("#adminBookings"),
  workers: document.querySelector("#adminWorkers"),
  availableToday: document.querySelector("#adminAvailableToday"),
  availabilityCalendar: document.querySelector("#adminAvailabilityCalendar"),
  emailLogs: document.querySelector("#adminEmailLogs"),
};

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Admin-Anfrage fehlgeschlagen.");
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function customerName(booking) {
  return `${booking.customer?.firstName || ""} ${booking.customer?.lastName || ""}`.trim() || "Kunde";
}

function bookingTitle(booking) {
  return booking.services?.join(", ") || booking.extraTask || "Auftrag";
}

function address(customer = {}) {
  return [customer.street, customer.zip, customer.city].filter(Boolean).join(", ");
}

function workerName(id) {
  return state.workers.find((worker) => worker.id === id)?.name || "";
}

function statusClass(status = "") {
  return `status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function activeWorkerOptions(selectedId = "") {
  return `<option value="">Nicht zugewiesen</option>${state.activeWorkers.map((worker) =>
    `<option value="${escapeHtml(worker.id)}" ${worker.id === selectedId ? "selected" : ""}>${escapeHtml(worker.name || worker.email || "Arbeiter")}</option>`
  ).join("")}`;
}

function statusOptions(selected = "Neu") {
  return bookingStatuses.map((status) =>
    `<option value="${status}" ${selected === status ? "selected" : ""}>${status}</option>`
  ).join("");
}

function table(headers, rows, emptyText) {
  if (!rows.length) return `<div class="admin-empty">${emptyText}</div>`;
  return `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table></div>`;
}

function renderStats() {
  const today = new Date().toISOString().slice(0, 10);
  const bookingsToday = state.bookings.filter((booking) => booking.appointment?.date === today).length;
  const sentEmails = state.emailLogs.filter((log) => (log.status || "").toLowerCase() === "verschickt").length;
  const cards = [
    ["Buchungen heute", bookingsToday, "📋"],
    ["Aktive Arbeiter", state.activeWorkers.length, "👷"],
    ["Offene Bewerbungen", state.applications.length, "🪪"],
    ["Emails verschickt", sentEmails, "📧"],
  ];
  els.stats.innerHTML = cards.map(([label, value, icon]) => `<article class="admin-stat-card">
    <span>${icon}</span>
    <div><strong>${value}</strong><p>${label}</p></div>
  </article>`).join("");
}

function renderApplications() {
  els.applications.innerHTML = state.applications.length ? state.applications.map((worker) => `<article class="admin-application-card">
    <div>
      <strong>${escapeHtml(worker.name || "Name offen")}</strong>
      <span>${escapeHtml(worker.email || "-")}</span>
      <small>${escapeHtml(worker.phone || "-")} · ${escapeHtml(worker.city || "-")}</small>
    </div>
    <div class="admin-actions">
      <button type="button" data-id-card="${escapeHtml(worker.id)}">Ausweis ansehen</button>
      <button type="button" data-review="${escapeHtml(worker.id)}" data-status="active">Freischalten</button>
      <button class="danger" type="button" data-review="${escapeHtml(worker.id)}" data-status="rejected">Ablehnen</button>
    </div>
  </article>`).join("") : `<div class="admin-empty">Keine neuen Bewerbungen.</div>`;
}

function renderRecentBookings() {
  const rows = state.bookings.slice(0, 5).map((booking) => `<tr>
    <td><strong>${escapeHtml(customerName(booking))}</strong><span>${escapeHtml(bookingTitle(booking))}</span></td>
    <td>${formatDate(booking.appointment?.date)}<span>${escapeHtml(booking.appointment?.time || "-")} Uhr</span></td>
    <td><span class="admin-badge ${statusClass(booking.status)}">${escapeHtml(booking.status || "Neu")}</span></td>
  </tr>`);
  els.recentBookings.innerHTML = table(["Kunde", "Termin", "Status"], rows, "Noch keine Buchungen vorhanden.");
}

function renderBookings() {
  const rows = state.bookings.map((booking) => `<tr>
    <td><strong>${escapeHtml(customerName(booking))}</strong><span>${escapeHtml(booking.customer?.email || "")}</span></td>
    <td>${escapeHtml(bookingTitle(booking))}</td>
    <td>${formatDate(booking.appointment?.date)}</td>
    <td>${escapeHtml(booking.appointment?.time || "-")} Uhr</td>
    <td>${escapeHtml(address(booking.customer) || "Adresse offen")}</td>
    <td><select data-booking-status="${escapeHtml(booking.id)}">${statusOptions(booking.status || "Neu")}</select></td>
    <td><select data-booking-worker="${escapeHtml(booking.id)}">${activeWorkerOptions(booking.assignedWorkerId)}</select></td>
    <td><button class="danger small" type="button" data-cancel-booking="${escapeHtml(booking.id)}">Stornieren</button></td>
  </tr>`);
  els.bookings.innerHTML = table(["Kunde", "Dienst", "Datum", "Uhrzeit", "Adresse", "Status", "Arbeiter", ""], rows, "Keine Buchungen vorhanden.");
}

function renderWorkers() {
  const rows = state.workers.map((worker) => `<tr>
    <td><strong>${escapeHtml(worker.name || "Name offen")}</strong><span>${escapeHtml(worker.phone || "")}</span></td>
    <td>${escapeHtml(worker.email || "-")}</td>
    <td>${escapeHtml(worker.city || "-")}</td>
    <td>${escapeHtml((worker.skills || []).join(", ") || "-")}</td>
    <td><span class="admin-badge ${statusClass(worker.status || "pending")}">${escapeHtml(worker.status || "pending")}</span></td>
    <td>${worker.verified ? "Ja" : "Nein"}</td>
    <td>
      <div class="admin-row-actions">
        <button type="button" data-id-card="${escapeHtml(worker.id)}">Ausweis</button>
        ${worker.status === "active"
          ? `<button class="danger" type="button" data-review="${escapeHtml(worker.id)}" data-status="rejected">Sperren</button>`
          : `<button type="button" data-review="${escapeHtml(worker.id)}" data-status="active">Freischalten</button>`}
      </div>
    </td>
  </tr>`);
  els.workers.innerHTML = table(["Name", "Email", "Stadt", "Skills", "Status", "Verifiziert", "Aktion"], rows, "Keine Arbeiter vorhanden.");
}

function renderAvailability() {
  els.availableToday.innerHTML = state.availableToday.length ? state.availableToday.map((slot) => `<article class="admin-mini-card">
    <strong>${escapeHtml(slot.worker?.name || "Arbeiter")}</strong>
    <span>${escapeHtml(slot.from)} - ${escapeHtml(slot.until)} Uhr</span>
    <small>${escapeHtml(slot.worker?.city || "-")}</small>
  </article>`).join("") : `<div class="admin-empty">Heute ist noch niemand verfügbar eingetragen.</div>`;

  const byDate = new Map();
  state.availabilities.forEach((slot) => {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date).push(slot);
  });
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const slots = byDate.get(key) || [];
    return `<div class="admin-calendar-day ${slots.length ? "has-slots" : ""}">
      <strong>${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</strong>
      <span>${slots.length ? `${slots.length} Slot${slots.length === 1 ? "" : "s"}` : "frei"}</span>
    </div>`;
  });
  els.availabilityCalendar.innerHTML = `<div class="admin-calendar-grid">${days.join("")}</div>`;
}

function renderEmailLogs() {
  const rows = state.emailLogs.map((log) => `<tr>
    <td>${escapeHtml(log.to || log.recipient || "-")}</td>
    <td><strong>${escapeHtml(log.subject || "Email")}</strong>${log.error ? `<span>${escapeHtml(log.error)}</span>` : ""}</td>
    <td>${formatDateTime(log.createdAt || log.created_at)}</td>
    <td><span class="admin-badge ${statusClass(log.status || "")}">${escapeHtml(log.status || "-")}</span></td>
  </tr>`);
  els.emailLogs.innerHTML = table(["Empfänger", "Betreff", "Zeitstempel", "Status"], rows, "Noch keine Emails protokolliert.");
}

function bindActions() {
  document.querySelectorAll("[data-id-card]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const payload = await adminApi(`/api/admin/workers/${button.dataset.idCard}/id-card`);
        window.open(payload.url, "_blank", "noopener");
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-review]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminApi(`/api/admin/workers/${button.dataset.review}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.status }),
      });
      await loadAdmin();
    });
  });

  document.querySelectorAll("[data-booking-status]").forEach((select) => {
    select.addEventListener("change", async () => {
      await adminApi(`/api/admin/bookings/${select.dataset.bookingStatus}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      await loadAdmin();
    });
  });

  document.querySelectorAll("[data-booking-worker]").forEach((select) => {
    select.addEventListener("change", async () => {
      await adminApi(`/api/admin/bookings/${select.dataset.bookingWorker}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ workerId: select.value }),
      });
      await loadAdmin();
    });
  });

  document.querySelectorAll("[data-cancel-booking]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminApi(`/api/admin/bookings/${button.dataset.cancelBooking}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Storniert" }),
      });
      await loadAdmin();
    });
  });
}

function renderAll() {
  renderStats();
  renderApplications();
  renderRecentBookings();
  renderBookings();
  renderWorkers();
  renderAvailability();
  renderEmailLogs();
  bindActions();
}

async function loadAdmin() {
  const data = await adminApi("/api/admin/overview");
  Object.assign(state, {
    applications: data.applications || [],
    bookings: data.bookings || [],
    workers: data.workers || [],
    activeWorkers: data.activeWorkers || (data.workers || []).filter((worker) => worker.status === "active"),
    availabilities: data.availabilities || [],
    availableToday: data.availableToday || [],
    emailLogs: data.emailLogs || [],
  });
  renderAll();
}

document.querySelectorAll("[data-admin-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-admin-view]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.viewPanel === button.dataset.adminView);
    });
  });
});

document.querySelector("[data-admin-refresh]")?.addEventListener("click", () => loadAdmin().catch((error) => alert(error.message)));

loadAdmin().catch((error) => {
  document.querySelector(".admin-main").insertAdjacentHTML("beforeend", `<div class="admin-toast">${escapeHtml(error.message)}</div>`);
});
