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
