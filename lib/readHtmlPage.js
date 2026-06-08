const fs = require("node:fs");
const path = require("node:path");

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
  return { title, body: bodyWithoutScripts, scripts, bodyClass };
}

function getStaticHtmlProps(fileName) {
  return {
    props: readHtmlPage(fileName),
  };
}

module.exports = {
  getStaticHtmlProps,
};
