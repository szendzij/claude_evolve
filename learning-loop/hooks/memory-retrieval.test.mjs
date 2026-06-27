import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
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
