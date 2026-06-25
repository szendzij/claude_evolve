// friction-capture.mjs — PostToolUseFailure hook: loguje surowe kandydatury tarcia.
// Detekcja, NIE osąd: nigdy nie tyka SKILL.md/FRICTION.md, nie przypisuje skilla.
// Zawsze exit 0, niemy. OS-niezależny (pure node, exec form).
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const sid = input.session_id;
  if (!sid) return; // bez session_id nie wiemy, gdzie zapisać
  const tool = input.tool_name || "unknown";
  const error = String(input.error ?? "").slice(0, 300);
  const ti = input.tool_input || {};
  const target = String(ti.file_path || ti.command || "").slice(0, 200);
  const dir = join(homedir(), ".claude", "learning-loop", "friction-candidates");
  const rec = JSON.stringify({ ts: new Date().toISOString(), tool, error, target });
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, sid + ".jsonl"), rec + "\n");
  } catch { /* niemy — nie wolno zakłócić sesji */ }
}
try { main(); } catch { /* swallow */ }
process.exit(0);
