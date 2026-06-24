const { createServer } = require("node:http");
const { createReadStream, existsSync } = require("node:fs");
const { readFileSync } = require("node:fs");
const { stat } = require("node:fs/promises");
const path = require("node:path");

const root = path.dirname(__dirname);
const publicRoot = path.join(root, "legacy-html");
const port = Number(process.env.PORT || 3005);

[".env.local", ".env"].forEach((filename) => {
  const envPath = path.join(root, filename);
  if (!existsSync(envPath)) return;
  readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
});

const { handleApi } = require("../lib/backend");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function staticPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const normalized = path.normalize(decoded === "/" ? "/index.html" : decoded);
  const filePath = path.join(publicRoot, normalized);
  if (!filePath.startsWith(publicRoot)) return null;
  return filePath;
}

async function serveStatic(req, res, url) {
  let filePath = staticPath(url.pathname);
  if (!filePath) return send(res, 403, "Forbidden");

  if (!path.extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (existsSync(htmlPath)) filePath = htmlPath;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) return send(res, 404, "Not found");
  } catch {
    return send(res, 404, "Not found");
  }

  res.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${port}`}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, url);
    } catch (error) {
      console.error(error);
      send(res, 500, JSON.stringify({ error: "Interner Serverfehler." }), {
        "Content-Type": "application/json; charset=utf-8",
      });
    }
    return;
  }

  await serveStatic(req, res, url);
}).listen(port, "127.0.0.1", () => {
  console.log(`Heinzelchen local server: http://127.0.0.1:${port}/`);
});
