import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "reflection-gate.mjs");

function runHook(input, cwd) {
  try {
    const out = execFileSync("node", [HOOK], {
      cwd, input: JSON.stringify(input), encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: e.stdout ?? "" };
  }
}

function freshDir() { return mkdtempSync(join(tmpdir(), "ll-hook-")); }

function gitRepo() {
  const d = freshDir();
  execSync("git init -q", { cwd: d });
  execSync("git config user.email t@example.com", { cwd: d });
  execSync("git config user.name tester", { cwd: d });
  return d;
}

test("stop_hook_active -> milczy (exit 0, brak outputu)", () => {
  const { code, out } = runHook({ stop_hook_active: true }, freshDir());
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("poza repo git -> milczy", () => {
  const { code, out } = runHook({}, freshDir());
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("repo git czyste -> milczy", () => {
  const d = gitRepo();
  writeFileSync(join(d, "a.txt"), "x\n");
  execSync("git add a.txt", { cwd: d });
  execSync("git commit -q -m init", { cwd: d });
  const { code, out } = runHook({}, d);
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("repo git z modyfikacja sledzonego pliku -> block", () => {
  const d = gitRepo();
  writeFileSync(join(d, "a.txt"), "x\n");
  execSync("git add a.txt", { cwd: d });
  execSync("git commit -q -m init", { cwd: d });
  writeFileSync(join(d, "a.txt"), "x\nzmiana\n");
  const { code, out } = runHook({}, d);
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /\/reflect/);
});

// Charakteryzuje GRANICE: pliki nieśledzone NIE są wykrywane (git diff --quiet ich nie widzi).
// Naprawa tej luki = Tier C #4/#5, poza tym planem. Test pilnuje, że zachowanie się nie zmienia niezauważenie.
test("repo git tylko z plikiem niesledzonym -> milczy (znana granica, Tier C)", () => {
  const d = gitRepo();
  writeFileSync(join(d, "a.txt"), "x\n");
  execSync("git add a.txt", { cwd: d });
  execSync("git commit -q -m init", { cwd: d });
  writeFileSync(join(d, "nowy.txt"), "nieśledzony\n");
  const { code, out } = runHook({}, d);
  assert.equal(code, 0);
  assert.equal(out, "");
});
