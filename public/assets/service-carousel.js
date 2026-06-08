(() => {
  const root = document.querySelector("[data-service-carousel]");
  if (!root) return;

  const cards = [...root.querySelectorAll(".service-carousel-card")];
  const dots = [...root.querySelectorAll("[data-service-dot]")];
  const nameEl = root.querySelector("[data-service-name]");
  const descriptionEl = root.querySelector("[data-service-description]");
  const priceEl = root.querySelector("[data-service-price]");
  let current = 0;
  let locked = false;

  function update(index) {
    if (locked || !cards.length) return;
    locked = true;
    current = (index + cards.length) % cards.length;

    cards.forEach((card, cardIndex) => {
      const offset = (cardIndex - current + cards.length) % cards.length;
      card.classList.remove("center", "up-1", "up-2", "down-1", "down-2", "hidden");

      if (offset === 0) card.classList.add("center");
      else if (offset === 1) card.classList.add("down-1");
      else if (offset === 2) card.classList.add("down-2");
      else if (offset === cards.length - 1) card.classList.add("up-1");
      else if (offset === cards.length - 2) card.classList.add("up-2");
      else card.classList.add("hidden");
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === current);
    });

    const active = cards[current];
    [nameEl, descriptionEl, priceEl].forEach((element) => {
      if (element) element.style.opacity = "0";
    });

    window.setTimeout(() => {
      if (nameEl) nameEl.textContent = active.dataset.name;
      if (descriptionEl) descriptionEl.textContent = active.dataset.description;
      if (priceEl) priceEl.textContent = active.dataset.price;
      [nameEl, descriptionEl, priceEl].forEach((element) => {
        if (element) element.style.opacity = "1";
      });
    }, 180);

    window.setTimeout(() => {
      locked = false;
    }, 720);
  }

  root.querySelectorAll("[data-service-prev]").forEach((button) => {
    button.addEventListener("click", () => update(current - 1));
  });
  root.querySelectorAll("[data-service-next]").forEach((button) => {
    button.addEventListener("click", () => update(current + 1));
  });
  dots.forEach((dot) => {
    dot.addEventListener("click", () => update(Number(dot.dataset.serviceDot)));
  });
  cards.forEach((card, index) => {
    card.addEventListener("click", () => update(index));
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") update(current - 1);
    if (event.key === "ArrowDown") update(current + 1);
  });

  let touchStartY = 0;
  root.addEventListener("touchstart", (event) => {
    touchStartY = event.changedTouches[0].screenY;
  }, { passive: true });
  root.addEventListener("touchend", (event) => {
    const distance = touchStartY - event.changedTouches[0].screenY;
    if (Math.abs(distance) < 45) return;
    update(distance > 0 ? current + 1 : current - 1);
  }, { passive: true });

  update(0);
})();
