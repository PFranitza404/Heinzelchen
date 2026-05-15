const config = window.HH_ADMIN_CONFIG;
const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const lockKey = "hh_admin_lock";
const loginStartedKey = "hh_admin_login_started";
const sessionMs = 8 * 60 * 60 * 1000;

const loginView = document.querySelector("[data-login-view]");
const dashboard = document.querySelector("[data-dashboard]");
const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");
const statsEl = document.querySelector("#stats");
const bookingsEl = document.querySelector("#bookings");
const workersEl = document.querySelector("#workers");
const assignmentsEl = document.querySelector("#assignments");

async function api(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Nicht eingeloggt.");
  const response = await fetch(`${config.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "API-Fehler");
  return payload;
}

function formatAddress(customer = {}) {
  return [customer.street, customer.zip, customer.city].filter(Boolean).join(", ");
}

function bookingTitle(booking) {
  const name = `${booking.customer?.firstName || ""} ${booking.customer?.lastName || ""}`.trim();
  return `${booking.services?.join(", ") || booking.extraTask || "Freie Aufgabe"} - ${name || "Kunde"}`;
}

function availabilityText(worker) {
  const entries = Object.entries(worker.availability || {});
  return entries.length ? entries.map(([day, times]) => `${day}: ${times.join(", ")}`).join(" · ") : "Keine Verfügbarkeit";
}

function workerOptions(workers, currentId) {
  return `<option value="">Student auswählen</option>${workers.map((worker) => (
    `<option value="${worker.id}" ${worker.id === currentId ? "selected" : ""}>${worker.name} · ${worker.serviceArea || worker.city || "Gebiet offen"}</option>`
  )).join("")}`;
}

function statusOptions(current) {
  return ["Neu", "Zugewiesen", "Erledigt"].map((status) => (
    `<option value="${status}" ${status === current ? "selected" : ""}>${status}</option>`
  )).join("");
}

function showLogin(message = "") {
  dashboard.hidden = true;
  loginView.hidden = false;
  loginMessage.textContent = message;
}

function showDashboard() {
  loginView.hidden = true;
  dashboard.hidden = false;
}

async function renderDashboard() {
  const loginStarted = Number(localStorage.getItem(loginStartedKey) || 0);
  if (!loginStarted || Date.now() - loginStarted > sessionMs) {
    await supabase.auth.signOut();
    showLogin("Sitzung abgelaufen. Bitte erneut einloggen.");
    return;
  }

  const overview = await api("/api/overview");
  const { bookings, workers, assignments } = overview;
  const openBookings = bookings.filter((booking) => booking.status !== "Erledigt");

  statsEl.innerHTML = `
    <article><strong>${bookings.length}</strong><span>Buchungen gesamt</span></article>
    <article><strong>${bookings.filter((booking) => booking.status === "Neu").length}</strong><span>Neu</span></article>
    <article><strong>${assignments.length}</strong><span>Aktive Zuordnungen</span></article>
    <article><strong>${workers.length}</strong><span>Studenten</span></article>`;

  bookingsEl.innerHTML = bookings.length ? bookings.map((booking) => {
    const worker = workers.find((item) => item.id === booking.assignedWorkerId);
    return `<article class="card">
      <div class="card-head"><strong>${bookingTitle(booking)}</strong><span class="status ${booking.status}">${booking.status}</span></div>
      <p>${booking.appointment?.date || "-"} um ${booking.appointment?.time || "-"} Uhr · ${booking.duration || "Dauer offen"}</p>
      <small>${formatAddress(booking.customer) || "Adresse offen"} · Student: ${worker?.name || "nicht zugewiesen"}</small>
      <div class="actions">
        <label>Status<select data-status="${booking.id}">${statusOptions(booking.status)}</select></label>
        <label>Zuweisen<select data-assign="${booking.id}">${workerOptions(workers, booking.assignedWorkerId)}</select></label>
        <button type="button" data-auto="${booking.id}">Automatisch suchen</button>
      </div>
    </article>`;
  }).join("") : "<p>Keine Buchungen vorhanden.</p>";

  workersEl.innerHTML = workers.length ? workers.map((worker) => {
    const activeJobs = openBookings.filter((booking) => booking.assignedWorkerId === worker.id);
    return `<article class="card">
      <div class="card-head"><strong>${worker.name}</strong><span>${activeJobs.length ? `${activeJobs.length} aktiv` : "frei"}</span></div>
      <p>${worker.city || "Ort offen"} · ${worker.serviceArea || worker.city || "Einsatzgebiet offen"}</p>
      <small>${worker.skills?.join(", ") || "Keine Skills"}</small>
      <small>${availabilityText(worker)}</small>
    </article>`;
  }).join("") : "<p>Keine Studenten registriert.</p>";

  assignmentsEl.innerHTML = assignments.length ? assignments.map(({ booking, worker }) => `<article class="card">
    <strong>${worker?.name || "Unbekannt"}</strong>
    <p>${booking.services?.join(", ") || booking.extraTask || "Freie Aufgabe"}</p>
    <small>${booking.appointment?.date || "-"} · ${formatAddress(booking.customer) || "Adresse offen"}</small>
  </article>`).join("") : "<p>Keine aktiven Zuordnungen.</p>";

  bookingsEl.querySelectorAll("[data-assign]").forEach((select) => {
    select.addEventListener("change", async () => {
      if (!select.value) return;
      await api(`/api/bookings/${select.dataset.assign}/assign`, { method: "PATCH", body: JSON.stringify({ workerId: select.value }) });
      await renderDashboard();
    });
  });
  bookingsEl.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", async () => {
      await api(`/api/bookings/${select.dataset.status}/status`, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
      await renderDashboard();
    });
  });
  bookingsEl.querySelectorAll("[data-auto]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/bookings/${button.dataset.auto}/auto-assign`, { method: "POST" });
      await renderDashboard();
    });
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const loginResponse = await fetch(`${config.apiBase}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
  });
  const loginPayload = await loginResponse.json().catch(() => ({}));
  if (!loginResponse.ok) {
    loginMessage.textContent = loginPayload.error || "Login fehlgeschlagen.";
    return;
  }
  const { error } = await supabase.auth.setSession({
    access_token: loginPayload.access_token,
    refresh_token: loginPayload.refresh_token,
  });
  if (error) return showLogin("Session konnte nicht gespeichert werden.");
  try {
    await api("/api/session");
    localStorage.removeItem(lockKey);
    localStorage.setItem(loginStartedKey, String(Date.now()));
    loginForm.reset();
    showDashboard();
    await renderDashboard();
  } catch {
    await supabase.auth.signOut();
    showLogin("Dieser Account hat keine Admin-Berechtigung.");
  }
});

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  localStorage.removeItem(loginStartedKey);
  showLogin();
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return showLogin();
  try {
    await api("/api/session");
    showDashboard();
    await renderDashboard();
  } catch {
    await supabase.auth.signOut();
    showLogin("Bitte als Admin einloggen.");
  }
})();
