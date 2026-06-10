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
  const appointmentContainer = form.querySelector("[data-service-appointments]");
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
  const toDateInputValue = (date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const today = new Date();
  const maxAppointmentDate = new Date();
  maxAppointmentDate.setDate(today.getDate() + 28);
  const minAppointmentValue = toDateInputValue(today);
  const maxAppointmentValue = toDateInputValue(maxAppointmentDate);
  let appointmentDateCounter = 0;
  let appointmentTimeCounter = 0;
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
  const serviceAppointmentRows = () => appointmentContainer
    ? [...appointmentContainer.querySelectorAll("[data-service-appointment-time-row]")]
    : [];
  const serviceAppointments = () => {
    const appointments = {};
    serviceAppointmentRows().forEach((row) => {
      const dateGroup = row.closest("[data-service-appointment-date]");
      const service = dateGroup?.dataset.service;
      const dateSlot = dateGroup?.dataset.appointmentDate;
      const timeSlot = row.dataset.appointmentTime;
      const date = dateGroup?.querySelector(`[name="appointment-${dateSlot}-date"]`)?.value || "";
      const from = row.querySelector(`[name="appointment-${timeSlot}-from"]`)?.value || "";
      const to = row.querySelector(`[name="appointment-${timeSlot}-to"]`)?.value || "";
      if (!service) return;
      if (!appointments[service]) appointments[service] = [];
      appointments[service].push({
        dateSlot,
        timeSlot,
        date,
        from,
        to,
      });
    });
    return appointments;
  };
  const flatServiceAppointments = () => Object.entries(serviceAppointments())
    .flatMap(([service, windows]) => windows.map((window) => ({ service, ...window })));
  const hasMissingAppointment = () => {
    const selected = services();
    if (!selected.length) return false;
    const appointments = serviceAppointments();
    return selected.some((service) => {
      const windows = appointments[service] || [];
      return !windows.length || windows.some((appointment) => !appointment.date || !appointment.from || !appointment.to);
    });
  };
  const hasInvalidAppointmentTime = () => flatServiceAppointments()
    .some((appointment) => appointment.date && appointment.from && appointment.to && appointment.from >= appointment.to);
  const hasInvalidAppointmentDate = () => flatServiceAppointments()
    .some((appointment) => appointment.date && (appointment.date < minAppointmentValue || appointment.date > maxAppointmentValue));
  const appointmentSummaryText = () => flatServiceAppointments()
    .filter((appointment) => appointment.date && appointment.from && appointment.to)
    .map((appointment) => `${appointment.service}: ${appointment.date} ${appointment.from}-${appointment.to} Uhr`)
    .join(", ");
  const createAppointmentTime = (from = "", to = "") => ({
    timeSlot: `time-${appointmentTimeCounter++}`,
    from,
    to,
  });
  const createAppointmentDate = (service, date = "", windows = []) => ({
    dateSlot: `date-${appointmentDateCounter++}`,
    date,
    service,
    windows: windows.length
      ? windows.map((window) => createAppointmentTime(window.from, window.to))
      : [createAppointmentTime()],
  });
  const groupedAppointmentDates = (appointments) => {
    const groups = [];
    appointments.forEach((appointment) => {
      const key = appointment.date || `empty-${groups.length}`;
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = { key, date: appointment.date, windows: [] };
        groups.push(group);
      }
      group.windows.push({ from: appointment.from, to: appointment.to });
    });
    return groups;
  };
  const renderAppointmentTimeRow = ({ timeSlot, from = "", to = "", removable = false }) => `
    <div class="service-appointment-time-row" data-service-appointment-time-row data-appointment-time="${timeSlot}">
      <div class="booking-field appointment-time-field">
        <label>Uhrzeit Von</label>
        <input name="appointment-${timeSlot}-from" type="time" value="${escapeHtml(from)}" required>
      </div>
      <div class="booking-field appointment-time-field">
        <label>Bis</label>
        <input name="appointment-${timeSlot}-to" type="time" value="${escapeHtml(to)}" required>
      </div>
      ${removable ? '<button class="appointment-remove-button" type="button" data-remove-appointment aria-label="Zeitfenster entfernen">×</button>' : '<span class="appointment-remove-placeholder" aria-hidden="true"></span>'}
    </div>
  `;
  const renderAppointmentDateGroup = ({ service, dateSlot, date = "", windows = [], removable = false }) => `
    <div class="service-appointment-date" data-service-appointment-date data-service="${escapeHtml(service)}" data-appointment-date="${dateSlot}">
      <div class="service-appointment-date-head">
        <div class="booking-field">
          <label>Datum wählen</label>
          <input name="appointment-${dateSlot}-date" type="date" min="${minAppointmentValue}" max="${maxAppointmentValue}" value="${escapeHtml(date)}" required>
        </div>
        ${removable ? '<button class="appointment-remove-date-button" type="button" data-remove-appointment-date>Datum entfernen</button>' : ""}
      </div>
      <div class="service-appointment-times" data-appointment-times>
        ${windows.map((window, index) => renderAppointmentTimeRow({ ...window, removable: index > 0 })).join("")}
      </div>
      <button class="appointment-time-add-button" type="button" data-add-appointment-time>+ Weitere Uhrzeit für dieses Datum</button>
    </div>
  `;
  const renderServiceAppointments = () => {
    if (!appointmentContainer) return;
    const selected = services();
    if (!selected.length) {
      appointmentContainer.innerHTML = '<p class="form-help">Wähle zuerst oben mindestens eine Dienstleistung aus. Danach kannst du pro Dienst ein Zeitfenster angeben.</p>';
      return;
    }

    const existing = serviceAppointments();
    appointmentContainer.innerHTML = `
      <p class="appointment-global-note">Wir melden uns zur Bestätigung – ein größeres Zeitfenster erhöht die Verfügbarkeit</p>
      ${selected.map((service) => {
      const dateGroups = existing[service]?.length
        ? groupedAppointmentDates(existing[service]).map((group) => createAppointmentDate(service, group.date, group.windows))
        : [createAppointmentDate(service)];
      return `
        <article class="service-appointment-card" data-service-appointment-card="${escapeHtml(service)}">
          <h4>${escapeHtml(service)}</h4>
          <div class="service-appointment-rows" data-appointment-rows>
            ${dateGroups.map((dateGroup, index) => renderAppointmentDateGroup({ ...dateGroup, removable: index > 0 })).join("")}
          </div>
          <button class="appointment-add-button" type="button" data-add-appointment="${escapeHtml(service)}">+ Weiteres Datum hinzufügen</button>
        </article>
      `;
    }).join("")}
    `;
  };
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
    renderServiceAppointments();
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
    if (hasMissingAppointment()) {
      showError("Bitte gib für jede ausgewählte Dienstleistung ein Datum sowie eine Von- und Bis-Uhrzeit an.");
      return;
    }
    if (hasInvalidAppointmentDate()) {
      showError("Bitte wähle Termine ab heute und maximal vier Wochen in die Zukunft.");
      return;
    }
    if (hasInvalidAppointmentTime() || hasInvalidAvailabilityTime()) {
      showError("Bitte achte darauf, dass die Bis-Uhrzeit nach der Von-Uhrzeit liegt.");
      return;
    }
    if (!value("firstName") || !value("lastName") || !value("street") || !value("zip") || !value("city") || !value("phone") || !value("email")) {
      showError("Bitte gib Name, Kontakt und vollständige Adresse an.");
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
          availability: {
            ...availabilityData(),
            serviceAppointments: serviceAppointments(),
            summary: appointmentSummaryText(),
          },
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
          date: flatServiceAppointments()[0]?.date || "",
          time: flatServiceAppointments()[0]?.from || "",
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
      renderServiceAppointments();
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
    const addAppointmentButton = event.target.closest("[data-add-appointment]");
    if (addAppointmentButton && appointmentContainer?.contains(addAppointmentButton)) {
      const card = addAppointmentButton.closest("[data-service-appointment-card]");
      const rows = card?.querySelector("[data-appointment-rows]");
      const service = addAppointmentButton.dataset.addAppointment;
      if (rows) {
        rows.insertAdjacentHTML("beforeend", renderAppointmentDateGroup({ ...createAppointmentDate(service), removable: true }));
      }
      return;
    }

    const addAppointmentTimeButton = event.target.closest("[data-add-appointment-time]");
    if (addAppointmentTimeButton && appointmentContainer?.contains(addAppointmentTimeButton)) {
      const dateGroup = addAppointmentTimeButton.closest("[data-service-appointment-date]");
      const rows = dateGroup?.querySelector("[data-appointment-times]");
      if (rows) {
        rows.insertAdjacentHTML("beforeend", renderAppointmentTimeRow({ ...createAppointmentTime(), removable: true }));
      }
      return;
    }

    const removeAppointmentButton = event.target.closest("[data-remove-appointment]");
    if (removeAppointmentButton && appointmentContainer?.contains(removeAppointmentButton)) {
      const row = removeAppointmentButton.closest("[data-service-appointment-time-row]");
      const dateGroup = row?.closest("[data-service-appointment-date]");
      row?.remove();
      if (dateGroup && !dateGroup.querySelector("[data-service-appointment-time-row]")) {
        dateGroup.remove();
      }
      return;
    }

    const removeAppointmentDateButton = event.target.closest("[data-remove-appointment-date]");
    if (removeAppointmentDateButton && appointmentContainer?.contains(removeAppointmentDateButton)) {
      removeAppointmentDateButton.closest("[data-service-appointment-date]")?.remove();
      return;
    }

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
  renderServiceAppointments();
})();
