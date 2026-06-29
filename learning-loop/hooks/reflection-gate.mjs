// reflection-gate.mjs — Stop hook: po istotnej pracy zmuś do /reflect.
// OS-niezależny: czysty node (bez basha/coreutils). Exec form: `node <ten plik>`.
// Loop-guard: stop_hook_active. Nudżuje tylko w repo git z istotnymi zmianami (score>=THRESHOLD).
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const THRESHOLD = 10; // próg istotności (tunable przez edycję)

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

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
