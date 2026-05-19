(() => {
  const root = document.querySelector("[data-booking-flow]");
  if (!root) return;

  const dateInput = root.querySelector('[name="date"]');
  const cityInput = root.querySelector('[name="city"]');
  const timeSelect = root.querySelector("[data-available-times]");
  if (!dateInput || !timeSelect) return;

  const selectedServices = () => [...root.querySelectorAll('[name="requested-services"]:checked')].map((input) => input.value);

  async function loadSlots() {
    const date = dateInput.value;
    if (!date) {
      timeSelect.innerHTML = '<option value="">Bitte erst Datum wählen</option>';
      return;
    }
    timeSelect.innerHTML = '<option value="">Freie Zeiten werden geladen ...</option>';
    const params = new URLSearchParams({ date, city: cityInput?.value || "" });
    selectedServices().forEach((service) => params.append("services", service));
    try {
      const response = await fetch(`/api/availability?${params.toString()}`);
      if (!response.ok) throw new Error("Keine Zeiten");
      const data = await response.json();
      timeSelect.innerHTML = data.slots.length
        ? '<option value="">Uhrzeit auswählen</option>' + data.slots.map((slot) => `<option value="${slot}">${slot} Uhr</option>`).join("")
        : '<option value="">Für diesen Zeitraum sind leider keine Helfer verfügbar</option>';
    } catch {
      timeSelect.innerHTML = '<option value="">Zeiten konnten nicht geladen werden</option>';
    }
    timeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  dateInput.addEventListener("change", loadSlots);
  cityInput?.addEventListener("change", loadSlots);
  root.querySelectorAll('[name="requested-services"]').forEach((input) => input.addEventListener("change", loadSlots));
})();
