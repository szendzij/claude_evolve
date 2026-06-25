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

// Nudge tylko wewnątrz repo git.
const inside = git(["rev-parse", "--is-inside-work-tree"]);
if (!inside || inside.trim() !== "true") process.exit(0);

// Jest jakakolwiek praca? (porcelain łapie też pliki nieśledzone)
const porcelain = git(["status", "--porcelain"]) || "";
if (!porcelain.trim()) process.exit(0);

// Próg istotności: zmienione linie (tracked working+staged) + (liczba untracked × 3).
function changedLines(args) {
  const s = git(args) || "";
  const ins = Number((s.match(/(\d+) insertion/) || [, 0])[1]);
  const del = Number((s.match(/(\d+) deletion/) || [, 0])[1]);
  return ins + del;
}
const tracked = changedLines(["diff", "--shortstat"]) + changedLines(["diff", "--cached", "--shortstat"]);
const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "")
  .split("\n").filter(Boolean).length;
const score = tracked + untracked * 3;
if (score < THRESHOLD) process.exit(0);

// Rozbieg.
const stat = (git(["diff", "--stat"]) || "").split("\n").slice(-20).join("\n");

// Spięcie z #3: kandydatury tarcia tej sesji.
let frictionNote = "";
const sid = input.session_id;
if (sid) {
  const f = join(homedir(), ".claude", "learning-loop", "friction-candidates", sid + ".jsonl");
  if (existsSync(f)) {
    const n = readFileSync(f, "utf8").split("\n").filter(Boolean).length;
    if (n > 0) frictionNote = "\nTa sesja zarejestrowała " + n + " kandydatur tarcia: " + f
      + "\nPrzejrzyj je w /reflect i przypisz do właściwego FRICTION.md.";
  }
}

const reason = "Sesja z niezapisanymi zmianami (score " + score + "). Uruchom /reflect: wyekstrahuj "
  + "trwałe wnioski i powtarzalne procedury wg Memory Routing (Konstytucja Pamięci w skillu reflect), "
  + "zaktualizuj handoff." + frictionNote + "\nRozbieg (git diff --stat):\n" + stat;

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
