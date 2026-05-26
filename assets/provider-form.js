(() => {
  const form = document.querySelector("#publicWorkerForm");
  if (!form) return;

  const message = document.querySelector("#publicWorkerFormMessage");
  const availabilityRows = [...form.querySelectorAll(".availability-day-row")];

  const updateAvailabilityRows = () => {
    availabilityRows.forEach((row) => {
      const checked = row.querySelector("[data-provider-day]")?.checked;
      row.querySelectorAll("[data-provider-time]").forEach((select) => {
        select.disabled = !checked;
      });
    });
  };

  availabilityRows.forEach((row) => {
    row.querySelector("[data-provider-day]")?.addEventListener("change", updateAvailabilityRows);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const days = data.getAll("days");
    const availability = Object.fromEntries(days.map((day) => {
      const from = data.get(`${day}From`) || "15:00";
      const until = data.get(`${day}Until`) || "20:00";
      return [day, [`${from}-${until}`]];
    }));
    const localAreas = `${data.get("localAreasText") || ""}`
      .split(",")
      .map((area) => area.trim())
      .filter(Boolean);
    const identityDocument = data.get("identityDocument");

    const worker = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      city: data.get("city"),
      serviceArea: localAreas.length ? localAreas.join(", ") : data.get("city"),
      radiusKm: data.get("radiusKm"),
      leadTime: "Nach Absprache",
      skills: data.getAll("skills"),
      extraSkills: data.get("extraSkills"),
      localAreas,
      availability,
      areaNotes: data.get("areaNotes"),
      qualificationConfirmed: data.get("qualificationConfirmed") === "on",
      identityNotes: data.get("identityNotes"),
      identityDocumentName: identityDocument?.name || "",
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
      updateAvailabilityRows();
    } catch {
      if (message) message.textContent = "Das Profil konnte nicht gespeichert werden. Bitte starte die Website über den lokalen Server.";
    }
  });

  updateAvailabilityRows();
})();
