const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.RESPONSIVE_BASE_URL || "http://127.0.0.1:3001";
const phase = process.env.RESPONSIVE_PHASE || "nachher";
const screenshotDir = path.join(process.cwd(), "test-screenshots");
const reportPath = path.join(screenshotDir, `responsive-audit-${phase}.md`);

const widths = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
const height = 900;
const pages = [
  ["startseite", "/index.html"],
  ["buchen", "/buchen.html"],
  ["heinzelchen-werden", "/anbieter-werden.html"],
  ["ueber-uns", "/kontakt.html"],
  ["kontakt", "/kontakt-aufnehmen.html"],
  ["agb", "/agb.html"],
  ["datenschutz", "/datenschutz.html"],
  ["nutzungsbedingungen", "/nutzungsbedingungen.html"],
  ["impressum", "/impressum.html"],
  ["presse", "/presse"],
  ["bewertungen", "/bewertungen"],
  ["so-funktionierts", "/so-funktionierts"],
  ["vermittlung", "/vermittlung"],
];

function slug(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function pageAudit(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const allowed = new Set(["HTML", "BODY"]);
    const overflowElements = [];
    const overlaps = [];
    const nav = document.querySelector("nav");
    const logo = document.querySelector("nav .nav-logo");
    const navLinks = document.querySelector(".nav-links");
    const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
    const htmlLang = document.documentElement.getAttribute("lang") || "";

    const visibleElements = [...document.body.querySelectorAll("*")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 1
        && rect.height > 1
        && rect.bottom >= 0
        && rect.top <= window.innerHeight;
    });

    for (const element of visibleElements) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (allowed.has(element.tagName)) continue;
      if (style.position === "fixed" && (element.closest("nextjs-portal") || element.id?.includes("next"))) continue;
      if (element.closest(".service-marquee")) continue;
      if (element.parentElement && getComputedStyle(element.parentElement).overflowX === "auto") continue;
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        overflowElements.push({
          tag: element.tagName.toLowerCase(),
          selector: element.id ? `#${element.id}` : `.${[...element.classList].slice(0, 3).join(".")}`,
          text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }

    if (nav && logo && navLinks) {
      const logoRect = logo.getBoundingClientRect();
      const linksRect = navLinks.getBoundingClientRect();
      if (logoRect.right > linksRect.left && getComputedStyle(navLinks).display !== "none") {
        overlaps.push({
          type: "logo-navigation",
          detail: `Logo right ${Math.round(logoRect.right)} > nav left ${Math.round(linksRect.left)}`,
        });
      }
    }

    const logoInfo = logo ? (() => {
      const navRect = nav.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      return {
        width: Math.round(logoRect.width),
        available: Math.round(navRect.width),
        ratio: Number((logoRect.width / navRect.width).toFixed(3)),
        fontSize: getComputedStyle(logo).fontSize,
        nowrap: getComputedStyle(logo).whiteSpace,
      };
    })() : null;

    return {
      url: location.pathname,
      viewportMeta,
      htmlLang,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      hasHorizontalOverflow: doc.scrollWidth > viewportWidth + 1 || body.scrollWidth > viewportWidth + 1,
      overflowElements: overflowElements.slice(0, 20),
      overlaps,
      logoInfo,
      hyphenation: {
        html: getComputedStyle(doc).hyphens,
        body: getComputedStyle(body).hyphens,
        paragraph: getComputedStyle(document.querySelector("p") || body).hyphens,
      },
    };
  });
}

async function run() {
  await fs.mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [name, route] of pages) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const url = `${baseUrl}${route}`;
      const screenshotName = `${slug(name)}-${width}px-${phase}.png`;
      const screenshotPath = path.join(screenshotDir, screenshotName);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const audit = await pageAudit(page);
        results.push({ name, route, width, screenshot: screenshotName, ok: true, audit });
      } catch (error) {
        results.push({ name, route, width, screenshot: screenshotName, ok: false, error: error.message });
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();

  const findings = results.flatMap((result) => {
    if (!result.ok) return [{ result, message: result.error }];
    const messages = [];
    if (result.audit.htmlLang !== "de") messages.push(`html lang ist "${result.audit.htmlLang || "-"}" statt "de"`);
    if (!/width=device-width/.test(result.audit.viewportMeta)) messages.push(`Viewport-Meta fehlt/abweichend: "${result.audit.viewportMeta || "-"}"`);
    if (result.audit.hasHorizontalOverflow) messages.push(`Horizontaler Overflow: scrollWidth ${result.audit.scrollWidth}, clientWidth ${result.audit.clientWidth}`);
    if (result.audit.overflowElements.length) messages.push(`${result.audit.overflowElements.length} sichtbare Elemente ragen aus dem Viewport`);
    if (result.audit.overlaps.length) messages.push(`${result.audit.overlaps.length} erkannte Überlappung(en)`);
    if (result.audit.logoInfo && result.audit.logoInfo.nowrap !== "nowrap") messages.push(`Logo white-space ist ${result.audit.logoInfo.nowrap}`);
    return messages.map((message) => ({ result, message }));
  });

  const lines = [
    `# Responsive Audit (${phase})`,
    "",
    `Base URL: ${baseUrl}`,
    `Breiten: ${widths.join(", ")}`,
    `Seiten: ${pages.map(([name]) => name).join(", ")}`,
    "",
    "## Ergebnis",
    "",
    findings.length ? `Gefundene Auffälligkeiten: ${findings.length}` : "Keine automatisiert erkannten Auffälligkeiten.",
    "",
  ];

  if (findings.length) {
    lines.push("## Auffälligkeiten", "");
    for (const { result, message } of findings) {
      lines.push(`- ${result.name} ${result.width}px: ${message}  `);
      lines.push(`  Screenshot: test-screenshots/${result.screenshot}`);
      if (result.audit?.overflowElements?.length) {
        for (const element of result.audit.overflowElements.slice(0, 5)) {
          lines.push(`  - ${element.tag} ${element.selector}: left ${element.left}, right ${element.right}, width ${element.width}, "${element.text}"`);
        }
      }
    }
    lines.push("");
  }

  lines.push("## Details", "");
  for (const result of results) {
    if (!result.ok) {
      lines.push(`- ${result.name} ${result.width}px: FEHLER - ${result.error}`);
      continue;
    }
    const logo = result.audit.logoInfo;
    lines.push(`- ${result.name} ${result.width}px: overflow=${result.audit.hasHorizontalOverflow ? "ja" : "nein"}, lang=${result.audit.htmlLang}, viewport="${result.audit.viewportMeta}", logo=${logo ? `${logo.width}px/${logo.available}px (${logo.fontSize})` : "-"}`);
  }

  await fs.writeFile(reportPath, `${lines.join("\n")}\n`);
  console.log(`Wrote ${reportPath}`);
  console.log(`Findings: ${findings.length}`);
  if (findings.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
