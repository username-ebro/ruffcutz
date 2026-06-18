// generate.js — the press-release maker engine.
//   AI path:     generateRelease({subject, facts, tone, date, media})  -> release fields via Claude
//   publish:     publish(release)  -> writes the page, upserts releases.json, regenerates the archive
//   manual path: renderFromFields(fields)  -> deterministic, no API (used to seed release #1)
//
// One source of truth for the API key: process.env.ANTHROPIC_API_KEY. If it's
// missing we fail loud with the exact fix — no keychain probing, no fallback model.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, userPrompt, BRAND } from "./voice.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRESS_DIR = path.resolve(__dirname, "..", "press");
const RELEASES_JSON = path.join(PRESS_DIR, "releases.json");

const MODEL = "claude-opus-4-8";

// JSON schema the model must fill. (No string-length constraints — unsupported.)
const RELEASE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slug: { type: "string", description: "short lowercase hyphenated id, e.g. instagram-advertisement" },
    dateline: { type: "string", description: 'e.g. "NEW ORLEANS, LA — June 18, 2026"' },
    headline: { type: "string" },
    subhead: { type: "string" },
    body: {
      type: "array",
      items: { type: "string" },
      description: "3-6 ordered body paragraphs, quotes woven in",
    },
    boilerplate: { type: "string", description: "the About paragraph" },
  },
  required: ["slug", "dateline", "headline", "subhead", "body", "boilerplate"],
};

// Canonical key source for THIS tool: maker/.env (gitignored), falling through to
// an already-set process.env. The global shell deliberately keeps ANTHROPIC_API_KEY
// unset (so Claude Code stays on OAuth billing) — so the maker carries its own.
function loadMakerEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  const envPath = path.join(__dirname, ".env");
  let text;
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

// Non-throwing check for the startup banner.
export function hasApiKey() {
  loadMakerEnv();
  return !!process.env.ANTHROPIC_API_KEY;
}

function requireApiKey() {
  loadMakerEnv();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set.\n" +
        "  This tool reads its key from maker/.env (kept out of git).\n" +
        "  Fix: create maker/.env with one line:\n" +
        '    ANTHROPIC_API_KEY=sk-ant-...\n' +
        "  (Your global shell deliberately omits this key so Claude Code stays on OAuth —\n" +
        "   the maker uses its own .env so generating a release bills the API, not your Max plan.)"
    );
  }
  return key;
}

// Call Claude, return validated release fields (without media — caller attaches that).
export async function generateRelease({ subject, facts = "", tone = "balanced", date }) {
  if (!subject || !subject.trim()) throw new Error("subject is required");
  const isoDate = date || new Date().toISOString().slice(0, 10);
  const client = new Anthropic({ apiKey: requireApiKey() });

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: RELEASE_SCHEMA } },
    messages: [{ role: "user", content: userPrompt({ subject, facts, tone, date: isoDate }) }],
  });

  if (resp.stop_reason === "refusal") {
    throw new Error("The model declined this request (stop_reason: refusal).");
  }
  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in model response.");

  let fields;
  try {
    fields = JSON.parse(textBlock.text);
  } catch (e) {
    throw new Error("Model did not return valid JSON: " + e.message);
  }
  return normalize({ ...fields, date: isoDate });
}

// Fill defaults / coerce shape. Accepts partial fields (manual path) too.
export function normalize(r) {
  const date = r.date || new Date().toISOString().slice(0, 10);
  return {
    slug: slugify(r.slug || r.headline || "release"),
    date,
    dateline: r.dateline || `${BRAND.city} — ${prettyDate(date)}`,
    headline: r.headline || "Untitled Release",
    subhead: r.subhead || "",
    body: Array.isArray(r.body) ? r.body : r.body ? [r.body] : [],
    boilerplate: r.boilerplate || BRAND.boilerplate,
    contact: r.contact || BRAND.contact,
    media: r.media || null,
  };
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "release";
}

function prettyDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---- persistence -----------------------------------------------------------

function loadReleases() {
  try {
    return JSON.parse(fs.readFileSync(RELEASES_JSON, "utf8"));
  } catch {
    return [];
  }
}

// Lazy import of the renderer so this module stays usable headless.
async function renderers() {
  return import("./render.js");
}

// Write the release page, upsert into releases.json, regenerate the archive index.
export async function publish(release) {
  const r = normalize(release);
  const { renderReleasePage, renderArchiveIndex, fileNameFor } = await renderers();

  fs.mkdirSync(PRESS_DIR, { recursive: true });
  const fileName = fileNameFor(r);
  fs.writeFileSync(path.join(PRESS_DIR, fileName), renderReleasePage(r), "utf8");

  // Upsert metadata (dedupe on filename) and rebuild the archive.
  const releases = loadReleases().filter((x) => fileNameFor(normalize(x)) !== fileName);
  releases.push(metaOf(r));
  releases.sort((a, b) => (a.date < b.date ? 1 : -1));
  fs.writeFileSync(RELEASES_JSON, JSON.stringify(releases, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(PRESS_DIR, "index.html"), renderArchiveIndex(releases), "utf8");

  return { fileName, url: `press/${fileName}`, release: r };
}

// Slim record kept in releases.json (full media kept so pages can be rebuilt).
function metaOf(r) {
  return {
    slug: r.slug,
    date: r.date,
    dateline: r.dateline,
    headline: r.headline,
    subhead: r.subhead,
    body: r.body,
    boilerplate: r.boilerplate,
    contact: r.contact,
    media: r.media,
  };
}

// Deterministic manual path (no API) — author fields yourself and publish.
export async function renderFromFields(fields) {
  return publish(fields);
}

// ---- CLI -------------------------------------------------------------------
// node generate.js --manual fields.json
// node generate.js --prompt "..." [--facts "..."] [--tone dry|balanced|unhinged] [--date YYYY-MM-DD]
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    try {
      let result;
      if (args.manual) {
        const fields = JSON.parse(fs.readFileSync(path.resolve(String(args.manual)), "utf8"));
        result = await renderFromFields(fields);
      } else if (args.prompt) {
        const fields = await generateRelease({
          subject: String(args.prompt),
          facts: args.facts ? String(args.facts) : "",
          tone: args.tone ? String(args.tone) : "balanced",
          date: args.date ? String(args.date) : undefined,
        });
        result = await publish(fields);
      } else {
        console.error('Usage:\n  node generate.js --prompt "subject" [--facts "..."] [--tone balanced] [--date YYYY-MM-DD]\n  node generate.js --manual fields.json');
        process.exit(1);
      }
      console.log("Published:", result.url);
    } catch (e) {
      console.error("Error:", e.message);
      process.exit(1);
    }
  })();
}
