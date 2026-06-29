(() => {
  const consentName = "cookieConsent";
  const googleFontsHref = "https://fonts.googleapis.com/css2?family=Bree+Serif&family=Fraunces:opsz,wght@9..144,700;9..144,900&family=Lato:wght@300;400;700&family=Lora:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap";

  const getConsent = () => document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${consentName}=`))
    ?.split("=")[1] || "";

  const setConsent = (value) => {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${consentName}=${value}; expires=${expires}; path=/; SameSite=Lax`;
  };

  const loadGoogleFonts = () => {
    if (document.querySelector('link[data-cookie-google-fonts]')) return;
    const preconnectGoogle = document.createElement("link");
    preconnectGoogle.rel = "preconnect";
    preconnectGoogle.href = "https://fonts.googleapis.com";
    preconnectGoogle.dataset.cookieGoogleFonts = "true";
    document.head.appendChild(preconnectGoogle);

    const preconnectStatic = document.createElement("link");
    preconnectStatic.rel = "preconnect";
    preconnectStatic.href = "https://fonts.gstatic.com";
    preconnectStatic.crossOrigin = "anonymous";
    preconnectStatic.dataset.cookieGoogleFonts = "true";
    document.head.appendChild(preconnectStatic);

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = googleFontsHref;
    stylesheet.dataset.cookieGoogleFonts = "true";
    document.head.appendChild(stylesheet);
  };

  const showMapsHint = () => {
    const streetInput = document.querySelector('[name="street"]');
    if (!streetInput || document.querySelector("[data-maps-consent-hint]")) return;
    const hint = document.createElement("p");
    hint.className = "maps-consent-hint";
    hint.dataset.mapsConsentHint = "true";
    hint.textContent = "Bitte akzeptiere Cookies um die Kartensuche zu nutzen.";
    streetInput.insertAdjacentElement("afterend", hint);
  };

  const removeMapsHint = () => {
    document.querySelectorAll("[data-maps-consent-hint]").forEach((hint) => hint.remove());
  };

  const loadGoogleMaps = () => {
    if (typeof window.initAddressAutocomplete !== "function") return;
    if (window.google?.maps?.places) {
      removeMapsHint();
      window.initAddressAutocomplete();
      return;
    }
    if (document.querySelector('script[data-cookie-google-maps]')) return;
    const key = document.querySelector('meta[name="google-maps-api-key"]')?.content || window.heinzelchenGoogleMapsApiKey || "";
    if (!key) return;
    removeMapsHint();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=initAddressAutocomplete`;
    script.async = true;
    script.defer = true;
    script.dataset.cookieGoogleMaps = "true";
    document.head.appendChild(script);
  };

  const applyConsent = () => {
    const consent = getConsent();
    if (consent === "accepted") {
      loadGoogleFonts();
      loadGoogleMaps();
    } else {
      showMapsHint();
    }
  };

  const closeBanner = () => {
    document.querySelector("[data-cookie-banner]")?.remove();
  };

  const showBanner = () => {
    if (getConsent() || document.querySelector("[data-cookie-banner]")) return;
    const banner = document.createElement("section");
    banner.className = "cookie-banner";
    banner.dataset.cookieBanner = "true";
    banner.setAttribute("aria-label", "Cookie-Hinweis");
    banner.innerHTML = `
      <div class="cookie-banner__text">
        <strong>Cookies & externe Dienste</strong>
        <p>Wir nutzen notwendige Cookies für Grundfunktionen. Google Fonts und Google Maps laden wir erst, wenn du zustimmst. Mehr dazu findest du in der <a href="datenschutz.html">Datenschutzerklärung</a>.</p>
      </div>
      <div class="cookie-banner__actions">
        <button type="button" class="cookie-banner__button cookie-banner__button--primary" data-cookie-accept>Alle akzeptieren</button>
        <button type="button" class="cookie-banner__button" data-cookie-necessary>Nur notwendige</button>
      </div>
    `;
    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => {
      setConsent("accepted");
      closeBanner();
      applyConsent();
    });
    banner.querySelector("[data-cookie-necessary]").addEventListener("click", () => {
      setConsent("necessary");
      closeBanner();
      applyConsent();
    });
    document.body.appendChild(banner);
  };

  const initCookieBanner = () => {
    applyConsent();
    showBanner();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieBanner, { once: true });
  } else {
    initCookieBanner();
  }
})();
