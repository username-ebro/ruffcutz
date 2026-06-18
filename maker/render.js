// render.js — turn a release object into HTML. Shared by the AI path and the
// manual path so every live page is byte-identical to what the maker produces.
import { BRAND } from "./voice.js";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Filename for a release: 2026-06-18-instagram-advertisement.html
export const fileNameFor = (r) => `${r.date}-${r.slug}.html`;

function siteHeader(active) {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `  <header>
    <div class="container">
      <img src="../hamsen.png" alt="Ruff Cutz Logo" class="logo">
      <h1>${esc(BRAND.name)}</h1>
      <nav>
        ${link("../index.html", "Home", "home")}
        ${link("index.html", "Press", "press")}
        ${link("../signup.html", "SMS Updates", "sms")}
      </nav>
    </div>
  </header>`;
}

function siteFooter() {
  return `  <footer>
    <div class="container">
      <p>&copy; 2024 ${esc(BRAND.name)}</p>
      <p>Managed by ${esc(BRAND.manager)} | <a href="mailto:evan@evanstoudt.com">evan@evanstoudt.com</a> | 504.296.0202</p>
    </div>
  </footer>`;
}

function mediaBlock(media) {
  if (!media || !media.src) return "";
  const poster = media.poster ? ` poster="${esc(media.poster)}"` : "";
  const caption = media.caption
    ? `\n      <figcaption class="pr-media-caption">${esc(media.caption)}</figcaption>`
    : "";
  const igLink = media.instagram_url
    ? `\n      <p class="pr-media-link"><a href="${esc(media.instagram_url)}" target="_blank" rel="noopener">View the advertisement on Instagram &rarr;</a></p>`
    : "";
  return `
    <figure class="pr-media">
      <video controls preload="metadata"${poster} playsinline>
        <source src="${esc(media.src)}" type="video/mp4">
        Your browser does not support embedded video.
      </video>${caption}${igLink}
    </figure>`;
}

// Full release page
export function renderReleasePage(r) {
  const body = (r.body || [])
    .map((p) => `      <p>${esc(p)}</p>`)
    .join("\n");
  const contact = esc(r.contact || BRAND.contact);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(r.headline)} — ${esc(BRAND.shortName)} Press</title>
  <meta name="description" content="${esc(r.subhead || r.headline)}">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="press.css">
</head>
<body>
${siteHeader("press")}

  <main class="pr-main">
    <article class="pr-release container">
      <p class="pr-back"><a href="index.html">&larr; Press releases</a></p>
      <p class="pr-kicker">For Immediate Release</p>
      <h2 class="pr-headline">${esc(r.headline)}</h2>
      ${r.subhead ? `<p class="pr-subhead">${esc(r.subhead)}</p>` : ""}
      <div class="pr-rule"></div>
      <div class="pr-body">
        <p><span class="pr-dateline">${esc(r.dateline)} —</span> ${esc((r.body || [""])[0] || "")}</p>
${(r.body || []).slice(1).map((p) => `        <p>${esc(p)}</p>`).join("\n")}
${mediaBlock(r.media)}
      </div>

      <div class="pr-about">
        <h3>About ${esc(BRAND.name)}</h3>
        <p>${esc(r.boilerplate || BRAND.boilerplate)}</p>
      </div>

      <div class="pr-contact">
        <p class="pr-contact-label">Media Contact</p>
        <p>${contact}</p>
      </div>
      <p class="pr-end">###</p>
    </article>
  </main>

${siteFooter()}
</body>
</html>
`;
}

// Archive index page listing all releases (newest first)
export function renderArchiveIndex(releases) {
  const sorted = [...releases].sort((a, b) => (a.date < b.date ? 1 : -1));
  const items = sorted
    .map((r) => {
      const href = fileNameFor(r);
      const pretty = new Date(r.date + "T12:00:00").toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `        <li class="pr-list-item">
          <a href="${esc(href)}" class="pr-list-link">
            <span class="pr-list-date">${esc(pretty)}</span>
            <span class="pr-list-headline">${esc(r.headline)}</span>
            ${r.subhead ? `<span class="pr-list-subhead">${esc(r.subhead)}</span>` : ""}
          </a>
        </li>`;
    })
    .join("\n");

  const empty = `<li class="pr-list-empty">No releases yet. Run the maker to publish one.</li>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Press — ${esc(BRAND.name)}</title>
  <meta name="description" content="Official press releases from the ${esc(BRAND.name)}.">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="press.css">
</head>
<body>
${siteHeader("press")}

  <main class="pr-main">
    <section class="pr-archive container">
      <p class="pr-kicker">Press Room</p>
      <h2 class="pr-archive-title">Official Announcements</h2>
      <p class="pr-archive-blurb">News and milestones from the ${esc(BRAND.name)}, distributed for immediate release.</p>
      <div class="pr-rule"></div>
      <ul class="pr-list">
${sorted.length ? items : empty}
      </ul>
    </section>
  </main>

${siteFooter()}
</body>
</html>
`;
}
