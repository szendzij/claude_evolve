// token-report.mjs — Stop hook: saves plugin token footprint to disk.
// Always exit 0, never blocks. OS-independent (pure node, exec form).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const CHARS_PER_TOKEN = 4;

function tok(chars) { return Math.round(chars / CHARS_PER_TOKEN); }

function sz(p) {
  try { return readFileSync(p, "utf8").length; } catch { return 0; }
}

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }

  const sid = input.session_id || "";
  const home = homedir();
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  // Memory injection size saved by memory-retrieval at SessionStart
  let memChars = 0;
  if (sid) {
    try {
      memChars = JSON.parse(
        readFileSync(join(home, ".claude", "learning-loop", "session-tokens", sid + ".json"), "utf8") || "{}"
      ).chars || 0;
    } catch { /* no session-tokens file = hook didn't fire or no memory */ }
  }

  const skills = ["reflect", "curator", "skill-review"];
  const skillChars = Object.fromEntries(
    skills.map(s => [s, sz(join(root, "skills", s, "SKILL.md"))])
  );

  const hookFiles = ["memory-retrieval.mjs", "reflection-gate.mjs", "friction-capture.mjs", "token-report.mjs"];
  const hooksChars = hookFiles.reduce((a, f) => a + sz(join(root, "hooks", f)), 0);

  const totalMaxChars = memChars + Object.values(skillChars).reduce((a, b) => a + b, 0) + hooksChars;

  const report = {
    session_id: sid,
    ts: new Date().toISOString(),
    memory_injection: { chars: memChars, tokens: tok(memChars) },
    skills: Object.fromEntries(skills.map(s => [s, { chars: skillChars[s], tokens: tok(skillChars[s]) }])),
    hooks: { chars: hooksChars, tokens: tok(hooksChars) },
    total_max: { chars: totalMaxChars, tokens: tok(totalMaxChars) },
  };

  const reportDir = join(home, ".claude", "learning-loop", "token-reports");
  try {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, "latest.json"), JSON.stringify(report, null, 2));

    const lines = [
      "# Learning-Loop — Token Footprint",
      `Session: ${sid || "unknown"}  ${report.ts}`,
      "",
      `Memory injection (session start):  ~${tok(memChars)} tok  (${memChars} chars)`,
      "",
      "Skills (cost when /skill is invoked):",
      ...skills.map(s => `  /${s}:  ~${tok(skillChars[s])} tok  (${skillChars[s]} chars)`),
      "",
      `Hooks (all, loaded per event):     ~${tok(hooksChars)} tok  (${hooksChars} chars)`,
      "",
      `Max total (all skills invoked):    ~${tok(totalMaxChars)} tok  (${totalMaxChars} chars)`,
    ];
    writeFileSync(join(reportDir, "latest.md"), lines.join("\n"));
  } catch { /* silent — never disturb the session */ }
}

try { main(); } catch { /* swallow */ }
process.exit(0);
