const api = {
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

function renderWorkerPortal() {
  const form = document.querySelector("#workerForm");
  const assignmentsEl = document.querySelector("#workerAssignments");
  if (!form || !assignmentsEl) return;

  assignmentsEl.innerHTML = "<p>Aufträge werden dir später per E-Mail bestätigt. Dieser Bereich zeigt keine Admin-Daten.</p>";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const worker = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      city: data.get("city"),
      skills: data.getAll("skills"),
      availability: parseAvailability(data.get("availability") || ""),
    };
    await api.send("/api/workers", "POST", worker);
    document.querySelector("#workerFormMessage").textContent = "Profil gespeichert.";
    form.reset();
  });
}

renderWorkerPortal();
