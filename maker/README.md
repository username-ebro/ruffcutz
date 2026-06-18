# Ruff Cutz Press-Release Maker

A small local web app that AI-generates **satirical-yet-unironic** press releases in
the Ruff Cutz house voice and publishes them as static pages into `../press/` for
ruffcutz.org.

## Voice

Every release reads as a completely real corporate/music-industry newswire blast —
FOR IMMEDIATE RELEASE, dateline, analyst observations, boilerplate "About" graf —
played 100% straight. The comedy lives in the mismatch between the grandiose register
and a mundane, often self-referential subject. The house style is defined in
[`voice.js`](voice.js); edit it to retune the satire.

## Setup (once)

```bash
npm install
cp .env.example .env      # then put your Anthropic key in .env
```

The maker reads its key **only** from `maker/.env` (gitignored), never from your
global shell. This is deliberate: your shell keeps `ANTHROPIC_API_KEY` unset so
Claude Code stays on OAuth/Max billing. Running the maker bills the Anthropic API
directly, scoped to this one process.

## Run

```bash
npm run maker         # http://localhost:4777  (override with PORT=xxxx)
```

Fill the form → it generates with Claude (`claude-opus-4-8`, structured output),
writes a styled page into `../press/`, regenerates the archive, and previews it.
Then commit & push the `press/` changes to put it live on ruffcutz.org.

## CLI

```bash
# AI path
node generate.js --prompt "We posted an ad to Instagram about our new single." \
  --facts "Off our hit album, released Aug 30. 83-second video." \
  --tone balanced            # dry | balanced | unhinged

# Manual path (no API) — author the fields yourself, render through the same pipeline
node generate.js --manual examples/instagram-advertisement.json
```

## What gets written (all in `../press/`)

- `YYYY-MM-DD-<slug>.html` — the release page (reuses the site's `style.css` + `press.css`)
- `index.html` — the press archive, regenerated on every publish
- `releases.json` — metadata for every release (source of truth for the archive)
- `media/` — embedded videos + poster frames

## Files

| File | Role |
|---|---|
| `voice.js` | House voice + brand facts + tone dial (the thing to edit) |
| `generate.js` | Engine: Claude call, structured output, publish, CLI |
| `render.js` | HTML templates for the release page + archive |
| `server.js` | Local web app (form, media list, generate+publish) |
| `public/index.html` | The maker form UI |
| `examples/` | Reference inputs for the manual path |
