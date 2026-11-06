import { describe, expect, test } from "bun:test";
import { auditRepo, formatAudit, repoSlug } from "../src/audit.ts";

describe("audit", () => {
  test("scaffold (no README) audits as PRESENTABLE-NOT-YET with P0 fails", async () => {
    const dir = await Bun.$`mktemp -d`.text().then((s) => s.trim());
    await Bun.$`touch ${dir}/.git`.catch(() => {});
    const r = auditRepo(dir);
    expect(r.score).toBe("PRESENTABLE-NOT-YET");
    expect(r.failCount).toBeGreaterThan(0);
    const p0readme = r.checks.find((c) => c.id === "p0-readme");
    expect(p0readme?.pass).toBe(false);
  });

  test("badges + quickstart + license recognized", async () => {
    const dir = await Bun.$`mktemp -d`.text().then((s) => s.trim());
    await Bun.$`mkdir -p ${dir}`;
    await Bun.write(
      `${dir}/README.md`,
      `# demo\n\n[![CI](https://img.shields.io/github/actions/workflow/status/x/y/ci.yml)](${dir})\n\ndemo tool for everyone.\n\n## Quickstart\n\n\`\`\`bash\nbun install\n\`\`\`\n\n## Roadmap\n\n- [x] done\n`,
    );
    await Bun.write(`${dir}/LICENSE`, "MIT\n\nCopyright (c) 2026 toxicwind\n");
    const r = auditRepo(dir);
    expect(r.checks.find((c) => c.id === "p0-badges")?.pass).toBe(true);
    expect(r.checks.find((c) => c.id === "p0-quickstart")?.pass).toBe(true);
    expect(r.checks.find((c) => c.id === "p0-license")?.pass).toBe(true);
    expect(r.checks.find((c) => c.id === "p2-roadmap")?.pass).toBe(true);
  });

  test("placeholder license fails p0-license", async () => {
    const dir = await Bun.$`mktemp -d`.text().then((s) => s.trim());
    await Bun.write(`${dir}/LICENSE`, "MIT\n\nCopyright (c) [year] [name]\n");
    const r = auditRepo(dir);
    expect(r.checks.find((c) => c.id === "p0-license")?.pass).toBe(false);
  });

  test("jargon-free one-liner passes p4-jargon", async () => {
    const dir = await Bun.$`mktemp -d`.text().then((s) => s.trim());
    await Bun.write(`${dir}/README.md`, `# demo\n\nA simple tool for the job.\n\n## Quickstart\n\`\`\`bash\nx\n\`\`\`\n\n## Roadmap\n\n- [x] done\n\n## License\n\nMIT\n`);
    const r = auditRepo(dir);
    expect(r.checks.find((c) => c.id === "p4-jargon")?.pass).toBe(true);
    expect(r.checks.find((c) => c.id === "p4-todo")?.pass).toBe(true);
  });

  test("formatAudit prints score line", () => {
    const line = formatAudit(auditRepo("/tmp"));
    expect(line).toContain("checks pass. Score:");
  });

  test("repoSlug parses https + ssh forms", async () => {
    const dir = await Bun.$`mktemp -d`.text().then((s) => s.trim());
    await Bun.write(`${dir}/README.md`, "x");
    await Bun.$`git init -q -b main ${dir}`.catch(() => {});
    // no remote → null
    expect(repoSlug(dir)).toBeNull();
  });
});