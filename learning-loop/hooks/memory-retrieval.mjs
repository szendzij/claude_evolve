// memory-retrieval.mjs — SessionStart hook: inline recall of relevant per-project memory.
// OS-independent (pure node, exec form). Always exit 0, never blocks, never throws —
// must not generate its own friction. Locates memory; later tasks add ranking + injection.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function deriveMemoryDir(cwd) {
  const slug = String(cwd).replace(/[^A-Za-z0-9-]/g, "-");
  return join(homedir(), ".claude", "projects", slug, "memory");
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

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const cwd = input.cwd || process.cwd();
  const indexPath = join(deriveMemoryDir(cwd), "MEMORY.md");
  if (!existsSync(indexPath)) return; // silent: nothing to recall
  let indexText = "";
  try { indexText = readFileSync(indexPath, "utf8"); } catch { return; }
  const signals = new Set();   // populated in Task 4
  const picked = [];           // populated in Task 3
  const additionalContext = buildBlock(indexText, signals, picked);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
}

try { main(); } catch { /* never throw — must not generate friction */ }
process.exit(0);
