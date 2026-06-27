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

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const cwd = input.cwd || process.cwd();
  const indexPath = join(deriveMemoryDir(cwd), "MEMORY.md");
  if (!existsSync(indexPath)) return; // silent: nothing to recall
  // injection added in later tasks
}

try { main(); } catch { /* never throw — must not generate friction */ }
process.exit(0);
