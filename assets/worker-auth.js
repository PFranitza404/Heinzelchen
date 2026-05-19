const workerSessionKey = "hh_worker_session";
const workerLoginStartedKey = "hh_worker_login_started";
const workerSessionMs = 8 * 60 * 60 * 1000;

function readWorkerSession() {
  try {
    return JSON.parse(localStorage.getItem(workerSessionKey) || "null");
  } catch {
    return null;
  }
}

function saveWorkerSession(session) {
  localStorage.setItem(workerSessionKey, JSON.stringify(session));
  localStorage.setItem(workerLoginStartedKey, String(Date.now()));
}

function clearWorkerSession() {
  localStorage.removeItem(workerSessionKey);
  localStorage.removeItem(workerLoginStartedKey);
}

async function workerApi(path, options = {}) {
  const session = readWorkerSession();
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Anfrage fehlgeschlagen.");
  return payload;
}

function initWorkerRegistration() {
  const form = document.querySelector("#workerRegisterForm");
  if (!form) return;
  const message = document.querySelector("#workerRegisterMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = Object.fromEntries(data.entries());
    const idCard = data.get("idCard");
    if (body.password !== body.passwordRepeat) {
      message.textContent = "Die Passwörter stimmen nicht überein.";
      return;
    }
    if (!idCard || !idCard.size) {
      message.textContent = "Bitte lade deinen Ausweis hoch.";
      return;
    }
    if (idCard.size > 10 * 1024 * 1024) {
      message.textContent = "Die Datei ist zu groß. Maximal erlaubt sind 10MB.";
      return;
    }
    try {
      await workerApi("/api/worker/register", {
        method: "POST",
        body: data,
      });
      message.textContent = "Deine Bewerbung wird geprüft. Du erhältst eine Email sobald dein Account freigeschaltet wurde.";
      form.reset();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

function initWorkerLogin() {
  const form = document.querySelector("#workerLoginForm");
  if (!form) return;
  const message = document.querySelector("#workerLoginMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      const session = await workerApi("/api/worker/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      saveWorkerSession(session);
      window.location.href = "arbeiter-dashboard";
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

async function initWorkerDashboard() {
  const greeting = document.querySelector("#workerGreeting");
  if (!greeting) return;
  const logoutButton = document.querySelector("#workerLogoutButton");
  const calendarEl = document.querySelector("#workerAvailabilityCalendar");
  const jobsEl = document.querySelector("#workerTodayJobs");
  const dialog = document.querySelector("#availabilityDialog");
  const availabilityForm = document.querySelector("#availabilityForm");
  const availabilityDateLabel = document.querySelector("#availabilityDateLabel");
  const availabilityMessage = document.querySelector("#availabilityMessage");
  const cancelButton = document.querySelector("#availabilityCancelButton");
  const session = readWorkerSession();
  const loginStarted = Number(localStorage.getItem(workerLoginStartedKey) || 0);
  let calendar;

  if (!session?.access_token || !loginStarted || Date.now() - loginStarted > workerSessionMs) {
    clearWorkerSession();
    window.location.href = "arbeiter-login";
    return;
  }

  try {
    const payload = await workerApi("/api/worker/session");
    greeting.textContent = `Hallo ${payload.worker.name || "und willkommen"}`;
  } catch {
    clearWorkerSession();
    window.location.href = "arbeiter-login";
    return;
  }

  logoutButton?.addEventListener("click", () => {
    clearWorkerSession();
    window.location.href = "arbeiter-login";
  });

  async function loadAvailability() {
    if (!calendarEl || !window.FullCalendar) return;
    const payload = await workerApi("/api/worker/availability");
    renderWorkerJobs(payload.bookings || []);
    const availabilityEvents = payload.slots.map((slot) => ({
      id: slot.id,
      title: slot.booked ? `Gebucht ${slot.from}-${slot.until}` : `${slot.from}-${slot.until}`,
      start: `${slot.date}T${slot.from}:00`,
      end: `${slot.date}T${slot.until}:00`,
      className: slot.booked ? "worker-event-booked" : "worker-event-available",
      extendedProps: { booked: slot.booked, type: "availability" },
    }));
    const bookingEvents = (payload.bookings || []).map((booking) => ({
      id: `booking-${booking.id}`,
      title: booking.services?.join(", ") || "Gebuchter Auftrag",
      start: `${booking.appointment?.date}T${booking.appointment?.time || "09:00"}:00`,
      className: "worker-event-booked",
      extendedProps: { booked: true, type: "booking" },
    }));

    if (!calendar) {
      calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth",
        locale: "de",
        height: "auto",
        selectable: true,
        headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" },
        dateClick: (info) => {
          availabilityForm.date.value = info.dateStr;
          availabilityDateLabel.textContent = new Date(`${info.dateStr}T12:00:00`).toLocaleDateString("de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          availabilityMessage.textContent = "";
          dialog.showModal();
        },
        eventClick: async (info) => {
          if (info.event.extendedProps.type !== "availability") return;
          if (info.event.extendedProps.booked) {
            alert("Gebuchte Zeiten können nicht gelöscht werden.");
            return;
          }
          if (!confirm("Diese Verfügbarkeit löschen?")) return;
          await workerApi(`/api/worker/availability/${info.event.id}`, { method: "DELETE" });
          await loadAvailability();
        },
      });
      calendar.render();
    }
    calendar.removeAllEvents();
    calendar.addEventSource([...availabilityEvents, ...bookingEvents]);
  }

  function renderWorkerJobs(bookings) {
    if (!jobsEl) return;
    const today = new Date().toISOString().slice(0, 10);
    const relevant = bookings.filter((booking) => booking.appointment?.date === today || !["Erledigt", "Storniert"].includes(booking.status));
    jobsEl.innerHTML = relevant.length ? relevant.map((booking) => `<article class="portal-card worker-job-card">
      <div class="portal-card-head">
        <strong>${booking.services?.join(", ") || booking.extraTask || "Auftrag"}</strong>
        <span>${booking.status || "Zugewiesen"}</span>
      </div>
      <p>${booking.appointment?.date || "-"} · ${booking.appointment?.time || "-"} Uhr</p>
      <small>${[booking.customer?.street, booking.customer?.zip, booking.customer?.city].filter(Boolean).join(", ") || "Adresse offen"}</small>
      <div class="worker-job-actions">
        <button type="button" data-worker-booking="${booking.id}" data-status="Unterwegs">Unterwegs</button>
        <button type="button" data-worker-booking="${booking.id}" data-status="Erledigt">Erledigt</button>
      </div>
    </article>`).join("") : "<p>Noch keine Aufträge.</p>";

    jobsEl.querySelectorAll("[data-worker-booking]").forEach((button) => {
      button.addEventListener("click", async () => {
        await workerApi(`/api/worker/bookings/${button.dataset.workerBooking}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.status }),
        });
        await loadAvailability();
      });
    });
  }

  availabilityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(availabilityForm);
    try {
      await workerApi("/api/worker/availability", {
        method: "POST",
        body: JSON.stringify({
          date: data.get("date"),
          from: data.get("from"),
          until: data.get("until"),
          recurring: data.get("recurring") === "on",
        }),
      });
      dialog.close();
      availabilityForm.reset();
      availabilityForm.from.value = "09:00";
      availabilityForm.until.value = "17:00";
      await loadAvailability();
    } catch (error) {
      availabilityMessage.textContent = error.message;
    }
  });

  cancelButton?.addEventListener("click", () => dialog.close());

  await loadAvailability();
}

initWorkerRegistration();
initWorkerLogin();
initWorkerDashboard();
