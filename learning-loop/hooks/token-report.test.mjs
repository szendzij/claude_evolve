import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "token-report.mjs");

function freshHome() { return mkdtempSync(join(tmpdir(), "ll-tr-home-")); }

function runHook(input, home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const out = execFileSync("node", [HOOK], {
      input: JSON.stringify(input), encoding: "utf8",
      env, stdio: ["pipe", "pipe", "ignore"],
    });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? 1, out: e.stdout ?? "" }; }
}

function reportPath(home) {
  return join(home, ".claude", "learning-loop", "token-reports", "latest.json");
}

function readReport(home) {
  return JSON.parse(readFileSync(reportPath(home), "utf8"));
}

// Poll until the background worker creates the file or we time out.
async function waitForFile(path, timeout = 2000) {
  const start = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - start > timeout) throw new Error(`File not created within ${timeout}ms: ${path}`);
    await delay(25);
  }
}

test("T1: exit 0 zawsze, nawet bez session_id", () => {
  const home = freshHome();
  const { code } = runHook({}, home);
  assert.equal(code, 0);
});

test("T2: tworzy latest.json z prawidlowa struktura", async () => {
  const home = freshHome();
  const { code } = runHook({ session_id: "test-session" }, home);
  assert.equal(code, 0);
  await waitForFile(reportPath(home));
  const r = readReport(home);
  assert.equal(r.session_id, "test-session");
  assert.ok(typeof r.memory_injection?.tokens === "number");
  assert.ok(typeof r.total_max?.tokens === "number");
  assert.ok("reflect" in (r.skills || {}));
  assert.ok("curator" in (r.skills || {}));
  assert.ok("skill-review" in (r.skills || {}));
});

test("T3: tworzy latest.md z czytelna trescia", async () => {
  const home = freshHome();
  runHook({ session_id: "test-md" }, home);
  const mdPath = join(home, ".claude", "learning-loop", "token-reports", "latest.md");
  await waitForFile(mdPath);
  const content = readFileSync(mdPath, "utf8");
  assert.match(content, /Token Footprint/);
  assert.match(content, /\/reflect/);
  assert.match(content, /Max total/);
});

test("T4: czyta rozmiar iniekcji z session-tokens", async () => {
  const home = freshHome();
  const sid = "with-injection";
  const tokenDir = join(home, ".claude", "learning-loop", "session-tokens");
  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(join(tokenDir, sid + ".json"),
    JSON.stringify({ chars: 2000, ts: new Date().toISOString() }));

  runHook({ session_id: sid }, home);
  await waitForFile(reportPath(home));
  const r = readReport(home);
  assert.equal(r.memory_injection.chars, 2000);
  assert.equal(r.memory_injection.tokens, 500); // 2000/4
});

test("T5: bez pliku session-tokens -> memory_injection = 0 tok", async () => {
  const home = freshHome();
  runHook({ session_id: "no-injection" }, home);
  await waitForFile(reportPath(home));
  const r = readReport(home);
  assert.equal(r.memory_injection.chars, 0);
  assert.equal(r.memory_injection.tokens, 0);
});
