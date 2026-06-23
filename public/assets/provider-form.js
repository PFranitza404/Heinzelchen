(() => {
  const form = document.querySelector("#publicWorkerForm");
  if (!form) return;

  const message = document.querySelector("#publicWorkerFormMessage");
  const error = document.querySelector("#publicWorkerFormError");
  const panels = [...form.querySelectorAll("[data-provider-step]")];
  const progress = [...form.querySelectorAll("[data-provider-step-jump]")];
  const backButton = form.querySelector("[data-provider-back]");
  const nextButton = form.querySelector("[data-provider-next]");
  const submitButton = form.querySelector(".form-submit");
  const servicesInput = form.querySelector("[data-provider-skills-value]");
  const availabilityRows = [...form.querySelectorAll(".availability-day-row")];
  const serviceCards = [...form.querySelectorAll("[data-provider-service]")];
  const gradePanel = form.querySelector("[data-provider-grade-panel]");
  const tutoringSubjectsContainer = form.querySelector("[data-provider-tutoring-subjects]");
  const tutoringSubjects = ["Mathe", "Deutsch", "Chemie", "Physik", "Biologie", "Englisch", "Französisch", "Spanisch", "Latein", "Geschichte", "Politik & Wirtschaft", "Religion", "Erdkunde", "Informatik"];
  let step = 1;
  let maxStep = 1;
  const confirmedServices = new Set();

  const value = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() || "";
  const values = (name) => [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
  const priceName = (service) => `price${service.replace(/[^A-Za-zÄÖÜäöüß]/g, "")}`;
  const servicePriceInput = (card) => card.querySelector(`[name="${priceName(card.dataset.providerService)}"]`);
  const slug = (text) => `${text}`.replace(/[^A-Za-z0-9]/g, "");

  const showError = (text) => {
    if (!error) return;
    error.textContent = text;
    error.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const clearError = () => {
    if (!error) return;
    error.textContent = "";
    error.hidden = true;
  };

  const markInvalid = (elements) => {
    form.querySelectorAll(".provider-invalid").forEach((item) => item.classList.remove("provider-invalid"));
    elements.forEach((element) => element?.classList.add("provider-invalid"));
  };

  const updateAvailabilityRows = () => {
    availabilityRows.forEach((row) => {
      const checked = row.querySelector("[data-provider-day]")?.checked;
      row.querySelectorAll("[data-provider-time]").forEach((select) => {
        select.disabled = !checked;
      });
    });
  };

  const updateSkillsValue = () => {
    servicesInput.value = [...confirmedServices].join(", ");
    serviceCards.forEach((card) => {
      const service = card.dataset.providerService;
      const confirmed = confirmedServices.has(service);
      const status = card.querySelector("[data-provider-service-status]");
      card.classList.toggle("confirmed", confirmed);
      if (status) status.textContent = confirmed ? "✓" : "";
    });
  };

  const tutoringSubjectName = (grade) => `tutoringSubjects${slug(grade)}`;

  const collectTutoringByGrade = () => values("tutoringGrades").map((grade) => ({
    grade,
    subjects: values(tutoringSubjectName(grade)),
  }));

  const renderTutoringSubjectsByGrade = () => {
    if (!gradePanel || !tutoringSubjectsContainer) return;
    const selectedGrades = values("tutoringGrades");
    const previous = Object.fromEntries(collectTutoringByGrade().map((item) => [item.grade, item.subjects]));
    gradePanel.hidden = selectedGrades.length === 0;
    tutoringSubjectsContainer.innerHTML = selectedGrades.map((grade) => {
      const name = tutoringSubjectName(grade);
      const checkedSubjects = previous[grade] || [];
      return `
        <section class="provider-tutoring-grade-subjects" data-tutoring-grade="${grade}">
          <h4>${grade}</h4>
          <div class="provider-chip-grid">
            ${tutoringSubjects.map((subject) => `
              <label><input type="checkbox" name="${name}" value="${subject}"${checkedSubjects.includes(subject) ? " checked" : ""}><span>${subject}</span></label>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");
  };

  const toggleStep = () => {
    panels.forEach((panel) => {
      const active = Number(panel.dataset.providerStep) === step;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    progress.forEach((button) => {
      const target = Number(button.dataset.providerStepJump);
      button.classList.toggle("active", target === step);
      button.classList.toggle("complete", target < step);
      button.disabled = target > maxStep;
    });
    if (backButton) backButton.hidden = step === 1;
    if (nextButton) nextButton.hidden = step === 3;
    if (submitButton) submitButton.hidden = step !== 3;
  };

  const validateServiceCard = (card) => {
    const service = card.dataset.providerService;
    const invalid = [];
    const price = servicePriceInput(card);
    if (!price?.value) invalid.push(price);
    if (service === "Nachhilfe") {
      const tutoringByGrade = collectTutoringByGrade();
      if (!tutoringByGrade.length) invalid.push(card.querySelector("[data-provider-tutoring-grades]"));
      tutoringByGrade.forEach((item) => {
        if (!item.subjects.length) {
          invalid.push(card.querySelector(`[data-tutoring-grade="${item.grade}"]`));
        }
      });
    }
    if (service === "Kinderbetreuung") {
      const certificate = card.querySelector("[data-childcare-certificate]");
      if (!certificate?.files?.length) invalid.push(certificate);
    }
    return invalid;
  };

  const validateStep = (targetStep = step) => {
    clearError();
    markInvalid([]);
    if (targetStep === 1) {
      if (!confirmedServices.size) {
        showError("Bitte füge mindestens eine Dienstleistung mit Stundenpreis hinzu.");
        return false;
      }
    }
    if (targetStep === 2) {
      const required = ["firstName", "lastName", "email", "phone", "street", "zip", "city", "birthdate"];
      const invalid = required
        .map((name) => form.querySelector(`[name="${name}"]`))
        .filter((field) => {
          if (!field) return false;
          if (field.type === "file") return !field.files?.length;
          return !field.value.trim();
        });
      if (value("email") && !value("email").includes("@")) invalid.push(form.querySelector('[name="email"]'));
      if (invalid.length) {
        markInvalid(invalid);
        showError("Bitte fülle alle Pflichtfelder aus.");
        return false;
      }
    }
    if (targetStep === 3) {
      const consents = ["adultSelfEmployedConfirmed", "termsAccepted", "privacyAccepted"]
        .map((name) => form.querySelector(`[name="${name}"]`))
        .filter((field) => !field?.checked);
      if (consents.length) {
        markInvalid(consents.map((field) => field.closest(".provider-consent-check")));
        showError("Bitte bestätige alle essenziellen Pflichtcheckboxen.");
        return false;
      }
    }
    return true;
  };

  serviceCards.forEach((card) => {
    card.querySelector("[data-provider-service-toggle]")?.addEventListener("click", () => {
      const detail = card.querySelector("[data-provider-service-detail]");
      if (detail) detail.hidden = !detail.hidden;
    });

    card.querySelector("[data-provider-add-service]")?.addEventListener("click", () => {
      const invalid = validateServiceCard(card);
      if (invalid.length) {
        markInvalid(invalid);
        showError("Bitte ergänze die notwendigen Angaben für diese Dienstleistung.");
        return;
      }
      clearError();
      markInvalid([]);
      confirmedServices.add(card.dataset.providerService);
      const detail = card.querySelector("[data-provider-service-detail]");
      if (detail) detail.hidden = true;
      updateSkillsValue();
    });
  });

  form.querySelectorAll('[name="tutoringGrades"]').forEach((input) => {
    input.addEventListener("change", renderTutoringSubjectsByGrade);
  });

  availabilityRows.forEach((row) => {
    row.querySelector("[data-provider-day]")?.addEventListener("change", updateAvailabilityRows);
  });

  progress.forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.providerStepJump);
      if (target <= step || target <= maxStep) {
        step = target;
        clearError();
        toggleStep();
      }
    });
  });

  backButton?.addEventListener("click", () => {
    step = Math.max(1, step - 1);
    clearError();
    toggleStep();
  });

  nextButton?.addEventListener("click", () => {
    if (!validateStep(step)) return;
    step = Math.min(3, step + 1);
    maxStep = Math.max(maxStep, step);
    toggleStep();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(3)) return;

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
    const childcareCertificate = data.get("childcareCertificate");
    const firstName = data.get("firstName") || "";
    const lastName = data.get("lastName") || "";

    const serviceDetails = [...confirmedServices].map((service) => ({
      service,
      hourlyRate: data.get(priceName(service)) || "",
      tutoringByGrade: service === "Nachhilfe" ? collectTutoringByGrade() : [],
      tutoringSubjects: service === "Nachhilfe" ? [...new Set(collectTutoringByGrade().flatMap((item) => item.subjects))] : [],
      tutoringGrades: service === "Nachhilfe" ? data.getAll("tutoringGrades") : [],
      childcareCertificateName: service === "Kinderbetreuung" ? childcareCertificate?.name || "" : "",
    }));

    const worker = {
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      email: data.get("email"),
      phone: data.get("phone"),
      street: data.get("street"),
      zip: data.get("zip"),
      city: data.get("city"),
      birthdate: data.get("birthdate"),
      serviceArea: localAreas.length ? localAreas.join(", ") : data.get("city"),
      radiusKm: data.get("radiusKm"),
      leadTime: "Nach Absprache",
      skills: [...confirmedServices],
      serviceDetails,
      extraSkills: data.get("extraSkills"),
      localAreas,
      availability,
      areaNotes: data.get("areaNotes"),
      qualificationConfirmed: true,
      adultSelfEmployedConfirmed: data.get("adultSelfEmployedConfirmed") === "on",
      termsAccepted: data.get("termsAccepted") === "on",
      privacyAccepted: data.get("privacyAccepted") === "on",
      childcareCertificateName: childcareCertificate?.name || "",
      registrationType: "Aufgabenverteiler / unverbindliche Registrierung",
    };

    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(worker),
      });
      if (!response.ok) throw new Error("Speichern fehlgeschlagen");
      if (message) message.textContent = "Registrierung erhalten. Wir prüfen deine Angaben und melden uns mit passenden Aufgaben.";
      form.reset();
      confirmedServices.clear();
      step = 1;
      maxStep = 1;
      updateSkillsValue();
      renderTutoringSubjectsByGrade();
      updateAvailabilityRows();
      toggleStep();
    } catch {
      if (message) message.textContent = "Die Registrierung konnte nicht gespeichert werden. Bitte starte die Website über den lokalen Server.";
    }
  });

  updateSkillsValue();
  renderTutoringSubjectsByGrade();
  updateAvailabilityRows();
  toggleStep();
})();
