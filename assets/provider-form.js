(() => {
  const form = document.querySelector("#publicWorkerForm");
  if (!form) return;

  const message = document.querySelector("#publicWorkerFormMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const days = data.getAll("days");
    const from = data.get("availableFrom") || "08:00";
    const until = data.get("availableUntil") || "18:00";
    const availability = Object.fromEntries(days.map((day) => [day, [`${from}-${until}`]]));

    const worker = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      city: data.get("city"),
      serviceArea: data.get("serviceArea") || data.get("city"),
      radiusKm: data.get("radiusKm"),
      leadTime: data.get("leadTime"),
      skills: data.getAll("skills"),
      availability,
    };

    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(worker),
      });
      if (!response.ok) throw new Error("Speichern fehlgeschlagen");
      if (message) message.textContent = "Profil gespeichert. Wir prüfen deine Angaben und melden uns.";
      form.reset();
    } catch {
      if (message) message.textContent = "Das Profil konnte nicht gespeichert werden. Bitte starte die Website über den lokalen Server.";
    }
  });
})();
