// reflection-gate.mjs — Stop hook: po istotnej pracy ODŁÓŻ /reflect (nie blokuj).
// OS-niezależny: czysty node (bez basha/coreutils). Exec form: `node <ten plik>`.
// Loop-guard: stop_hook_active. Zamiast przerywać Stop (dawne decision:block) zapisuje
// znacznik pending-reflect/<session_id>.json — memory-retrieval pokaże go na starcie
// następnej sesji TEGO projektu. /reflect czyści znaczniki po przetworzeniu.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const THRESHOLD = 50; // próg istotności (tunable przez edycję)

// Wejście hooka z stdin (fd 0). Brak/zły JSON → pusty obiekt.
let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* ignore */ }

// Loop guard: jeśli inny hook już blokował w tym cyklu stop, nie dubluj znacznika.
if (input.stop_hook_active) process.exit(0);

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }
}

// --- Signal A: nieprzetworzone kandydatury tarcia tej sesji (niezależne od gita) ---
let candidateCount = 0;
let candidatePath = "";
const sid = input.session_id;
if (sid) {
  candidatePath = join(homedir(), ".claude", "learning-loop", "friction-candidates", sid + ".jsonl");
  if (existsSync(candidatePath)) {
    try { candidateCount = readFileSync(candidatePath, "utf8").split("\n").filter(Boolean).length; }
    catch { candidateCount = 0; }
  }
}

// --- Signal B: rozmiar git diff (0 poza repo lub gdy drzewo czyste) ---
let score = 0;
const inside = git(["rev-parse", "--is-inside-work-tree"]);
if (inside && inside.trim() === "true" && (git(["status", "--porcelain"]) || "").trim()) {
  const changedLines = (args) => {
    const s = git(args) || "";
    const ins = Number((s.match(/(\d+) insertion/) || [, 0])[1]);
    const del = Number((s.match(/(\d+) deletion/) || [, 0])[1]);
    return ins + del;
  };
  const tracked = changedLines(["diff", "--shortstat"]) + changedLines(["diff", "--cached", "--shortstat"]);
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "")
    .split("\n").filter(Boolean).length;
  score = tracked + untracked * 3;
}

// --- Decyzja: jeśli żaden sygnał nie odpala, milcz (i nie zapisuj znacznika) ---
if (score < THRESHOLD && candidateCount === 0) process.exit(0);

// --- Tryb odroczony: zapisz znacznik pending-reflect zamiast blokować Stop ---
const cwd = input.cwd || process.cwd();
const pendingDir = join(homedir(), ".claude", "learning-loop", "pending-reflect");
try {
  mkdirSync(pendingDir, { recursive: true });
  writeFileSync(join(pendingDir, (sid || "no-session") + ".json"), JSON.stringify({
    session_id: sid || "",
    cwd,
    score,
    candidates: candidateCount,
    candidatePath,
    ts: new Date().toISOString(),
  }, null, 2));
} catch { /* never throw — hook nie może generować własnego tarcia */ }

process.exit(0);
