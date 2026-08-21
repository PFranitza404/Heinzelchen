const fs = require("node:fs");
const path = require("node:path");

const SITE_ORIGIN = "https://www.heinzelchen.com";

const canonicalPathsByFile = {
  "index.html": "/",
  "agb.html": "/agb",
  "anbieter-werden.html": "/anbieter-werden",
  "arbeiter-dashboard.html": "/arbeiter-dashboard",
  "arbeiter-portal.html": "/arbeiter-portal",
  "arbeiter-registrierung.html": "/arbeiter-registrierung",
  "bewertungen.html": "/bewertungen",
  "buchen.html": "/buchen",
  "datenschutz.html": "/datenschutz",
  "dienstleister-profil.html": "/dienstleister-profil",
  "impressum.html": "/impressum",
  "kontakt-aufnehmen.html": "/kontakt-aufnehmen",
  "kontakt.html": "/kontakt",
  "leistungen.html": "/leistungen",
  "nutzungsbedingungen.html": "/nutzungsbedingungen",
  "presse.html": "/presse",
  "so-funktionierts.html": "/so-funktionierts",
  "vermittlung.html": "/vermittlung",
};

const seoByPath = {
  "/": {
    title: "Alltagshilfe, die zu dir kommt | Heinzelchen",
    description:
      "Heinzelchen vermittelt verlässliche Alltagshilfe für Haushalt, Garten, Betreuung, Nachhilfe, Aufbau und weitere Aufgaben.",
  },
  "/agb": {
    title: "Allgemeine Geschäftsbedingungen | Heinzelchen",
    description: "Allgemeine Geschäftsbedingungen von Heinzelchen für Kundinnen, Kunden und vermittelte Dienstleistungen.",
  },
  "/anbieter-werden": {
    title: "Dienstleister werden | Heinzelchen",
    description:
      "Werde Heinzelchen und biete deine Hilfe flexibel für Haushalt, Betreuung, Garten, Nachhilfe und weitere Aufgaben an.",
  },
  "/arbeiter-dashboard": {
    title: "Arbeiter Dashboard | Heinzelchen",
    description: "Persönlicher Heinzelchen-Dashboardbereich für registrierte Helferinnen und Helfer.",
    robots: "noindex, follow",
  },
  "/arbeiter-portal": {
    title: "Arbeiter Portal | Heinzelchen",
    description: "Login- und Portalbereich für Heinzelchen-Helferinnen und -Helfer.",
    robots: "noindex, follow",
  },
  "/arbeiter-registrierung": {
    title: "Arbeiter Registrierung | Heinzelchen",
    description: "Registrierungsbereich für neue Heinzelchen-Helferinnen und -Helfer.",
    robots: "noindex, follow",
  },
  "/bewertungen": {
    title: "Erfahrungen und Bewertungen | Heinzelchen",
    description:
      "Erfahrungen mit Heinzelchen: Stimmen von Menschen, die Alltagshilfe gebucht oder selbst Unterstützung angeboten haben.",
  },
  "/buchen": {
    title: "Heinzelchen buchen | Alltagshilfe anfragen",
    description:
      "Buche persönliche Alltagshilfe über Heinzelchen und stelle eine Anfrage für Haushalt, Betreuung, Garten, Nachhilfe oder Aufbau.",
  },
  "/datenschutz": {
    title: "Datenschutzerklärung | Heinzelchen",
    description: "Datenschutzerklärung von Heinzelchen mit Informationen zur Verarbeitung personenbezogener Daten.",
  },
  "/dienstleister-profil": {
    title: "Heinzelchen Profil anlegen | Heinzelchen",
    description: "Profilbereich für Heinzelchen-Dienstleisterinnen und -Dienstleister.",
    robots: "noindex, follow",
  },
  "/impressum": {
    title: "Impressum | Heinzelchen",
    description: "Impressum und Anbieterkennzeichnung von Heinzelchen.",
  },
  "/kontakt-aufnehmen": {
    title: "Kontakt aufnehmen | Heinzelchen",
    description: "Nimm Kontakt mit Heinzelchen auf, wenn du Fragen zur Vermittlung oder zur Alltagshilfe hast.",
  },
  "/kontakt": {
    title: "Unser Antrieb | Heinzelchen",
    description: "Lerne Heinzelchen, die Idee hinter der Plattform und den persönlichen Anspruch an Alltagshilfe kennen.",
  },
  "/leistungen": {
    title: "Leistungen für Haushalt und Alltag | Heinzelchen",
    description:
      "Entdecke die Heinzelchen-Leistungen von Hausreinigung und Gartenarbeit bis Nachhilfe, Betreuung, Aufbau und Bügeln.",
  },
  "/nutzungsbedingungen": {
    title: "Nutzungsbedingungen für Dienstleister | Heinzelchen",
    description: "Nutzungsbedingungen für Dienstleisterinnen und Dienstleister bei Heinzelchen.",
  },
  "/presse": {
    title: "Presse und Medienkontakt | Heinzelchen",
    description: "Informationen für Medien und Partner sowie Kontaktmöglichkeiten für Presseanfragen zu Heinzelchen.",
  },
  "/so-funktionierts": {
    title: "So funktioniert Heinzelchen | In 3 Schritten zur Hilfe",
    description: "So funktioniert Heinzelchen: Anfrage stellen, passendes Heinzelchen finden und Alltagshilfe erhalten.",
  },
  "/vermittlung": {
    title: "Vermittlung | Heinzelchen",
    description: "Informationen zur Vermittlung über Heinzelchen und zur Rolle der Plattform zwischen Kunden und Helfenden.",
  },
};

const cleanHrefByLegacyHref = {
  "index.html": "/",
  "agb.html": "/agb",
  "anbieter-werden.html": "/anbieter-werden",
  "arbeiter-dashboard.html": "/arbeiter-dashboard",
  "arbeiter-portal.html": "/arbeiter-portal",
  "arbeiter-registrierung.html": "/arbeiter-registrierung",
  "bewertungen.html": "/bewertungen",
  "buchen.html": "/buchen",
  "datenschutz.html": "/datenschutz",
  "dienstleister-profil.html": "/dienstleister-profil",
  "impressum.html": "/impressum",
  "kontakt-aufnehmen.html": "/kontakt-aufnehmen",
  "kontakt.html": "/kontakt",
  "leistungen.html": "/leistungen",
  "nutzungsbedingungen.html": "/nutzungsbedingungen",
  "presse.html": "/presse",
  "so-funktionierts.html": "/so-funktionierts",
  "vermittlung.html": "/vermittlung",
};

function cleanInternalHref(href) {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return href;
  const normalized = href.replace(/^https?:\/\/(?:www\.)?heinzelchen\.com\/?/i, "");
  const [pathPart, hashPart = ""] = normalized.split("#");
  const replacement = cleanHrefByLegacyHref[pathPart];
  if (!replacement) return href;
  return hashPart ? `${replacement}#${hashPart}` : replacement;
}

function rewriteInternalLinks(html) {
  return html.replace(/\bhref=(["'])([^"']+)\1/gi, (match, quote, href) => {
    return `href=${quote}${cleanInternalHref(href)}${quote}`;
  });
}

function readHtmlPage(fileName) {
  const html = fs.readFileSync(path.join(process.cwd(), "legacy-html", fileName), "utf8");
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "Heinzelchen";
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const scripts = [];
  const bodyWithoutScripts = body.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, inline) => {
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1] || "";
    scripts.push({ attrs, src, inline });
    return "";
  });
  const bodyClass = html.match(/<body[^>]*class=["']([^"']+)["'][^>]*>/i)?.[1] || "";
  const canonicalPath = canonicalPathsByFile[fileName] || "/";
  const seo = seoByPath[canonicalPath] || {};
  return {
    title: seo.title || title,
    description: seo.description || "Heinzelchen vermittelt persönliche Alltagshilfe einfach und verlässlich.",
    canonicalUrl: `${SITE_ORIGIN}${canonicalPath === "/" ? "/" : canonicalPath}`,
    robots: seo.robots || "index, follow",
    body: rewriteInternalLinks(bodyWithoutScripts),
    scripts,
    bodyClass,
  };
}

function getStaticHtmlProps(fileName) {
  return {
    props: readHtmlPage(fileName),
  };
}

module.exports = {
  getStaticHtmlProps,
};
