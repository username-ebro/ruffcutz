// server.js — the local Press-Release Maker web app.
// Plain Node http (no framework). Serves the form, lists embeddable media,
// calls the engine, publishes into ../press/, and serves the result for preview.
//
//   npm run maker      ->  http://localhost:4777   (override with PORT=xxxx)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRelease, publish, PRESS_DIR, hasApiKey } from "./generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const MEDIA_DIR = path.join(PRESS_DIR, "media");
const PORT = Number(process.env.PORT) || 4777;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found");
    send(res, 200, data, MIME[path.extname(filePath)] || "application/octet-stream");
  });
}

// Resolve a request path safely under a base dir (no traversal).
function safeJoin(base, urlPath) {
  const p = path.normalize(path.join(base, decodeURIComponent(urlPath)));
  return p.startsWith(base) ? p : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // --- API: list embeddable videos in press/media ---
  if (pathname === "/api/media" && req.method === "GET") {
    let files = [];
    try {
      files = fs
        .readdirSync(MEDIA_DIR)
        .filter((f) => f.toLowerCase().endsWith(".mp4"))
        .map((f) => {
          const base = f.replace(/\.mp4$/i, "");
          const posterCandidates = [`${base}-poster.jpg`, `${base}.jpg`];
          const poster = posterCandidates.find((p) => fs.existsSync(path.join(MEDIA_DIR, p)));
          return { file: `media/${f}`, poster: poster ? `media/${poster}` : null, name: f };
        });
    } catch {}
    return send(res, 200, JSON.stringify({ media: files }), MIME[".json"]);
  }

  // --- API: generate + publish a release ---
  if (pathname === "/api/generate" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const fields = await generateRelease({
        subject: body.subject,
        facts: body.facts,
        tone: body.tone,
        date: body.date,
      });
      if (body.media && body.media.src) {
        fields.media = {
          type: "video",
          src: body.media.src,
          poster: body.media.poster || null,
          caption: body.media.caption || "",
          instagram_url: body.media.instagram_url || "",
        };
      }
      const result = await publish(fields);
      return send(res, 200, JSON.stringify({ ok: true, ...result }), MIME[".json"]);
    } catch (e) {
      return send(res, 400, JSON.stringify({ ok: false, error: e.message }), MIME[".json"]);
    }
  }

  // --- static: published press pages + media (for live preview) ---
  if (pathname.startsWith("/press/")) {
    const p = safeJoin(PRESS_DIR, pathname.slice("/press/".length));
    if (p) return serveFile(res, p);
    return send(res, 403, "Forbidden");
  }

  // --- static: the maker UI ---
  if (pathname === "/" || pathname === "/index.html") {
    return serveFile(res, path.join(PUBLIC_DIR, "index.html"));
  }
  const pub = safeJoin(PUBLIC_DIR, pathname);
  if (pub && fs.existsSync(pub) && fs.statSync(pub).isFile()) return serveFile(res, pub);

  send(res, 404, "Not found");
});

server.listen(PORT, () => {
  const hasKey = hasApiKey();
  console.log(`\n  Ruff Cutz Press-Release Maker`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Publishing into: ${PRESS_DIR}`);
  console.log(
    hasKey
      ? `  API key (maker/.env): detected ✓\n`
      : `  API key: NOT found ✗  — create maker/.env with ANTHROPIC_API_KEY=sk-ant-... to enable generation\n`
  );
});
