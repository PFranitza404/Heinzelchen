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
  const selectedValue = (name) => value(name);
  const selectedValues = (name) => {
    const list = form.querySelector(`[data-multi-select-list="${name}"]`);
    if (list) {
      try {
        return JSON.parse(list.dataset.values || "[]");
      } catch {
        return [];
      }
    }
    const field = form.querySelector(`[name="${name}"]`);
    if (field?.matches("select[multiple]")) {
      return [...field.selectedOptions].map((option) => option.value).filter(Boolean);
    }
    const checked = checkedValues(name);
    if (checked.length) return checked;
    const selected = selectedValue(name);
    return selected ? [selected] : [];
  };
  const detailCards = [...form.querySelectorAll("[data-service-detail]")];
  const availabilityRows = [...form.querySelectorAll(".availability-day-row")];
  const gardenTaskSummary = form.querySelector("[data-selected-garden-tasks]");
  const cleaningTaskSummary = form.querySelector("[data-selected-cleaning-tasks]");
  const multiSelectLists = [...form.querySelectorAll("[data-multi-select-list]")];
  const otherCustomField = form.querySelector("[data-other-custom-field]");
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
      detailTutoringSubject: "Nachhilfe Fach",
      detailTutoringLevel: "Nachhilfe Klasse/Niveau",
      detailTutoringTopic: "Nachhilfe Thema",
      detailOtherCustom: "Sonstige Aufgabe",
      detailCleaningSize: "Fläche",
      detailCleaningCustom: "Weitere Aufgaben",
    };
    const textDetails = Object.entries(labels)
      .map(([name, label]) => {
        const text = value(name);
        return text ? `${label}: ${text}` : "";
      })
      .filter(Boolean);
    const addSelectedDetails = (name, label) => {
      const selected = selectedValues(name);
      if (selected.length) textDetails.unshift(`${label}: ${selected.join(", ")}`);
    };
    addSelectedDetails("detailGardenTask", "Garten Dienste");
    addSelectedDetails("detailCleaningTask", "Reinigung Dienste");
    addSelectedDetails("detailTutoringTask", "Nachhilfe Angebote");
    addSelectedDetails("detailCareTask", "Betreuung Aufgaben");
    addSelectedDetails("detailBuildTask", "Aufbau Aufgaben");
    addSelectedDetails("detailPaintingTask", "Malereiarbeiten");
    addSelectedDetails("detailOtherTask", "Sonstiges");
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
      tasks: selectedValues("detailGardenTask"),
      size: value("detailGardenSize"),
      custom: value("detailGardenCustom"),
    },
    tutoring: {
      level: value("detailTutoringLevel"),
      subject: value("detailTutoringSubject"),
      topic: value("detailTutoringTopic"),
      tasks: selectedValues("detailTutoringTask"),
    },
    care: {
      tasks: selectedValues("detailCareTask"),
    },
    build: {
      tasks: selectedValues("detailBuildTask"),
    },
    painting: {
      tasks: selectedValues("detailPaintingTask"),
    },
    cleaning: {
      tasks: selectedValues("detailCleaningTask"),
      size: value("detailCleaningSize"),
      custom: value("detailCleaningCustom"),
    },
    other: {
      tasks: selectedValues("detailOtherTask"),
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
    if (selectedServices.includes("Gartenarbeit")) hours += selectedValues("detailGardenTask").length * 0.5;
    if (value("detailGardenSize")) hours += 0.5;
    if (value("detailGardenCustom")) hours += 0.5;
    if (selectedServices.includes("Putzen & Reinigen")) hours += selectedValues("detailCleaningTask").length * 0.35;
    if (value("detailCleaningSize")) hours += 0.5;
    if (value("detailCleaningCustom")) hours += 0.5;
    if (value("detailTutoringTopic")) hours += 0.5;
    hours += selectedValues("detailTutoringTask").length * 0.5;
    hours += selectedValues("detailCareTask").length * 0.5;
    hours += selectedValues("detailBuildTask").length * 0.5;
    hours += selectedValues("detailPaintingTask").length * 0.5;
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
    updateOtherCustomField();
    updateDurationEstimate();
  };
  const updateGardenTaskSummary = () => {
    if (!gardenTaskSummary) return;
    const tasks = selectedValues("detailGardenTask");
    gardenTaskSummary.hidden = !tasks.length;
    gardenTaskSummary.innerHTML = tasks.map((task) => `<span>${escapeHtml(task)}</span>`).join("");
    updateDurationEstimate();
  };
  const updateMultiSelectList = (name) => {
    const list = form.querySelector(`[data-multi-select-list="${name}"]`);
    if (!list) return;
    const tasks = selectedValues(name);
    list.hidden = !tasks.length;
    list.innerHTML = tasks
      .map((task) => `<button type="button" data-remove-task="${escapeHtml(task)}" data-remove-task-list="${name}">${escapeHtml(task)} <span aria-hidden="true">×</span></button>`)
      .join("");
    updateDurationEstimate();
  };
  const updateMultiSelectLists = () => {
    multiSelectLists.forEach((list) => updateMultiSelectList(list.dataset.multiSelectList));
  };
  const updateCleaningTaskSummary = () => {
    if (!cleaningTaskSummary) return;
    const tasks = selectedValues("detailCleaningTask");
    cleaningTaskSummary.hidden = !tasks.length;
    cleaningTaskSummary.innerHTML = tasks.map((task) => `<span>${escapeHtml(task)}</span>`).join("");
    updateDurationEstimate();
  };
  const updateOtherCustomField = () => {
    if (!otherCustomField) return;
    otherCustomField.hidden = selectedValue("detailOtherTask") !== "Freie Eingabe";
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
      multiSelectLists.forEach((list) => {
        list.dataset.values = "[]";
      });
      updateMultiSelectLists();
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
  form.querySelectorAll("[data-multi-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const name = select.dataset.multiSelect;
      const selected = select.value;
      const list = form.querySelector(`[data-multi-select-list="${name}"]`);
      if (!selected || !list) return;
      const current = selectedValues(name);
      if (!current.includes(selected)) current.push(selected);
      list.dataset.values = JSON.stringify(current);
      select.value = "";
      updateMultiSelectList(name);
    });
  });
  form.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-task]");
    if (!removeButton) return;
    const name = removeButton.dataset.removeTaskList;
    const list = form.querySelector(`[data-multi-select-list="${name}"]`);
    if (!list) return;
    list.dataset.values = JSON.stringify(selectedValues(name).filter((task) => task !== removeButton.dataset.removeTask));
    updateMultiSelectList(name);
  });
  availabilityRows.forEach((row) => {
    row.querySelector("[data-availability-day]")?.addEventListener("change", updateAvailabilityRows);
  });
  form.querySelectorAll('[name="detailGardenTask"]').forEach((input) => {
    input.addEventListener("change", updateGardenTaskSummary);
  });
  form.querySelectorAll('[name="detailCleaningTask"]').forEach((input) => {
    input.addEventListener("change", updateCleaningTaskSummary);
  });
  form.querySelectorAll('[name="detailTutoringTask"], [name="detailCareTask"], [name="detailBuildTask"], [name="detailPaintingTask"]').forEach((input) => {
    input.addEventListener("change", updateDurationEstimate);
  });
  form.querySelector('[name="detailOtherTask"]')?.addEventListener("change", updateOtherCustomField);
  ["detailGardenSize", "detailGardenCustom", "detailCleaningSize", "detailCleaningCustom", "detailTutoringTopic", "detailOtherCustom"].forEach((name) => {
    form.querySelector(`[name="${name}"]`)?.addEventListener("input", updateDurationEstimate);
  });
  updateDetailCards();
  updateMultiSelectLists();
  updateAvailabilityRows();
})();
