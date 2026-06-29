// reflection-gate.mjs — Stop hook: po istotnej pracy zmuś do /reflect.
// OS-niezależny: czysty node (bez basha/coreutils). Exec form: `node <ten plik>`.
// Loop-guard: stop_hook_active. Nudżuje tylko w repo git z istotnymi zmianami (score>=THRESHOLD).
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const THRESHOLD = 10; // próg istotności (tunable przez edycję)
const CHARS_PER_TOKEN = 4;

function tokenSummary() {
  const tok = chars => Math.round(chars / CHARS_PER_TOKEN);
  const sz = p => { try { return readFileSync(p, "utf8").length; } catch { return 0; } };
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const skills = ["reflect", "curator", "skill-review"];
  const parts = skills.map(s => `/${s}: ~${tok(sz(join(root, "skills", s, "SKILL.md")))} tok`);
  const hookFiles = ["memory-retrieval.mjs", "reflection-gate.mjs", "friction-capture.mjs", "token-report.mjs"];
  const hooksChars = hookFiles.reduce((a, f) => a + sz(join(root, "hooks", f)), 0);
  return "Token footprint — " + parts.join(" | ") + ` | Hooki: ~${tok(hooksChars)} tok`
    + "\nPełny raport: ~/.claude/learning-loop/token-reports/latest.md";
}

// Wejście hooka z stdin (fd 0). Brak/zły JSON → pusty obiekt.
let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* ignore */ }

// Loop guard: jeśli już blokowaliśmy w tym cyklu stop, pozwól zakończyć.
if (input.stop_hook_active) process.exit(0);

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { return null; }
}

// --- Signal A: unprocessed friction candidates for this session (independent of git) ---
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

// --- Signal B: git diff size (0 when outside a repo or the tree is clean) ---
let score = 0;
let stat = "";
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
  stat = (git(["diff", "--stat"]) || "").split("\n").slice(-20).join("\n");
}

// --- Decide: nudge if either signal fires ---
if (score < THRESHOLD && candidateCount === 0) process.exit(0);

let reason = "Uruchom /reflect: wyekstrahuj trwałe wnioski i powtarzalne procedury wg Memory "
  + "Routing (Konstytucja Pamięci w skillu reflect), zaktualizuj handoff.";
if (score >= THRESHOLD) {
  reason += "\nSesja z niezapisanymi zmianami (score " + score + ").\nRozbieg (git diff --stat):\n" + stat;
}
if (candidateCount > 0) {
  reason += "\nTa sesja zarejestrowała " + candidateCount + " kandydatur tarcia: " + candidatePath
    + "\nPrzejrzyj je w /reflect i przypisz do właściwego FRICTION.md.";
}

try { reason += "\n\n" + tokenSummary(); } catch { /* never throw */ }
process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
