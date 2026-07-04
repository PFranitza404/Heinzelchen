(() => {
  const form = document.querySelector("[data-inquiry-form]");
  if (!form) return;

  const error = form.querySelector("[data-inquiry-error]");
  const confirmation = form.querySelector("[data-inquiry-confirmation]");
  const panels = [...form.querySelectorAll("[data-inquiry-step]")];
  const progress = [...form.querySelectorAll("[data-step-jump]")];
  const backButton = form.querySelector("[data-inquiry-back]");
  const nextButton = form.querySelector("[data-inquiry-next]");
  const submitButton = form.querySelector(".inquiry-submit");
  const appointmentContainer = form.querySelector("[data-service-appointments]");
  const detailCards = [...form.querySelectorAll("[data-service-detail]")];
  const multiSelectLists = [...form.querySelectorAll("[data-multi-select-list]")];
  const durations = Array.from({ length: 24 }, (_, index) => (index + 1) * 0.5);
  const frequencies = ["Einmalig", "Wöchentlich", "2-wöchentlich"];
  const today = new Date();
  let step = 1;
  let maxStep = 1;
  const draftStorageKey = "heinzelchen.inquiryDraft.v1";
  let restoringDraft = false;

  const escapeHtml = (text) => `${text || ""}`.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
  const value = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() || "";
  const dateValue = (date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const minDateValue = dateValue(today);
  const normalizeServiceName = (service) => ({
    "Malereiarbeiten": "Malerarbeiten",
    "Putzen & Reinigen": "Hausreinigung",
    "Wäscheservice": "Bügeln",
  }[service] || service);
  const normalizePaintingTask = (task) => task === "Farbauswahl und Beratung (Farrow & Ball)" ? "Farbauswahl und Beratung" : task;
  const selectedServices = () => [...form.querySelectorAll('[name="requested-services"]:checked')].map((input) => normalizeServiceName(input.value));
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
    return field?.value ? [field.value] : [];
  };
  const tutoringGradeOptions = (selected = "") => [
    "",
    "1. Klasse",
    "2. Klasse",
    "3. Klasse",
    "4. Klasse",
    "5. Klasse",
    "6. Klasse",
    "7. Klasse",
    "8. Klasse",
    "9. Klasse",
    "10. Klasse",
    "11. Klasse",
    "12. Klasse",
    "13. Klasse",
    "Abiturvorbereitung",
    "Studium",
  ].map((grade) => `<option value="${escapeHtml(grade)}"${grade === selected ? " selected" : ""}>${grade ? escapeHtml(grade) : "Bitte auswählen"}</option>`).join("");
  const tutoringSubjects = ["Mathematik", "Deutsch", "Englisch", "Französisch", "Spanisch", "Physik", "Chemie", "Biologie", "Geschichte", "Informatik", "Anderes Fach"];
  const collectTutoringRequests = () => [...form.querySelectorAll("[data-tutoring-request]")].map((block) => {
    const directSubject = block.querySelector("[data-tutoring-subject-select]")?.value || "";
    const directTopic = block.querySelector("[data-tutoring-topic]")?.value.trim() || "";
    const subjects = directSubject
      ? [{ subject: directSubject, topic: directTopic }]
      : [...block.querySelectorAll("[data-tutoring-subject-item]")].map((subject) => ({
        subject: subject.dataset.tutoringSubjectItem || "",
        topic: subject.querySelector("[data-tutoring-topic]")?.value.trim() || "",
      }));
    return {
      grade: block.querySelector("[data-tutoring-grade]")?.value || "",
      subjects,
    };
  }).filter((request) => request.grade || request.subjects.length);
  const tutoringSubjectOptions = (selected = "") => ['<option value="">Bitte auswählen</option>']
    .concat(tutoringSubjects.map((subject) => `<option value="${escapeHtml(subject)}"${subject === selected ? " selected" : ""}>${escapeHtml(subject)}</option>`))
    .join("");
  const renderTutoringSubjectItem = (subject, topic = "") => `
    <div class="tutoring-subject-row" data-tutoring-subject-item="${escapeHtml(subject)}">
      <span>${escapeHtml(subject)}</span>
      <input type="text" data-tutoring-topic placeholder="${subject === "Anderes Fach" ? "Fach/Thema optional" : "Thema optional"}" value="${escapeHtml(topic)}">
      <button class="time-window-remove" type="button" data-remove-tutoring-subject aria-label="Fach entfernen">×</button>
    </div>
  `;
  const renderTutoringRequest = (request = {}) => {
    const subjects = Array.isArray(request.subjects) ? request.subjects : [];
    const primarySubject = subjects[0] || {};
    return `
    <div class="tutoring-request-block" data-tutoring-request>
      <div class="tutoring-request-head">
        <strong>Weitere Nachhilfe</strong>
        <button class="time-window-remove" type="button" data-remove-tutoring-request aria-label="Nachhilfe entfernen">×</button>
      </div>
      <div class="booking-field">
        <label>Klasse</label>
        <select data-tutoring-grade>${tutoringGradeOptions(request.grade || "")}</select>
      </div>
      <div class="booking-field">
        <label>Fach auswählen</label>
        <select data-tutoring-subject-select>${tutoringSubjectOptions(primarySubject.subject || "")}</select>
      </div>
      <div class="booking-field">
        <label>Thema optional</label>
        <input type="text" data-tutoring-topic placeholder="z.B. Bruchrechnung, Grammatik, Prüfungsvorbereitung" value="${escapeHtml(primarySubject.topic || "")}">
      </div>
    </div>
  `;
  };
  const collectBuildTasks = () => [...form.querySelectorAll("[data-build-task-item]")].map((item) => ({
    task: item.dataset.buildTaskItem || "",
    note: item.querySelector("[data-build-task-note]")?.value.trim() || "",
  })).filter((item) => item.task);
  const renderBuildTaskItem = (task, note = "") => `
    <div class="build-task-row" data-build-task-item="${escapeHtml(task)}">
      <span>${escapeHtml(task)}</span>
      <input type="text" data-build-task-note placeholder="${task === "Möbel" ? "z.B. Schrank, Schreibtisch oder Bett" : "Weitere Hinweise optional"}" value="${escapeHtml(note)}">
      <button class="time-window-remove" type="button" data-remove-build-task aria-label="Aufgabe entfernen">×</button>
    </div>
  `;
  const collectPaintingTasks = () => [...form.querySelectorAll("[data-painting-task-item]")].map((item) => ({
    task: normalizePaintingTask(item.dataset.paintingTaskItem || ""),
    size: item.querySelector("[data-painting-task-size]")?.value.trim() || "",
  })).filter((item) => item.task);
  const renderPaintingTaskItem = (task, size = "") => {
    const normalizedTask = normalizePaintingTask(task);
    return `
    <div class="painting-task-row" data-painting-task-item="${escapeHtml(normalizedTask)}">
      <span>${escapeHtml(normalizedTask)}</span>
      <input type="text" data-painting-task-size placeholder="z.B. ca. 20 qm Wandfläche" value="${escapeHtml(size)}">
      <button class="time-window-remove" type="button" data-remove-painting-task aria-label="Maleraufgabe entfernen">×</button>
    </div>
  `;
  };
  const timeOptions = (selected = "") => {
    const options = ['<option value="">Bitte wählen</option>'];
    for (let hour = 7; hour < 24; hour += 1) {
      for (const minute of [0, 30]) {
        const time = `${hour}`.padStart(2, "0") + ":" + `${minute}`.padStart(2, "0");
        options.push(`<option value="${time}"${time === selected ? " selected" : ""}>${time}</option>`);
      }
    }
    return options.join("");
  };
  const formatDuration = (duration) => `${Number.isInteger(duration) ? duration : duration.toFixed(1)}h`;
  const durationOptions = (selected = "0.5h") => durations
    .map((duration) => {
      const value = formatDuration(duration);
      return `<option value="${value}"${value === selected ? " selected" : ""}>${formatDuration(duration)}</option>`;
    })
    .join("");

  const showError = (message, options = {}) => {
    error.textContent = "";
    const messageEl = document.createElement("p");
    messageEl.textContent = message;
    error.appendChild(messageEl);
    if (options.phoneButton) {
      const phoneLink = document.createElement("a");
      phoneLink.className = "btn-primary error-phone-button";
      phoneLink.href = "tel:+491742997866";
      phoneLink.textContent = "0174 2997866";
      error.appendChild(phoneLink);
    }
    error.hidden = false;
    confirmation.hidden = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const clearMessages = () => {
    error.hidden = true;
    error.textContent = "";
  };

  const collectSchedules = () => {
    const schedules = {};
    appointmentContainer?.querySelectorAll("[data-service-schedule]").forEach((card) => {
      const service = card.dataset.serviceSchedule;
      schedules[service] = {
        frequency: card.querySelector("[data-schedule-frequency]:checked")?.value || "",
        windows: [...card.querySelectorAll("[data-date-group]")].map((group) => ({
          date: group.querySelector("[data-window-date]")?.value || "",
          dateEnd: group.querySelector("[data-window-date-end]")?.value || "",
          times: [...group.querySelectorAll("[data-time-window]")].map((row) => ({
            from: row.querySelector("[data-window-from]")?.value || "",
            to: row.querySelector("[data-window-to]")?.value || "",
          })),
        })),
      };
    });
    return schedules;
  };
  const collectServiceDurations = () => {
    const serviceDurations = {};
    form.querySelectorAll("[data-service-duration]").forEach((select) => {
      const service = select.dataset.serviceDuration;
      if (service) serviceDurations[service] = select.value || "0.5h";
    });
    return serviceDurations;
  };
  const scheduleData = () => {
    const schedules = collectSchedules();
    const serviceDurations = collectServiceDurations();
    return selectedServices().map((service) => ({
      service,
      duration: serviceDurations[service] || "0.5h",
      frequency: schedules[service]?.frequency || "",
      windows: schedules[service]?.windows || [],
    }));
  };
  const renderTimeWindow = (window = {}, removable = false) => `
    <div class="service-time-window" data-time-window>
      <div class="booking-field"><label>Von</label><select data-window-from required>${timeOptions(window.from)}</select></div>
      <div class="booking-field"><label>Bis</label><select data-window-to required>${timeOptions(window.to)}</select></div>
      ${removable ? '<button class="time-window-remove" type="button" data-remove-window aria-label="Zeitfenster entfernen">×</button>' : '<span class="time-window-placeholder" aria-hidden="true"></span>'}
    </div>
  `;
  const renderDateGroup = (group = {}, removable = false) => `
    <div class="service-date-group" data-date-group>
      ${removable ? '<div class="service-date-group-head"><span>Weiteres Datum</span><button class="appointment-date-remove-button" type="button" data-remove-date-group aria-label="Datum löschen">× Datum löschen</button></div>' : ""}
      <div class="booking-field">
        <label>Datum wählen</label>
        <div class="service-date-range">
          <input data-window-date type="date" min="${minDateValue}" value="${escapeHtml(group.date)}" required aria-label="Datum von">
          <span>bis</span>
          <input data-window-date-end type="date" min="${minDateValue}" value="${escapeHtml(group.dateEnd)}" aria-label="Datum bis optional">
        </div>
        <small class="date-range-help">Optional: Tragen Sie ein Bis-Datum ein, wenn die Aufgabe an mehreren Tagen in diesem Zeitfenster erledigt werden kann.</small>
      </div>
      <div class="service-time-window-list" data-time-window-list>
        ${(group.times?.length ? group.times : [{}]).map((window, index) => renderTimeWindow(window, index > 0)).join("")}
      </div>
      <button class="appointment-time-add-button" type="button" data-add-time-to-date>+ Weitere Uhrzeit für dieses Datum</button>
    </div>
  `;
  const renderScheduleBlocks = (savedSchedules = null) => {
    if (!appointmentContainer) return;
    const selected = selectedServices();
    const existing = savedSchedules || collectSchedules();
    if (!selected.length) {
      appointmentContainer.innerHTML = '<p class="form-help">Wählen Sie zuerst mindestens eine Dienstleistung aus. Danach können Sie pro Dienst Dauer, Zeitfenster und Häufigkeit angeben.</p>';
      return;
    }
    appointmentContainer.innerHTML = selected.map((service) => {
      const schedule = existing[service] || { duration: "", frequency: "", windows: [{}] };
      const dateGroups = schedule.windows?.length ? schedule.windows : [{}];
      return `
        <article class="service-schedule-card" data-service-schedule="${escapeHtml(service)}">
          <h4>${escapeHtml(service)}</h4>
          <div class="service-schedule-section">
            <strong>Wann soll die Hilfe stattfinden?</strong>
            <div class="service-date-group-list" data-date-group-list>
              ${dateGroups.map((group, index) => renderDateGroup(group, index > 0)).join("")}
            </div>
            <button class="appointment-date-add-button" type="button" data-add-date-group>+ Weiteres Datum hinzufügen</button>
          </div>
          <div class="service-schedule-section">
            <strong>Wie oft wird die Hilfe gebraucht?</strong>
            <div class="frequency-options inquiry-frequency">
              ${frequencies.map((frequency) => `
                <label><input type="radio" data-schedule-frequency name="frequency-${escapeHtml(service)}" value="${frequency}"${schedule.frequency === frequency ? " checked" : ""}><span><strong>${frequency}</strong></span></label>
              `).join("")}
            </div>
          </div>
        </article>
      `;
    }).join("");
    updateTimeOptions();
  };
  const updateTimeOptions = () => {
    appointmentContainer?.querySelectorAll("[data-time-window]").forEach((row) => {
      const from = row.querySelector("[data-window-from]")?.value || "";
      const toSelect = row.querySelector("[data-window-to]");
      if (!toSelect) return;
      [...toSelect.options].forEach((option) => {
        option.disabled = Boolean(option.value && from && option.value <= from);
      });
      if (toSelect.value && from && toSelect.value <= from) toSelect.value = "";
    });
  };

  const detailText = () => {
    const labels = {
      detailGardenSize: "Gartenfläche",
      detailGardenCustom: "Weitere Aufgaben",
      detailCareCustom: "Betreuung Hinweise",
      detailCleaningSize: "Fläche",
      detailCleaningCustom: "Weitere Aufgaben",
      detailOtherCustom: "Sonstige Aufgabe",
    };
    const lines = Object.entries(labels).map(([name, label]) => value(name) ? `${label}: ${value(name)}` : "").filter(Boolean);
    const tutoringRequests = collectTutoringRequests();
    if (tutoringRequests.length) {
      lines.push("Nachhilfe:");
      tutoringRequests.forEach((request, index) => {
        lines.push(`${index + 1}. ${request.grade || "Klasse nicht angegeben"}`);
        request.subjects.forEach((item) => {
          lines.push(`- ${item.subject}${item.topic ? `: ${item.topic}` : ""}`);
        });
      });
    }
    const buildTasks = collectBuildTasks();
    if (buildTasks.length) {
      lines.push(`Aufbau Aufgaben: ${buildTasks.map((item) => item.note ? `${item.task}: ${item.note}` : item.task).join(", ")}`);
    }
    const paintingTasks = collectPaintingTasks();
    if (paintingTasks.length) {
      lines.push(`Malerarbeiten: ${paintingTasks.map((item) => item.size ? `${item.task}: ${item.size}` : item.task).join(", ")}`);
    }
    if (selectedServices().includes("Bügeln")) {
      lines.push("Bügeln: Bügeln und Zusammenlegen");
    }
    [
      ["detailGardenTask", "Garten Dienste"],
      ["detailCareTask", "Betreuung Aufgaben"],
      ["detailCleaningTask", "Hausreinigung Dienste"],
    ].forEach(([name, label]) => {
      const selected = selectedValues(name);
      if (selected.length) lines.push(`${label}: ${selected.join(", ")}`);
    });
    return lines.join("\n");
  };
  const detailNotes = () => ({
    garden: { tasks: selectedValues("detailGardenTask"), size: value("detailGardenSize"), custom: value("detailGardenCustom") },
    tutoring: { requests: collectTutoringRequests() },
    care: { tasks: selectedValues("detailCareTask"), custom: value("detailCareCustom") },
    build: { tasks: collectBuildTasks() },
    painting: { tasks: collectPaintingTasks() },
    cleaning: { tasks: selectedValues("detailCleaningTask"), size: value("detailCleaningSize"), custom: value("detailCleaningCustom") },
    laundry: { tasks: selectedServices().includes("Bügeln") ? ["Bügeln", "Zusammenlegen"] : [] },
    other: { custom: value("detailOtherCustom") },
  });
  const updateDetailCards = () => {
    const selected = new Set(selectedServices());
    detailCards.forEach((card) => {
      card.hidden = !selected.has(card.dataset.serviceDetail);
    });
    updateServiceDurationFields();
    renderScheduleBlocks();
  };
  const serviceDurationId = (service) => `service-duration-${service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const renderServiceDurationField = (service, selected = "0.5h") => `
    <div class="booking-field service-duration-field" data-service-duration-field>
      <label for="${serviceDurationId(service)}">Dauer für ${escapeHtml(service)}</label>
      <select id="${serviceDurationId(service)}" data-service-duration="${escapeHtml(service)}" aria-label="Dauer für ${escapeHtml(service)}">
        ${durationOptions(selected || "0.5h")}
      </select>
    </div>
  `;
  const updateServiceDurationFields = () => {
    const selected = new Set(selectedServices());
    form.querySelectorAll(".service-choice-with-detail").forEach((wrapper) => {
      const input = wrapper.querySelector('[name="requested-services"]');
      if (!input) return;
      const service = input.value;
      const existing = wrapper.querySelector("[data-service-duration-field]");
      if (!selected.has(service)) {
        existing?.remove();
        return;
      }
      if (!existing) {
        const detailCard = wrapper.querySelector("[data-service-detail]");
        detailCard?.insertAdjacentHTML("beforebegin", renderServiceDurationField(service));
      }
    });
  };
  const updateMultiSelectList = (name) => {
    const list = form.querySelector(`[data-multi-select-list="${name}"]`);
    if (!list) return;
    const values = selectedValues(name);
    list.hidden = !values.length;
    list.innerHTML = values
      .map((item) => `<button type="button" data-remove-task="${escapeHtml(item)}" data-remove-task-list="${name}">${escapeHtml(item)} <span aria-hidden="true">×</span></button>`)
      .join("");
  };
  const hasCompleteSchedule = () => {
    const schedules = scheduleData();
    if (!schedules.length) return false;
    return schedules.every((schedule) =>
      schedule.duration &&
      schedule.frequency &&
      schedule.windows.length &&
      schedule.windows.every((group) =>
        group.date &&
        group.date >= minDateValue &&
        group.times?.length &&
        group.times.every((time) =>
          time.from &&
          time.to &&
          time.to > time.from
        )
      )
    );
  };
  const hasCompleteContactDetails = () => {
    const required = ["street", "zip", "city", "firstName", "lastName", "phone", "email"];
    return required.every((name) => Boolean(value(name))) && value("email").includes("@");
  };
  const privacyAccepted = () => form.querySelector('[name="privacyAccepted"]')?.checked === true;
  const mediationStartAccepted = () => form.querySelector('[name="mediationStartAccepted"]')?.checked === true;
  const canSubmit = () => step === 3 && selectedServices().length > 0 && hasCompleteSchedule() && hasCompleteContactDetails() && privacyAccepted() && mediationStartAccepted();
  const updateProgress = () => {
    panels.forEach((panel) => {
      const active = Number(panel.dataset.inquiryStep) === step;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    progress.forEach((button) => {
      const target = Number(button.dataset.stepJump);
      button.classList.toggle("active", target === step);
      button.classList.toggle("complete", target < step);
    });
    backButton.hidden = step === 1;
    nextButton.hidden = step === 3;
    submitButton.hidden = step !== 3;
    submitButton.disabled = !canSubmit();
  };

  const draftFields = () => [...form.querySelectorAll("input, select, textarea")]
    .filter((field) => field.name && field.type !== "file");
  const draftFieldKey = (field, index) => field.type === "checkbox" || field.type === "radio"
    ? `${field.name}::${field.value}`
    : `${field.name}::${index}`;
  const collectDraftFields = () => Object.fromEntries(draftFields().map((field, index) => [
    draftFieldKey(field, index),
    field.type === "checkbox" || field.type === "radio" ? field.checked : field.value,
  ]));
  const applyDraftFields = (fields = {}) => {
    draftFields().forEach((field, index) => {
      const key = draftFieldKey(field, index);
      if (!(key in fields)) return;
      if (field.type === "checkbox" || field.type === "radio") {
        field.checked = fields[key] === true;
      } else {
        field.value = fields[key] || "";
      }
    });
  };
  const saveDraft = () => {
    if (restoringDraft) return;
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify({
        step,
        maxStep,
        fields: collectDraftFields(),
        multiSelects: Object.fromEntries(multiSelectLists.map((list) => [list.dataset.multiSelectList, selectedValues(list.dataset.multiSelectList)])),
        schedules: collectSchedules(),
        serviceDurations: collectServiceDurations(),
        tutoringRequests: collectTutoringRequests(),
        buildTasks: collectBuildTasks(),
        paintingTasks: collectPaintingTasks(),
        selectedServices: selectedServices(),
      }));
    } catch {
      // Local draft saving is best-effort.
    }
  };
  const clearDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // Local draft saving is best-effort.
    }
  };
  const restoreDraft = () => {
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(draftStorageKey) || "null");
    } catch {
      return false;
    }
    if (!draft) return false;

    restoringDraft = true;
    form.querySelectorAll('[name="requested-services"]').forEach((input) => {
      const selectedDraftServices = Array.isArray(draft.selectedServices) ? draft.selectedServices.map(normalizeServiceName) : [];
      input.checked = selectedDraftServices.includes(input.value);
    });
    applyDraftFields(draft.fields);
    multiSelectLists.forEach((list) => {
      const values = draft.multiSelects?.[list.dataset.multiSelectList] || [];
      const normalizedValues = list.dataset.multiSelectList === "detailPaintingTask" && Array.isArray(values)
        ? values.map(normalizePaintingTask)
        : values;
      list.dataset.values = JSON.stringify(Array.isArray(normalizedValues) ? normalizedValues : []);
      updateMultiSelectList(list.dataset.multiSelectList);
    });
    const tutoringList = form.querySelector("[data-tutoring-request-list]");
    if (tutoringList && Array.isArray(draft.tutoringRequests)) {
      tutoringList.innerHTML = draft.tutoringRequests.map((request) => renderTutoringRequest(request)).join("");
    }
    const buildList = form.querySelector('[data-multi-select-list="detailBuildTask"]');
    if (buildList && Array.isArray(draft.buildTasks)) {
      buildList.innerHTML = draft.buildTasks.map((item) => renderBuildTaskItem(item.task, item.note)).join("");
      buildList.hidden = !draft.buildTasks.length;
    }
    const paintingList = form.querySelector('[data-multi-select-list="detailPaintingTask"]');
    if (paintingList && Array.isArray(draft.paintingTasks)) {
      paintingList.innerHTML = draft.paintingTasks.map((item) => renderPaintingTaskItem(item.task, item.size)).join("");
      paintingList.hidden = !draft.paintingTasks.length;
    }
    updateDetailCards();
    renderScheduleBlocks(draft.schedules);
    Object.entries(draft.serviceDurations || {}).forEach(([service, duration]) => {
      const select = [...form.querySelectorAll("[data-service-duration]")]
        .find((field) => field.dataset.serviceDuration === service);
      if (select) select.value = duration || "0.5h";
    });
    applyDraftFields(draft.fields);
    step = Math.min(3, Math.max(1, Number(draft.step) || 1));
    maxStep = Math.min(3, Math.max(step, Number(draft.maxStep) || step));
    updateTimeOptions();
    updateProgress();
    restoringDraft = false;
    return true;
  };

  const validateStep = (targetStep = step) => {
    clearMessages();
    if (targetStep === 1 && !selectedServices().length) {
      showError("Bitte wähle mindestens eine Dienstleistung aus.");
      return false;
    }
    if (targetStep === 2) {
      const schedules = scheduleData();
      if (!schedules.length) {
        showError("Bitte wähle zuerst mindestens eine Dienstleistung aus.");
        return false;
      }
      const invalid = schedules.find((schedule) =>
        !schedule.frequency ||
        !schedule.windows.length ||
        schedule.windows.some((group) =>
          !group.date ||
          group.date < minDateValue ||
          !group.times?.length ||
          group.times.some((time) =>
            !time.from ||
            !time.to ||
            time.to <= time.from
          )
        )
      );
      if (invalid) {
        showError("Bitte fülle Datum, Von/Bis-Zeit und Häufigkeit für jede ausgewählte Dienstleistung aus.");
        return false;
      }
    }
    if (targetStep === 3) {
      const required = ["street", "zip", "city", "firstName", "lastName", "phone", "email"];
      if (required.some((name) => !value(name))) {
        showError("Bitte fülle Adresse und Kontaktdaten vollständig aus.");
        return false;
      }
      if (!value("email").includes("@")) {
        showError("Bitte gib eine gültige E-Mail-Adresse ein.");
        return false;
      }
      if (!privacyAccepted()) {
        showError("Bitte bestätige die Datenschutzerklärung.");
        return false;
      }
      if (!mediationStartAccepted()) {
        showError("Bitte bestätigen Sie, dass Heinzelchen nach Eingang Ihrer Anfrage sofort mit der Vermittlung beginnen darf.");
        return false;
      }
    }
    return true;
  };
  const goToStep = (target) => {
    if (target > step && !validateStep(step)) return;
    step = target;
    maxStep = Math.max(maxStep, step);
    clearMessages();
    if (step === 2) renderScheduleBlocks();
    updateProgress();
    saveDraft();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  nextButton.addEventListener("click", () => goToStep(Math.min(3, step + 1)));
  backButton.addEventListener("click", () => goToStep(Math.max(1, step - 1)));
  progress.forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.stepJump);
      if (target <= maxStep || target === step + 1) goToStep(target);
    });
  });
  form.addEventListener("click", (event) => {
    window.setTimeout(saveDraft, 0);

    const addTimeToDate = event.target.closest("[data-add-time-to-date]");
    if (addTimeToDate) {
      const group = addTimeToDate.closest("[data-date-group]");
      group?.querySelector("[data-time-window-list]")?.insertAdjacentHTML("beforeend", renderTimeWindow({}, true));
      updateTimeOptions();
      updateProgress();
      return;
    }

    const addDateGroup = event.target.closest("[data-add-date-group]");
    if (addDateGroup) {
      addDateGroup.closest("[data-service-schedule]")?.querySelector("[data-date-group-list]")?.insertAdjacentHTML("beforeend", renderDateGroup({}, true));
      updateTimeOptions();
      updateProgress();
      return;
    }

    const removeDateGroup = event.target.closest("[data-remove-date-group]");
    if (removeDateGroup) {
      removeDateGroup.closest("[data-date-group]")?.remove();
      updateProgress();
      return;
    }

    const removeWindow = event.target.closest("[data-remove-window]");
    if (removeWindow) {
      removeWindow.closest("[data-time-window]")?.remove();
      updateProgress();
      return;
    }

    const addTutoringRequest = event.target.closest("[data-add-tutoring-request]");
    if (addTutoringRequest) {
      form.querySelector("[data-tutoring-request-list]")?.insertAdjacentHTML("beforeend", renderTutoringRequest());
      updateProgress();
      return;
    }

    const removeTutoringRequest = event.target.closest("[data-remove-tutoring-request]");
    if (removeTutoringRequest) {
      removeTutoringRequest.closest("[data-tutoring-request]")?.remove();
      updateProgress();
      return;
    }

    const removeTutoringSubject = event.target.closest("[data-remove-tutoring-subject]");
    if (removeTutoringSubject) {
      const list = removeTutoringSubject.closest("[data-tutoring-subject-list]");
      removeTutoringSubject.closest("[data-tutoring-subject-item]")?.remove();
      if (list && !list.querySelector("[data-tutoring-subject-item]")) list.hidden = true;
      updateProgress();
      return;
    }

    const removeBuildTask = event.target.closest("[data-remove-build-task]");
    if (removeBuildTask) {
      const list = removeBuildTask.closest("[data-multi-select-list]");
      removeBuildTask.closest("[data-build-task-item]")?.remove();
      if (list && !list.querySelector("[data-build-task-item]")) list.hidden = true;
      updateProgress();
      return;
    }

    const removePaintingTask = event.target.closest("[data-remove-painting-task]");
    if (removePaintingTask) {
      const list = removePaintingTask.closest("[data-multi-select-list]");
      removePaintingTask.closest("[data-painting-task-item]")?.remove();
      if (list && !list.querySelector("[data-painting-task-item]")) list.hidden = true;
      updateProgress();
      return;
    }

    const removeTask = event.target.closest("[data-remove-task]");
    if (removeTask) {
      const list = form.querySelector(`[data-multi-select-list="${removeTask.dataset.removeTaskList}"]`);
      if (!list) return;
      list.dataset.values = JSON.stringify(selectedValues(removeTask.dataset.removeTaskList).filter((item) => item !== removeTask.dataset.removeTask));
      updateMultiSelectList(removeTask.dataset.removeTaskList);
    }
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches('[name="requested-services"]')) updateDetailCards();
    if (event.target.matches("[data-window-from]")) updateTimeOptions();
    updateProgress();
    saveDraft();
  });
  form.addEventListener("input", () => {
    updateProgress();
    saveDraft();
  });
  window.addEventListener("beforeunload", saveDraft);
  form.querySelectorAll("[data-multi-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const name = select.dataset.multiSelect;
      const list = form.querySelector(`[data-multi-select-list="${name}"]`);
      if (!select.value || !list) return;
      if (name === "detailBuildTask") {
        list.insertAdjacentHTML("beforeend", renderBuildTaskItem(select.value));
        list.hidden = false;
        select.value = "";
        updateProgress();
        saveDraft();
        return;
      }
      if (name === "detailPaintingTask") {
        list.insertAdjacentHTML("beforeend", renderPaintingTaskItem(select.value));
        list.hidden = false;
        select.value = "";
        updateProgress();
        saveDraft();
        return;
      }
      const values = selectedValues(name);
      if (!values.includes(select.value)) values.push(select.value);
      list.dataset.values = JSON.stringify(values);
      select.value = "";
      updateMultiSelectList(name);
      saveDraft();
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(3) || !validateStep(2)) return;

    submitButton.disabled = true;
    submitButton.textContent = "Anfrage wird gesendet ...";
    const schedules = scheduleData();
    const firstWindow = schedules.flatMap((schedule) =>
      schedule.windows.flatMap((group) =>
        group.times.map((time) => ({ ...time, date: group.date, dateEnd: group.dateEnd || "", service: schedule.service }))
      )
    )[0] || {};

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: selectedServices(),
          extraTask: detailText(),
          locationNotes: value("locationNotes"),
          availability: { serviceAppointments: schedules },
          detailNotes: detailNotes(),
          name: [value("firstName"), value("lastName")].filter(Boolean).join(" "),
          address: [value("street"), value("zip"), value("city")].filter(Boolean).join(", "),
          contact: [value("email"), value("phone")].filter(Boolean).join(", "),
          duration: schedules.map((schedule) => `${schedule.service}: ${schedule.duration}`).join("; "),
          frequency: schedules.map((schedule) => `${schedule.service}: ${schedule.frequency}`).join("; "),
          firstName: value("firstName"),
          lastName: value("lastName"),
          street: value("street"),
          zip: value("zip"),
          city: value("city"),
          phone: value("phone"),
          email: value("email"),
          privacyAccepted: privacyAccepted(),
          mediationStartAccepted: mediationStartAccepted(),
          date: firstWindow.date || "",
          time: firstWindow.from || "",
        }),
      });
      if (!response.ok) throw new Error("Anfrage konnte nicht gesendet werden.");
      confirmation.hidden = false;
      error.hidden = true;
      form.reset();
      clearDraft();
      multiSelectLists.forEach((list) => {
        list.dataset.values = "[]";
        updateMultiSelectList(list.dataset.multiSelectList);
      });
      step = 1;
      maxStep = 1;
      updateDetailCards();
      updateProgress();
    } catch {
      showError("Ihre Buchungsanfrage konnte aktuell nicht übermittelt werden. Bitte versuchen Sie es erneut oder rufen Sie uns direkt an.", { phoneButton: true });
    } finally {
      submitButton.textContent = "Heinzelchen anfragen";
      updateProgress();
    }
  });

  if (!restoreDraft()) {
    multiSelectLists.forEach((list) => updateMultiSelectList(list.dataset.multiSelectList));
    updateDetailCards();
    updateProgress();
  }
})();
