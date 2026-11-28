import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("CRAP combines classic complexity with uncovered, partial, and full coverage", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "crap-test-")));
  try {
    await mkdir(join(root, "coverage"));
    const file = join(root, "sample.ts");
    await writeFile(file, "function sample(x: boolean) {\n  if (x) return 1;\n  return 0;\n}\n");
    for (const [hits, expected] of [[[0, 0], 6], [[1, 0], 2.5], [[1, 1], 2]]) {
      const loc = line => ({ start: { line, column: 2 }, end: { line, column: 18 } });
      await writeFile(join(root, "coverage/coverage-final.json"), JSON.stringify({ [file]: {
        fnMap: { 0: { name: "sample", decl: { start: { line: 1, column: 9 }, end: { line: 1, column: 15 } }, loc: { start: { line: 1, column: 28 }, end: { line: 4, column: 3 } } } },
        f: { 0: Math.max(...hits) }, statementMap: { 0: loc(2), 1: loc(3) }, s: { 0: hits[0], 1: hits[1] }
      } }));
      execFileSync(process.execPath, [resolve("scripts/crap.mjs")], { cwd: root });
      const rows = JSON.parse(await readFile(join(root, "coverage/crap.json"), "utf8"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].complexity, 2);
      assert.equal(rows[0].crap, expected);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CRAP matches constructor coverage declared at the method key", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "crap-constructor-test-")));
  try {
    await mkdir(join(root, "coverage"));
    const file = join(root, "sample.ts");
    await writeFile(file, "class Sample {\n  constructor(x) {\n    if (x) this.x = 1;\n  }\n}\n");
    for (const [hits, expected] of [[0, 6], [1, 2]]) {
      await writeFile(join(root, "coverage/coverage-final.json"), JSON.stringify({ [file]: {
        fnMap: { 0: { name: "constructor", decl: { start: { line: 2, column: 2 }, end: { line: 2, column: 13 } }, loc: { start: { line: 2, column: 17 }, end: { line: 4, column: 3 } } } },
        f: { 0: hits },
        statementMap: { 0: { start: { line: 3, column: 4 }, end: { line: 3, column: 23 } } }, s: { 0: hits }
      } }));
      execFileSync(process.execPath, [resolve("scripts/crap.mjs")], { cwd: root });
      const rows = JSON.parse(await readFile(join(root, "coverage/crap.json"), "utf8"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].complexity, 2);
      assert.equal(rows[0].crap, expected);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
