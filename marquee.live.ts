#!/usr/bin/env bun
/**
 * marquee.live.ts — TDD verification of marquee's lapidary-backed remediate
 * against REAL infrastructure. Red is data — a failing assertion names the
 * exact layer to fix (marquee remediate → lapidary engine → target walk).
 *
 * Run: bun test ./marquee.live.ts
 */
import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { remediateRepo, renameRepo } from "./src/remediate.ts";

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "marquee-live-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), "# oldname\n\noldname is a tool for everyone.\n\n## Quickstart\n\n```bash\nbun install\n```\n");
  fs.writeFileSync(path.join(dir, "src", "index.ts"), "export const oldname = 1;\n");
  fs.writeFileSync(path.join(dir, "src", "helper.ts"), "// oldname helper\n");
  return dir;
}

describe("marquee remediate (lapidary-backed)", () => {
  it("renameRepo rewrites word occurrences across the repo", () => {
    const dir = makeRepo();
    const r = remediateRepo(dir, {
      wordPairs: [{ from: "oldname", to: "newname" }],
    });
    expect(r.edits).toBeGreaterThan(0);
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    expect(readme).toContain("newname is a tool");
    expect(readme).not.toContain("oldname is a tool");
    const src = fs.readFileSync(path.join(dir, "src", "index.ts"), "utf8");
    expect(src).toContain("newname");
  });

  it("renameRepo handles case variants (Oldname → Newname)", () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, "README.md"), "# Oldname\n\nOldname rocks.\n");
    const r = renameRepo(dir, "oldname", "newname");
    expect(r.edits).toBeGreaterThan(0);
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    expect(readme).toContain("# Newname");
  });

  it("dry-run reports edits without writing", () => {
    const dir = makeRepo();
    const r = remediateRepo(dir, { wordPairs: [{ from: "oldname", to: "newname" }], dryRun: true });
    expect(r.edits).toBeGreaterThan(0);
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    expect(readme).toContain("oldname is a tool");
  });

  it("writes an undo journal for lapidary undo", () => {
    const dir = makeRepo();
    remediateRepo(dir, { wordPairs: [{ from: "oldname", to: "newname" }] });
    expect(fs.existsSync(path.join(dir, ".lapidary-undo.jsonl"))).toBe(true);
  });

  it("applies .lapidary rule files", () => {
    const dir = makeRepo();
    const rulesFile = path.join(dir, "rules.lapidary");
    fs.writeFileSync(rulesFile, "rules:\n  - word: oldname => newname\n");
    const r = remediateRepo(dir, { ruleFiles: [rulesFile] });
    expect(r.edits).toBeGreaterThan(0);
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    expect(readme).toContain("newname is a tool");
  });
});