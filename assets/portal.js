const api = {
  async get(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("API-Fehler");
    return response.json();
  },
  async send(path, method, body) {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("API-Fehler");
    return response.json();
  },
};

function parseAvailability(text) {
  const availability = {};
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [day, times] = line.split(":");
      if (!day || !times) return;
      availability[day.trim()] = times.split(",").map((time) => time.trim()).filter(Boolean);
    });
  return availability;
}

function formatAddress(customer) {
  return [customer.street, customer.zip, customer.city].filter(Boolean).join(", ");
}

function bookingTitle(booking) {
  const name = `${booking.customer.firstName} ${booking.customer.lastName}`.trim();
  return `${booking.services.join(", ") || "Freie Aufgabe"} - ${name || "Kunde"}`;
}

async function renderAdminPortal() {
  const bookingsEl = document.querySelector("#adminBookings");
  const workersEl = document.querySelector("#adminWorkers");
  if (!bookingsEl || !workersEl) return;

  const [bookings, workers] = await Promise.all([api.get("/api/bookings"), api.get("/api/workers")]);

  workersEl.innerHTML = workers.length
    ? workers.map((worker) => `<article class="portal-card">
      <strong>${worker.name}</strong>
      <span>${worker.city || "Ort offen"}</span>
      <small>${worker.skills.join(", ") || "Keine Skills"}</small>
    </article>`).join("")
    : "<p>Noch keine Arbeiter angelegt.</p>";

  bookingsEl.innerHTML = bookings.length
    ? bookings.map((booking) => `<article class="portal-card">
      <div class="portal-card-head">
        <strong>${bookingTitle(booking)}</strong>
        <span>${booking.status}</span>
      </div>
      <p>${booking.appointment.date || "-"} um ${booking.appointment.time || "-"} Uhr</p>
      <p>${formatAddress(booking.customer) || "Adresse offen"}</p>
      <small>Dauer: ${booking.duration || "-"} · Häufigkeit: ${booking.frequency || "-"}</small>
      <label>Arbeiter zuweisen</label>
      <select data-assign="${booking.id}">
        <option value="">Bitte auswählen</option>
        ${workers.map((worker) => `<option value="${worker.id}" ${booking.assignedWorkerId === worker.id ? "selected" : ""}>${worker.name}</option>`).join("")}
      </select>
    </article>`).join("")
    : "<p>Noch keine Buchungsanfragen vorhanden.</p>";

  bookingsEl.querySelectorAll("[data-assign]").forEach((select) => {
    select.addEventListener("change", async () => {
      if (!select.value) return;
      await api.send(`/api/bookings/${select.dataset.assign}/assign`, "PATCH", { workerId: select.value });
      await renderAdminPortal();
    });
  });
}

async function renderWorkerPortal() {
  const form = document.querySelector("#workerForm");
  const assignmentsEl = document.querySelector("#workerAssignments");
  if (!form || !assignmentsEl) return;

  const [bookings, workers] = await Promise.all([api.get("/api/bookings"), api.get("/api/workers")]);
  const currentWorker = workers[0];
  const assignments = currentWorker ? bookings.filter((booking) => booking.assignedWorkerId === currentWorker.id) : [];

  assignmentsEl.innerHTML = assignments.length
    ? assignments.map((booking) => `<article class="portal-card">
      <strong>${bookingTitle(booking)}</strong>
      <p>${booking.appointment.date || "-"} um ${booking.appointment.time || "-"} Uhr</p>
      <p>${formatAddress(booking.customer) || "Adresse offen"}</p>
      <small>Status: ${booking.status}</small>
    </article>`).join("")
    : "<p>Noch keine Aufträge zugewiesen.</p>";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const skills = data.getAll("skills");
    const worker = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      city: data.get("city"),
      skills,
      availability: parseAvailability(data.get("availability") || ""),
    };
    await api.send("/api/workers", "POST", worker);
    document.querySelector("#workerFormMessage").textContent = "Profil gespeichert.";
    form.reset();
    await renderWorkerPortal();
  }, { once: true });
}

renderAdminPortal().catch(console.error);
renderWorkerPortal().catch(console.error);
