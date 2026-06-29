// token-report.mjs — Stop hook: saves plugin token footprint to disk.
// Always exit 0, never blocks. OS-independent (pure node, exec form).
// Writes happen in a detached background process so the hook exits immediately.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const CHARS_PER_TOKEN = 4;
const __file = fileURLToPath(import.meta.url);

// Background worker mode: env carries the payload, do the writes and exit.
const workerPayload = process.env.LL_TR_WORKER;
if (workerPayload) {
  try {
    const { dir, json, md } = JSON.parse(workerPayload);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "latest.json"), json);
    writeFileSync(join(dir, "latest.md"), md);
  } catch { /* silent */ }
  process.exit(0);
}

function tok(chars) { return Math.round(chars / CHARS_PER_TOKEN); }
function sz(p) { try { return readFileSync(p, "utf8").length; } catch { return 0; } }

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }

  const sid = input.session_id || "";
  const home = homedir();
  const root = join(dirname(__file), "..");

  let memChars = 0;
  if (sid) {
    try {
      memChars = JSON.parse(
        readFileSync(join(home, ".claude", "learning-loop", "session-tokens", sid + ".json"), "utf8") || "{}"
      ).chars || 0;
    } catch { /* no session-tokens = hook didn't fire or no memory */ }
  }

  const skills = ["reflect", "curator", "skill-review"];
  const skillChars = Object.fromEntries(skills.map(s => [s, sz(join(root, "skills", s, "SKILL.md"))]));
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

  // Spawn detached background writer and exit immediately — hook returns to Claude Code
  // without blocking on disk I/O. The worker inherits the full env (HOME, USERPROFILE, PATH).
  const child = spawn(process.execPath, [__file], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LL_TR_WORKER: JSON.stringify({ dir: reportDir, json: JSON.stringify(report, null, 2), md: lines.join("\n") }),
    },
  });
  child.unref();
}

try { main(); } catch { /* swallow */ }
process.exit(0);
