# Memory-Retrieval Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SessionStart` hook to the `learning-loop` plugin that recalls relevant per-project memory facts inline into session context.

**Architecture:** Single OS-independent Node script (`memory-retrieval.mjs`), exec form, black-box tested via subprocess (mirroring `friction-capture.mjs`/`reflection-gate.mjs`). Derives the per-project memory dir from `cwd`, parses `MEMORY.md`, ranks entries by token overlap with git signals (branch + recent diff), falls back to recency, and injects the index plus top-N fact bodies via `hookSpecificOutput.additionalContext`. No hardcoded domain map.

**Tech Stack:** Node.js (built-in `node:fs`/`node:path`/`node:os`/`node:child_process`), `node:test`, git CLI. No external deps.

## Global Constraints

- **OS-independent:** pure Node, exec form (`{command:"node", args:[...]}`), no bash/jq/python. Verified on Windows; identical on Linux/macOS.
- **Never throw, never block, always `exit 0`:** every code path wrapped so the hook cannot generate its own tool-failure friction.
- **No hardcoded domain map** anywhere in the code.
- **Caps (verbatim from spec §7):** `MAX_FACTS = 5`, `MAX_CHARS = 4000` (fact bodies only; index excluded), `GIT_TIMEOUT_MS = 1500`, `MIN_TOKEN_LEN = 3`, diff window `HEAD~3 HEAD`.
- **Slug derivation (verbatim from spec §5.1):** `cwd.replace(/[^A-Za-z0-9-]/g, "-")`.
- **Scope:** facts only (`memory/`). No skills, no handoff, no writes.
- **Test command:** `node --test learning-loop/hooks/memory-retrieval.test.mjs`. No regression in existing tests (`friction-capture` 5/5, `reflection-gate` 7/7).

---

### Task 1: Skeleton — locate memory, silent miss, register hook

**Files:**
- Create: `learning-loop/hooks/memory-retrieval.mjs`
- Create: `learning-loop/hooks/memory-retrieval.test.mjs`
- Modify: `learning-loop/hooks/hooks.json`

**Interfaces:**
- Produces: hook reads stdin JSON `{cwd, session_id}`, writes either nothing (exit 0) or a `{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext}}` JSON to stdout. Later tasks fill in `additionalContext`.

- [ ] **Step 1: Write the failing test (T1 — no memory dir → silent)**

Create `learning-loop/hooks/memory-retrieval.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "memory-retrieval.mjs");

// Derive slug exactly like the hook (spec §5.1) so tests can place the memory dir.
function slugOf(cwd) { return cwd.replace(/[^A-Za-z0-9-]/g, "-"); }

function freshHome() { return mkdtempSync(join(tmpdir(), "ll-mr-home-")); }
function freshDir() { return mkdtempSync(join(tmpdir(), "ll-mr-cwd-")); }

// memoryDir for a given (home, cwd)
function memDir(home, cwd) {
  return join(home, ".claude", "projects", slugOf(cwd), "memory");
}

// Write a MEMORY.md index + optional fact files; returns memoryDir.
function seedMemory(home, cwd, indexText, facts = {}) {
  const dir = memDir(home, cwd);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "MEMORY.md"), indexText);
  for (const [name, content] of Object.entries(facts)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function runHook(input, cwd, home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const out = execFileSync("node", [HOOK], {
      cwd, input: JSON.stringify(input), encoding: "utf8",
      env, stdio: ["pipe", "pipe", "ignore"],
    });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? 1, out: e.stdout ?? "" }; }
}

test("T1: brak memory dir -> pusty output, exit 0", () => {
  const home = freshHome();
  const cwd = freshDir(); // no memory seeded
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  assert.equal(out, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: FAIL — `memory-retrieval.mjs` does not exist (module not found / ENOENT).

- [ ] **Step 3: Write minimal implementation**

Create `learning-loop/hooks/memory-retrieval.mjs`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Register the hook in hooks.json**

Replace `learning-loop/hooks/hooks.json` with:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/memory-retrieval.mjs"]
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/reflection-gate.mjs"]
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/friction-capture.mjs"]
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Verify hooks.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('learning-loop/hooks/hooks.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add learning-loop/hooks/memory-retrieval.mjs learning-loop/hooks/memory-retrieval.test.mjs learning-loop/hooks/hooks.json
git commit -m "feat(memory-retrieval): skeleton hook + locate memory + register SessionStart"
```

---

### Task 2: Inject the index (always)

**Files:**
- Modify: `learning-loop/hooks/memory-retrieval.mjs`
- Test: `learning-loop/hooks/memory-retrieval.test.mjs`

**Interfaces:**
- Consumes: `deriveMemoryDir(cwd)` from Task 1.
- Produces: `buildBlock(indexText, signals, picked)` → string; `main` now writes `additionalContext`. `signals` is a `Set` (empty for now), `picked` is an array (empty for now).

- [ ] **Step 1: Write the failing test (T7 — index injected, no facts section yet)**

Append to `memory-retrieval.test.mjs`:

```js
test("T7: MEMORY.md istnieje, brak parsowalnych wpisow -> sam indeks, exit 0", () => {
  const home = freshHome();
  const cwd = freshDir();
  seedMemory(home, cwd, "# Memory index\n\n(no entries yet)\n");
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /## Indeks \(MEMORY\.md\)/);
  assert.match(ctx, /no entries yet/);
  assert.doesNotMatch(ctx, /Przywołane fakty/); // no facts seeded/implemented
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: FAIL — `out` is empty, `JSON.parse("")` throws.

- [ ] **Step 3: Add `buildBlock` and wire `main`**

In `memory-retrieval.mjs`, add the function and update `main` (keep imports; add nothing new yet):

```js
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
```

Replace the body of `main` after the `existsSync` guard with:

```js
  if (!existsSync(indexPath)) return;
  let indexText = "";
  try { indexText = readFileSync(indexPath, "utf8"); } catch { return; }
  const signals = new Set();   // populated in Task 4
  const picked = [];           // populated in Task 3
  const additionalContext = buildBlock(indexText, signals, picked);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add learning-loop/hooks/memory-retrieval.mjs learning-loop/hooks/memory-retrieval.test.mjs
git commit -m "feat(memory-retrieval): always inject MEMORY.md index into context"
```

---

### Task 3: Recency fallback — inline newest fact bodies

**Files:**
- Modify: `learning-loop/hooks/memory-retrieval.mjs`
- Test: `learning-loop/hooks/memory-retrieval.test.mjs`

**Interfaces:**
- Consumes: `buildBlock` (Task 2).
- Produces: `tokenize(s)` → `Set<string>`; `parseIndex(indexText)` → `[{file, text}]`; `selectFacts(entries, memoryDir, signals)` → `[{file, content}]` (≤ `MAX_FACTS`, ≤ `MAX_CHARS` of bodies; signal-scored first, recency fallback). When `signals` is empty, ranking is purely by fact-file mtime descending.

- [ ] **Step 1: Write the failing test (T3 — no git signal → newest fact inlined)**

Append to `memory-retrieval.test.mjs`:

```js
test("T3: brak sygnalu (fake cwd, brak gita) -> fallback recency wstrzykuje najnowszy fakt", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\not-a-repo"; // not a real/git dir -> git fails -> signals empty
  const index =
    "# Memory\n" +
    "- [Old fact](old.md) — stary temat\n" +
    "- [New fact](new.md) — nowszy temat\n";
  const dir = seedMemory(home, cwd, index, {
    "old.md": "OLD FACT BODY",
    "new.md": "NEW FACT BODY",
  });
  // Make new.md clearly newer than old.md.
  const t0 = Date.now() / 1000;
  utimesSync(join(dir, "old.md"), t0 - 100, t0 - 100);
  utimesSync(join(dir, "new.md"), t0, t0);
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /## Przywołane fakty/);
  assert.match(ctx, /NEW FACT BODY/);
  // newest ranked first
  assert.ok(ctx.indexOf("NEW FACT BODY") < ctx.indexOf("OLD FACT BODY"));
});
```

Note: `runHook` is called with `cwd` arg = a real temp dir for `execFileSync`, but stdin `cwd` = the fake path used for slug + git. git in a fake/non-existent dir fails → signals empty → recency path.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: FAIL — no "Przywołane fakty" section (picked still `[]`).

- [ ] **Step 3: Implement `tokenize`, `parseIndex`, `selectFacts`; wire `main`**

In `memory-retrieval.mjs`, extend imports and add functions:

```js
import { readFileSync, existsSync, statSync } from "node:fs";
```

Add the constants near the top (below imports):

```js
const MAX_FACTS = 5;
const MAX_CHARS = 4000;
const MIN_TOKEN_LEN = 3;
```

Add functions:

```js
function tokenize(s) {
  return new Set(
    String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= MIN_TOKEN_LEN)
  );
}

// Parse "- [Title](file.md) — hook" index lines.
function parseIndex(indexText) {
  const entries = [];
  for (const line of indexText.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[([^\]]+)\]\(([^)]+\.md)\)\s*(?:[—-]\s*(.*))?$/);
    if (!m) continue;
    entries.push({ file: m[2], text: m[1] + " " + (m[3] || "") });
  }
  return entries;
}

function selectFacts(entries, memoryDir, signals) {
  const enriched = entries.map((e) => {
    const full = join(memoryDir, e.file);
    let mtime = 0;
    try { mtime = statSync(full).mtimeMs; } catch { /* missing fact file */ }
    const etoks = tokenize(e.text);
    let score = 0;
    for (const t of signals) if (etoks.has(t)) score++;
    return { file: e.file, full, mtime, score };
  }).filter((e) => e.mtime > 0);

  const scored = enriched.filter((e) => e.score > 0);
  const ranked = scored.length
    ? scored.sort((a, b) => b.score - a.score || b.mtime - a.mtime)
    : enriched.sort((a, b) => b.mtime - a.mtime);

  const picked = [];
  let used = 0;
  for (const e of ranked) {
    if (picked.length >= MAX_FACTS) break;
    let content;
    try { content = readFileSync(e.full, "utf8"); } catch { continue; }
    if (used + content.length > MAX_CHARS) continue; // skip too-big; never truncate
    picked.push({ file: e.file, content });
    used += content.length;
  }
  return picked;
}
```

Update `main` — replace the `const picked = [];` line with:

```js
  const memoryDir = deriveMemoryDir(cwd);
  const entries = parseIndex(indexText);
  const signals = new Set();   // populated in Task 4
  const picked = entries.length ? selectFacts(entries, memoryDir, signals) : [];
```

(`memoryDir` is now computed once in `main`; remove the duplicate inline `deriveMemoryDir(cwd)` in the `indexPath` line by computing `const indexPath = join(memoryDir, "MEMORY.md");` after `const memoryDir = deriveMemoryDir(cwd);`. Ensure `memoryDir` is defined before `indexPath`.)

Resulting `main` order:

```js
function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const cwd = input.cwd || process.cwd();
  const memoryDir = deriveMemoryDir(cwd);
  const indexPath = join(memoryDir, "MEMORY.md");
  if (!existsSync(indexPath)) return;
  let indexText = "";
  try { indexText = readFileSync(indexPath, "utf8"); } catch { return; }
  const entries = parseIndex(indexText);
  const signals = new Set();   // populated in Task 4
  const picked = entries.length ? selectFacts(entries, memoryDir, signals) : [];
  const additionalContext = buildBlock(indexText, signals, picked);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: PASS (3 tests). T1 and T7 still pass.

- [ ] **Step 5: Commit**

```bash
git add learning-loop/hooks/memory-retrieval.mjs learning-loop/hooks/memory-retrieval.test.mjs
git commit -m "feat(memory-retrieval): recency-fallback selection + inline fact bodies"
```

---

### Task 4: Signal matching — git branch + diff ranking

**Files:**
- Modify: `learning-loop/hooks/memory-retrieval.mjs`
- Test: `learning-loop/hooks/memory-retrieval.test.mjs`

**Interfaces:**
- Consumes: `tokenize`, `selectFacts` (Task 3).
- Produces: `git(args, cwd)` → string (`""` on any failure); `gatherSignals(cwd)` → `Set<string>` from branch name + recent changed paths. `main` now passes real signals into `selectFacts`/`buildBlock`.

- [ ] **Step 1: Write the failing test (T2 — branch token matches a fact)**

Add a git helper and test to `memory-retrieval.test.mjs`. Extend the child_process import:

```js
import { execFileSync, execSync } from "node:child_process";
```

Append:

```js
function gitRepoOnBranch(branch) {
  const d = freshDir();
  execSync("git init -q", { cwd: d });
  execSync("git config user.email t@example.com", { cwd: d });
  execSync("git config user.name tester", { cwd: d });
  writeFileSync(join(d, "seed.txt"), "x\n");
  execSync("git add seed.txt", { cwd: d });
  execSync("git commit -q -m init", { cwd: d });
  execSync("git checkout -q -b " + branch, { cwd: d });
  return d;
}

test("T2: branch token dopasowuje fakt -> ten fakt wstrzykniety (rank 1)", () => {
  const home = freshHome();
  const cwd = gitRepoOnBranch("feat-auth-login"); // tokens: feat, auth, login
  const index =
    "# Memory\n" +
    "- [Styling rules](css.md) — odstepy formularzy\n" +
    "- [Auth flow](auth.md) — auth login session\n";
  seedMemory(home, cwd, index, {
    "css.md": "CSS FACT BODY",
    "auth.md": "AUTH FACT BODY",
  });
  const { code, out } = runHook({ cwd }, cwd, home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /AUTH FACT BODY/);
  // signal-matched auth fact ranks before the unmatched css fact (if present at all)
  if (ctx.includes("CSS FACT BODY")) {
    assert.ok(ctx.indexOf("AUTH FACT BODY") < ctx.indexOf("CSS FACT BODY"));
  }
  // signals line reflects branch tokens
  assert.match(ctx, /auth/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: FAIL — signals empty (`new Set()`), so ranking is recency-only and the signals line shows `brak (fallback: recency)`; `assert.match(ctx, /auth/)` on the signals line fails (auth body may still appear via recency, but ordering/signals assertion fails). 

- [ ] **Step 3: Implement `git` + `gatherSignals`; wire `main`**

Extend imports:

```js
import { execFileSync } from "node:child_process";
```

Add the constant near the others:

```js
const GIT_TIMEOUT_MS = 1500;
```

Add functions:

```js
function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd, timeout: GIT_TIMEOUT_MS, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { return ""; }
}

function gatherSignals(cwd) {
  const branch = git(["branch", "--show-current"], cwd);
  const changed = git(["diff", "--name-only", "HEAD~3", "HEAD"], cwd);
  return tokenize(branch + " " + changed);
}
```

In `main`, replace `const signals = new Set();   // populated in Task 4` with:

```js
  const signals = gatherSignals(cwd);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: PASS (4 tests). T3's fake-cwd path still yields empty signals (git fails) → recency, so T3 still passes.

- [ ] **Step 5: Commit**

```bash
git add learning-loop/hooks/memory-retrieval.mjs learning-loop/hooks/memory-retrieval.test.mjs
git commit -m "feat(memory-retrieval): rank facts by git branch+diff signal overlap"
```

---

### Task 5: Caps + malformed-input robustness

**Files:**
- Test: `learning-loop/hooks/memory-retrieval.test.mjs`
- (Implementation already enforces caps via `selectFacts`; this task proves it and the no-crash contract.)

**Interfaces:**
- Consumes: full hook from Tasks 1–4. No new production code expected unless a test reveals a gap.

- [ ] **Step 1: Write the failing/guard tests (T5 budget, T4 malformed)**

Append to `memory-retrieval.test.mjs`:

```js
test("T5: tresc faktow > MAX_CHARS -> budzet respektowany, brak uciecia w pol", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\budget-test"; // no git -> recency
  const big = "A".repeat(3000);
  const index =
    "# Memory\n" +
    "- [Fact one](f1.md) — temat\n" +
    "- [Fact two](f2.md) — temat\n";
  const dir = seedMemory(home, cwd, index, {
    "f1.md": big,           // 3000 chars
    "f2.md": "B".repeat(3000), // would push total to 6000 > 4000
  });
  const t0 = Date.now() / 1000;
  utimesSync(join(dir, "f1.md"), t0, t0);
  utimesSync(join(dir, "f2.md"), t0 - 100, t0 - 100); // f1 newest
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  // exactly one 3000-char fact body fits under 4000; the second is skipped whole
  const aCount = (ctx.match(/A{3000}/) || []).length;
  const bCount = (ctx.match(/B{3000}/) || []).length;
  assert.equal(aCount, 1);
  assert.equal(bCount, 0);
});

test("T4: zepsuty MEMORY.md -> brak crasha, exit 0, poprawny JSON", () => {
  const home = freshHome();
  const cwd = "C:\\fake\\malformed";
  seedMemory(home, cwd, "  not markdown ][)(— random {garbage}\n###");
  const { code, out } = runHook({ cwd }, freshDir(), home);
  assert.equal(code, 0);
  const parsed = JSON.parse(out); // must be valid JSON
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.doesNotMatch(parsed.hookSpecificOutput.additionalContext, /Przywołane fakty/);
});
```

- [ ] **Step 2: Run tests**

Run: `node --test learning-loop/hooks/memory-retrieval.test.mjs`
Expected: PASS (6 tests). If T5 or T4 fail, fix `selectFacts`/`main` per the spec (cap check uses `used + content.length > MAX_CHARS`; malformed index → `parseIndex` returns `[]` → `picked` `[]`) and re-run until green.

- [ ] **Step 3: Run the full plugin test suite (no regressions)**

Run:
```bash
node --test learning-loop/hooks/memory-retrieval.test.mjs
node --test learning-loop/hooks/friction-capture.test.mjs
node --test learning-loop/hooks/reflection-gate.test.mjs
```
Expected: 6/6, 5/5, 7/7 — all green.

- [ ] **Step 4: Commit**

```bash
git add learning-loop/hooks/memory-retrieval.test.mjs
git commit -m "test(memory-retrieval): cover MAX_CHARS budget cap and malformed-index resilience"
```

---

### Task 6: Documentation update

**Files:**
- Modify: `learning-loop/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the loop diagram + hook list**

In `learning-loop/README.md`, in the "Jak działa — pętla krok po kroku" area and the Stop-hook section, add a `SessionStart` retrieval step. Insert before the `Stop hook` description a new subsection:

```markdown
### SessionStart hook (`memory-retrieval`) — przywołanie pamięci

**Co robi:** na starcie sesji wyprowadza katalog pamięci per-projekt z `cwd`, czyta
`MEMORY.md`, rankuje wpisy wg pokrycia tokenów sygnałami sesji (branch + `git diff HEAD~3`),
a gdy brak sygnału — wg świeżości. Wstrzykuje indeks oraz **treść** top-5 faktów (budżet
4000 znaków) inline do kontekstu, żeby wiedza była dostępna, nie tylko „do pobrania".

**Kiedy milczy:** brak pamięci projektu / zły JSON / brak gita — cichy `exit 0`, zero błędów.

**Zero zahardkodowanej mapy domen** — ranking liczony z opisów na dysku, więc się nie starzeje.
```

- [ ] **Step 2: Update the memory map table**

In the "Mapa pamięci — gdzie ląduje co" table, add a row:

```markdown
| Retrieval | przywołanie faktów na starcie sesji | `memory-retrieval` (SessionStart) → `additionalContext` |
```

- [ ] **Step 3: Update "Czego świadomie NIE robi" + requirements note**

In "Czego świadomie NIE robi (YAGNI)", change the line about hooks. Replace:

```markdown
- **Brak hooków na każdą akcję** — tylko jeden lekki Stop hook. Im mniej automatyki w tle,
  tym mniej kruchości.
```

with:

```markdown
- **Minimalny zestaw hooków** — SessionStart (retrieval), Stop (reflection-gate),
  PostToolUseFailure (friction-capture). Trzy lekkie hooki node, każdy z testami; żadnej
  automatyki „na każdą akcję" ponad to. Im mniej automatyki w tle, tym mniej kruchości.
```

- [ ] **Step 4: Commit**

```bash
git add learning-loop/README.md
git commit -m "docs(memory-retrieval): document SessionStart retrieval hook + memory map"
```

---

## Self-Review

**1. Spec coverage:**
- §4 architecture (single mjs, exec form, black-box test) → Tasks 1–5. ✓
- §5.1 locate + slug → Task 1 (`deriveMemoryDir`), proven via T2/T3/T5 placing memory at derived path. ✓
- §5.2 parse index → Task 3 (`parseIndex`). ✓
- §5.3 signals → Task 4 (`gatherSignals`). ✓
- §5.4 scoring → Task 3 (`selectFacts` score) wired live in Task 4. ✓
- §5.5 selection + caps + fallback → Task 3 (`selectFacts`), proven Task 5 (T5). ✓
- §5.6 output contract → Task 2 (`buildBlock` + `main` write). ✓
- §6 failure modes → Task 1 try/catch + Task 5 (T4). ✓
- §7 constants → introduced where first used (Task 3: MAX_FACTS/MAX_CHARS/MIN_TOKEN_LEN; Task 4: GIT_TIMEOUT_MS). ✓
- §8 tests T1–T7 → T1 (Task1), T7 (Task2), T3 (Task3), T2 (Task4), T5+T4 (Task5); T6 (slug) covered implicitly — every memory-found test (T2/T3/T5) only passes if derivation matches the path the test wrote to. ✓
- §9 acceptance → Tasks 1–6. ✓
- §10 docs → Task 6. ✓

**2. Placeholder scan:** No TBD/TODO; every code/test step shows complete code; commands have expected output. ✓

**3. Type/name consistency:** `deriveMemoryDir`, `tokenize`, `parseIndex` (`{file,text}`), `selectFacts` (`{file,content}`), `git`, `gatherSignals` (`Set`), `buildBlock(indexText, signals, picked)` — names used identically across Tasks 2–4 and the final `main`. Constants `MAX_FACTS`/`MAX_CHARS`/`MIN_TOKEN_LEN`/`GIT_TIMEOUT_MS` defined once. ✓

**Note on T6 explicitness:** slug derivation has no standalone assertion (the hook is a black box with no exports, matching repo convention). It is covered transitively: T2/T3/T5 seed memory at `slugOf(cwd)` and only pass if the hook derives the same slug. If a reviewer wants an explicit unit assertion, that would require exporting `deriveMemoryDir` — deferred to avoid diverging from the existing script-style hooks.
