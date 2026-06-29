// memory-retrieval.mjs — SessionStart hook: inline recall of relevant per-project memory.
// OS-independent (pure node, exec form). Always exit 0, never blocks, never throws —
// must not generate its own friction. Locates memory; later tasks add ranking + injection.
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep } from "node:path";
import { homedir } from "node:os";

const MAX_FACTS = 5;
const MAX_CHARS = 4000;
const MIN_TOKEN_LEN = 3;
const GIT_TIMEOUT_MS = 1500;

function deriveMemoryDir(cwd) {
  const slug = String(cwd).replace(/[^A-Za-z0-9-]/g, "-");
  return join(homedir(), ".claude", "projects", slug, "memory");
}

function tokenize(s) {
  return new Set(
    String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= MIN_TOKEN_LEN)
  );
}

// Parse "- [Title](file.md) — hook" index lines.
function parseIndex(indexText) {
  const entries = [];
  for (const line of indexText.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[([^\]]+)\]\(([^)]+\.md)\)\s*(?:[—-]\s*(.*))?$/);
    if (!m) continue;
    entries.push({ file: m[2], text: m[1] + " " + (m[3] || "") });
  }
  return entries;
}

// Reject any fact path that escapes memoryDir (path traversal). OS-independent:
// path.relative normalizes sep/case; a contained path is neither absolute nor
// starts with "..". Returning "" also blocks the memoryDir itself (no file part).
function isInside(memoryDir, full) {
  const root = resolve(memoryDir);
  const target = resolve(full);
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(".." + sep) &&
    !/^([A-Za-z]:)?[\\/]/.test(rel); // absolute => different drive/root => outside
}

function selectFacts(entries, memoryDir, signals) {
  const enriched = entries.map((e) => {
    const full = join(memoryDir, e.file);
    let mtime = 0;
    // Containment guard first: an escaping entry is never statted/read.
    if (isInside(memoryDir, full)) {
      try { mtime = statSync(full).mtimeMs; } catch { /* missing fact file */ }
    }
    const etoks = tokenize(e.text);
    let score = 0;
    for (const t of signals) if (etoks.has(t)) score++;
    return { file: e.file, full, mtime, score };
  }).filter((e) => e.mtime > 0);

  const scored = enriched.filter((e) => e.score > 0);
  const ranked = scored.length
    ? scored.sort((a, b) => b.score - a.score || b.mtime - a.mtime)
    : enriched.sort((a, b) => b.mtime - a.mtime);

  const picked = [];
  let used = 0;
  for (const e of ranked) {
    if (picked.length >= MAX_FACTS) break;
    let content;
    try { content = readFileSync(e.full, "utf8"); } catch { continue; }
    if (used + content.length > MAX_CHARS) continue; // skip too-big; never truncate
    picked.push({ file: e.file, content });
    used += content.length;
  }
  return picked;
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd, timeout: GIT_TIMEOUT_MS, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { return ""; }
}

function gatherSignals(cwd) {
  const branch = git(["branch", "--show-current"], cwd);
  const changed = git(["diff", "--name-only", "HEAD~3", "HEAD"], cwd);
  return tokenize(branch + " " + changed);
}

function buildBlock(indexText, signals, picked) {
  const sig = signals.size ? [...signals].join(" ") : "brak (fallback: recency)";
  const parts = [
    "# Pamięć projektu (learning-loop)",
    `**Sygnały sesji:** ${sig}`,
    "",
    "## Indeks (MEMORY.md)",
    indexText.trim(),
  ];
  if (picked.length) {
    parts.push("", "## Przywołane fakty (top-N, inline)");
    for (const p of picked) parts.push("", `### ${p.file}`, p.content.trim());
  }
  return parts.join("\n");
}

// Odroczone /reflect: reflection-gate zapisuje znaczniki pending-reflect/<sid>.json.
// Pokazujemy TYLKO te dla bieżącego cwd (brak przecieku między projektami).
function pendingReflectNotice(cwd) {
  const dir = join(homedir(), ".claude", "learning-loop", "pending-reflect");
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return ""; }
  const here = resolve(cwd);
  const mine = [];
  for (const f of files) {
    try {
      const m = JSON.parse(readFileSync(join(dir, f), "utf8") || "{}");
      if (m.cwd && resolve(m.cwd) === here) mine.push(m);
    } catch { /* pomiń uszkodzony znacznik */ }
  }
  if (!mine.length) return "";
  const totalCand = mine.reduce((a, m) => a + (Number(m.candidates) || 0), 0);
  const rows = mine.map((m) => {
    const id = String(m.session_id || "?").slice(0, 8);
    return `  - sesja ${id} (score ${m.score || 0}, ${Number(m.candidates) || 0} kandydatur tarcia)`;
  });
  const head = mine.length === 1 ? "1 niezreflektowaną sesję" : `${mine.length} niezreflektowane sesje`;
  return [
    "## ⏳ Pending /reflect (odroczone z poprzednich sesji)",
    `Masz ${head} w tym projekcie` + (totalCand ? `, łącznie ${totalCand} kandydatur tarcia` : "") + ":",
    rows.join("\n"),
    "Uruchom **/reflect**, gdy będziesz gotów — wyczyści te znaczniki po przetworzeniu.",
  ].join("\n");
}

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const cwd = input.cwd || process.cwd();
  const memoryDir = deriveMemoryDir(cwd);
  const indexPath = join(memoryDir, "MEMORY.md");
  const pending = pendingReflectNotice(cwd);

  // Wczytaj indeks pamięci (jeśli jest i czytelny). null = brak/nieczytelny.
  let indexText = null;
  if (existsSync(indexPath)) {
    try { indexText = readFileSync(indexPath, "utf8"); } catch { indexText = null; }
  }

  // Nic do pokazania (ani pamięci, ani pending) → milcz.
  if (indexText === null && !pending) return;

  let additionalContext = "";

  if (indexText !== null) {
    const entries = parseIndex(indexText);
    const signals = gatherSignals(cwd);
    const picked = entries.length ? selectFacts(entries, memoryDir, signals) : [];
    additionalContext = buildBlock(indexText, signals, picked);

    // Append last-session token footprint summary
    try {
      const r = JSON.parse(readFileSync(
        join(homedir(), ".claude", "learning-loop", "token-reports", "latest.json"), "utf8") || "{}");
      if (r.total_max?.tokens) {
        const skillLine = Object.entries(r.skills || {})
          .map(([k, v]) => `/${k} ~${v.tokens} tok`)
          .join(", ");
        additionalContext += "\n\n## Plugin footprint (last session)\n"
          + `Memory injection: ~${r.memory_injection?.tokens || 0} tok | ${skillLine} | Hooks: ~${r.hooks?.tokens || 0} tok | Max: ~${r.total_max.tokens} tok`;
      }
    } catch { /* silent — no report yet or corrupted */ }
  }

  if (pending) {
    additionalContext += (additionalContext ? "\n\n" : "") + pending;
  }

  // Save total injected-context size for token-report
  const sid = input.session_id;
  if (sid) {
    const tokenDir = join(homedir(), ".claude", "learning-loop", "session-tokens");
    try {
      mkdirSync(tokenDir, { recursive: true });
      writeFileSync(join(tokenDir, sid + ".json"),
        JSON.stringify({ chars: additionalContext.length, ts: new Date().toISOString() }));
    } catch { /* never throw — must not generate friction */ }
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
}

try { main(); } catch { /* never throw — must not generate friction */ }
process.exit(0);
