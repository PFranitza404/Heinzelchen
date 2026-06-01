(() => {
  const form = document.querySelector("[data-inquiry-form]");
  if (!form) return;

  const error = form.querySelector("[data-inquiry-error]");
  const confirmation = form.querySelector("[data-inquiry-confirmation]");
  const submit = form.querySelector(".inquiry-submit");
  const durationEstimate = form.querySelector("[data-ai-duration-estimate]");

  const value = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() || "";
  const services = () => [...form.querySelectorAll('[name="requested-services"]:checked')].map((input) => input.value);
  const checkedValues = (name) => [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
  const detailCards = [...form.querySelectorAll("[data-service-detail]")];
  const availabilityRows = [...form.querySelectorAll(".availability-day-row")];
  const gardenTaskSummary = form.querySelector("[data-selected-garden-tasks]");
  const cleaningTaskSummary = form.querySelector("[data-selected-cleaning-tasks]");
  const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
  const detailText = () => {
    const labels = {
      detailGardenSize: "Gartenfläche",
      detailGardenCustom: "Weitere Aufgaben",
      detailShoppingType: "Einkauf",
      detailShoppingNotes: "Einkauf Hinweise",
      detailTutoringSubject: "Nachhilfe Fach",
      detailTutoringLevel: "Nachhilfe Klasse/Niveau",
      detailTutoringTopic: "Nachhilfe Thema",
      detailOtherCustom: "Sonstige Aufgabe",
      detailPaintingArea: "Maler Bereich",
      detailPaintingMaterial: "Maler Material",
      detailTechDevice: "Technik Gerät",
      detailTechProblem: "Technik Problem",
      detailBabysittingAge: "Kinder Alter",
      detailBabysittingNotes: "Babysitting Hinweise",
      detailDogType: "Hund",
      detailDogTask: "Hund Aufgabe",
      detailCleaningRooms: "Reinigung Räume",
      detailCleaningScope: "Reinigung Umfang",
      detailCleaningSize: "Fläche",
      detailCleaningCustom: "Weitere Aufgaben",
    };
    const textDetails = Object.entries(labels)
      .map(([name, label]) => {
        const text = value(name);
        return text ? `${label}: ${text}` : "";
      })
      .filter(Boolean);
    const gardenTasks = checkedValues("detailGardenTasks");
    if (gardenTasks.length) textDetails.unshift(`Garten Aufgaben: ${gardenTasks.join(", ")}`);
    const cleaningTasks = checkedValues("detailCleaningTasks");
    if (cleaningTasks.length) textDetails.unshift(`Reinigung Dienste: ${cleaningTasks.join(", ")}`);
    const tutoringTasks = checkedValues("detailTutoringTasks");
    if (tutoringTasks.length) textDetails.unshift(`Nachhilfe Angebote: ${tutoringTasks.join(", ")}`);
    const careTasks = checkedValues("detailCareTasks");
    if (careTasks.length) textDetails.unshift(`Betreuung Aufgaben: ${careTasks.join(", ")}`);
    const buildTasks = checkedValues("detailBuildTasks");
    if (buildTasks.length) textDetails.unshift(`Aufbau Aufgaben: ${buildTasks.join(", ")}`);
    const paintingTasks = checkedValues("detailPaintingTasks");
    if (paintingTasks.length) textDetails.unshift(`Malereiarbeiten: ${paintingTasks.join(", ")}`);
    return textDetails.join("\n");
  };
  const fullName = () => [value("firstName"), value("lastName")].filter(Boolean).join(" ");
  const fullAddress = () => [value("city"), value("street"), value("zip")].filter(Boolean).join(", ");
  const contactText = () => [value("email"), value("phone")].filter(Boolean).join(", ");
  const availabilityData = () => availabilityRows.reduce((days, row) => {
    const checkbox = row.querySelector("[data-availability-day]");
    if (!checkbox?.checked) return days;
    const times = row.querySelectorAll("[data-availability-time]");
    days[checkbox.value] = {
      from: times[0]?.value || "",
      to: times[1]?.value || "",
    };
    return days;
  }, {});
  const detailNotes = () => ({
    garden: {
      tasks: checkedValues("detailGardenTasks"),
      size: value("detailGardenSize"),
      custom: value("detailGardenCustom"),
    },
    tutoring: {
      level: value("detailTutoringLevel"),
      subject: value("detailTutoringSubject"),
      topic: value("detailTutoringTopic"),
      tasks: checkedValues("detailTutoringTasks"),
    },
    care: {
      tasks: checkedValues("detailCareTasks"),
    },
    build: {
      tasks: checkedValues("detailBuildTasks"),
    },
    painting: {
      tasks: checkedValues("detailPaintingTasks"),
    },
    cleaning: {
      tasks: checkedValues("detailCleaningTasks"),
      size: value("detailCleaningSize"),
      custom: value("detailCleaningCustom"),
    },
    other: {
      custom: value("detailOtherCustom"),
    },
  });
  const availabilityText = () => availabilityRows
    .filter((row) => row.querySelector("[data-availability-day]")?.checked)
    .map((row) => {
      const day = row.querySelector("[data-availability-day]").value;
      const times = row.querySelectorAll("[data-availability-time]");
      return `${day} ${times[0].value}-${times[1].value} Uhr`;
    })
    .join(", ");
  const hasInvalidAvailabilityTime = () => availabilityRows.some((row) => {
    const checkbox = row.querySelector("[data-availability-day]");
    if (!checkbox?.checked) return false;
    const times = row.querySelectorAll("[data-availability-time]");
    return times[0].value >= times[1].value;
  });
  const updateAvailabilityRows = () => {
    availabilityRows.forEach((row) => {
      const checked = row.querySelector("[data-availability-day]")?.checked;
      row.querySelectorAll("[data-availability-time]").forEach((select) => {
        select.disabled = !checked;
      });
    });
  };
  const estimateHours = () => {
    const selectedServices = services();
    if (!selectedServices.length) return 0;

    const baseHours = {
      Gartenarbeit: 1.5,
      Einkaufsservice: 1,
      Nachhilfe: 2,
      Betreuung: 2,
      Aufbau: 2,
      Malereiarbeiten: 3,
      Malerarbeiten: 3,
      "Technik-Hilfe": 1.5,
      Babysitting: 3,
      Hundeservice: 1,
      "Putzen & Reinigen": 2,
      Sonstiges: 1.5,
    };

    let hours = selectedServices.reduce((sum, service) => sum + (baseHours[service] || 1.5), 0);
    const gardenTasks = checkedValues("detailGardenTasks");
    if (selectedServices.includes("Gartenarbeit") && gardenTasks.length) {
      hours += gardenTasks.length * 0.5;
    }
    if (value("detailGardenSize")) hours += 0.5;
    if (value("detailGardenCustom")) hours += 0.5;
    const cleaningTasks = checkedValues("detailCleaningTasks");
    if (selectedServices.includes("Putzen & Reinigen") && cleaningTasks.length) {
      hours += cleaningTasks.length * 0.35;
    }
    if (value("detailCleaningSize")) hours += 0.5;
    if (value("detailCleaningCustom")) hours += 0.5;
    if (value("detailTutoringTopic")) hours += 0.5;
    if (checkedValues("detailTutoringTasks").length) hours += 0.5;
    if (checkedValues("detailCareTasks").length) hours += 0.5;
    if (checkedValues("detailBuildTasks").length) hours += 0.5;
    if (checkedValues("detailPaintingTasks").length) hours += 0.5;
    if (value("detailOtherCustom")) hours += 0.5;
    return Math.min(12, Math.max(1, Math.ceil(hours)));
  };
  const updateDurationEstimate = () => {
    if (!durationEstimate) return;
    const hours = estimateHours();
    durationEstimate.textContent = hours
      ? `KI-Einschätzung: Unsere KI schlägt für diesen Auftrag ungefähr ${hours} Stunde${hours === 1 ? "" : "n"} vor.`
      : "KI-Einschätzung: Wähle eine Dienstleistung aus, dann schlägt unsere KI eine ungefähre Dauer vor.";
  };
  const updateDetailCards = () => {
    const selected = new Set(services());
    detailCards.forEach((card) => {
      card.hidden = !selected.has(card.dataset.serviceDetail);
    });
    updateGardenTaskSummary();
    updateCleaningTaskSummary();
    updateDurationEstimate();
  };
  const updateGardenTaskSummary = () => {
    if (!gardenTaskSummary) return;
    const tasks = checkedValues("detailGardenTasks");
    gardenTaskSummary.hidden = !tasks.length;
    gardenTaskSummary.innerHTML = tasks.map((task) => `<span>${escapeHtml(task)}</span>`).join("");
    updateDurationEstimate();
  };
  const updateCleaningTaskSummary = () => {
    if (!cleaningTaskSummary) return;
    const tasks = checkedValues("detailCleaningTasks");
    cleaningTaskSummary.hidden = !tasks.length;
    cleaningTaskSummary.innerHTML = tasks.map((task) => `<span>${escapeHtml(task)}</span>`).join("");
    updateDurationEstimate();
  };
  const showError = (message) => {
    error.textContent = message;
    error.hidden = false;
    confirmation.hidden = true;
  };
  const clearMessages = () => {
    error.hidden = true;
    error.textContent = "";
    confirmation.hidden = true;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessages();

    if (!services().length) {
      showError("Bitte wähle mindestens einen Bereich aus.");
      return;
    }
    if (!value("duration")) {
      showError("Bitte schätze die Dauer in vollen Stunden ein.");
      return;
    }
    if (!value("frequency")) {
      showError("Bitte wähle aus, ob du einmalig oder dauerhaft Hilfe suchst.");
      return;
    }
    if (!availabilityText()) {
      showError("Bitte wähle mindestens einen Wochentag aus, an dem der Auftrag möglich ist.");
      return;
    }
    if (hasInvalidAvailabilityTime()) {
      showError("Bitte achte darauf, dass die Bis-Uhrzeit nach der Von-Uhrzeit liegt.");
      return;
    }
    if (!value("firstName") || !value("lastName") || !value("street") || !value("zip") || !value("city") || !value("phone") || !value("email") || !value("date") || !value("time")) {
      showError("Bitte gib Name, Kontakt, vollständige Adresse sowie Datum und Uhrzeit an.");
      return;
    }
    if (!value("email").includes("@")) {
      showError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Anfrage wird gesendet ...";

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: services(),
          extraTask: detailText(),
          locationNotes: value("locationNotes"),
          availability: availabilityData(),
          detailNotes: detailNotes(),
          name: fullName(),
          address: fullAddress(),
          contact: contactText(),
          duration: `${value("duration")} volle Stunde(n)`,
          frequency: value("frequency") || "Prüfung angefragt",
          firstName: value("firstName"),
          lastName: value("lastName"),
          street: value("street"),
          zip: value("zip"),
          city: value("city"),
          phone: value("phone"),
          email: value("email"),
          date: value("date"),
          time: value("time"),
        }),
      });
      if (!response.ok) throw new Error("Anfrage konnte nicht gespeichert werden.");
      confirmation.hidden = false;
      form.reset();
      updateDetailCards();
      updateDurationEstimate();
      updateAvailabilityRows();
    } catch (err) {
      showError("Die Anfrage konnte nicht gesendet werden. Bitte versuche es später erneut.");
    } finally {
      submit.disabled = false;
      submit.textContent = "Heinzelchen anfragen";
    }
  });

  form.querySelectorAll('[name="requested-services"]').forEach((input) => {
    input.addEventListener("change", updateDetailCards);
  });
  availabilityRows.forEach((row) => {
    row.querySelector("[data-availability-day]")?.addEventListener("change", updateAvailabilityRows);
  });
  form.querySelectorAll('[name="detailGardenTasks"]').forEach((input) => {
    input.addEventListener("change", updateGardenTaskSummary);
  });
  form.querySelectorAll('[name="detailCleaningTasks"]').forEach((input) => {
    input.addEventListener("change", updateCleaningTaskSummary);
  });
  form.querySelectorAll('[name="detailTutoringTasks"], [name="detailCareTasks"], [name="detailBuildTasks"], [name="detailPaintingTasks"]').forEach((input) => {
    input.addEventListener("change", updateDurationEstimate);
  });
  ["detailGardenSize", "detailGardenCustom", "detailCleaningSize", "detailCleaningCustom", "detailTutoringTopic", "detailOtherCustom"].forEach((name) => {
    form.querySelector(`[name="${name}"]`)?.addEventListener("input", updateDurationEstimate);
  });
  updateDetailCards();
  updateAvailabilityRows();
})();
