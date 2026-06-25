// reflection-gate.mjs — Stop hook: po istotnej pracy zmuś do /reflect.
// OS-niezależny: czysty node (bez basha/coreutils). Exec form: `node <ten plik>`.
// Loop-guard: stop_hook_active. Nudżuje tylko w repo git z niezacommitowanymi zmianami.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

// Nudge tylko gdy realna praca: niezacommitowane zmiany (worktree lub index).
function dirty() {
  let d = false;
  try { execFileSync("git", ["diff", "--quiet"], { stdio: "ignore" }); } catch { d = true; }
  try { execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "ignore" }); } catch { d = true; }
  return d;
}
if (!dirty()) process.exit(0);

const stat = (git(["diff", "--stat"]) || "").split("\n").slice(-20).join("\n");
const reason = "Sesja z niezapisanymi zmianami. Uruchom /reflect: wyekstrahuj trwałe wnioski "
  + "i powtarzalne procedury wg Memory Routing (Konstytucja Pamięci w skillu reflect), "
  + "zaktualizuj handoff. Rozbieg (git diff --stat):\n" + stat;

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
