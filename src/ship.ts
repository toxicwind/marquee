/**
 * marquee ship — commit + push + verify. Forward-only, main is fine (estate doctrine:
 * "we are allowed to main"). Never force-push. Uses gh auth for push (PAT w/o workflow
 * scope can't touch .github — surfaced as a clear warning, workaround: gh auth refresh).
 */
import { auditRepo, formatAudit, repoSlug } from "./audit.ts";

export interface ShipOptions {
  message?: string;
  push?: boolean;
  /** final re-verify after push */
  verify?: boolean;
}

function run(args: string[], cwd: string): { code: number; out: string; err: string } {
  const proc = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode ?? -1, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

/**
 * Commit all changes, push to origin main (if --push), then re-audit (if --verify).
 * Returns a human-readable report.
 */
export function shipRepo(dir: string, opts: ShipOptions = {}): string {
  const message = opts.message ?? "chore: marquee star-grade pass";
  const lines: string[] = [];
  const status = run(["git", "status", "--porcelain"], dir);
  if (status.code !== 0) return `Not a git repo: ${dir}`;
  if (status.out.trim().length === 0) lines.push("Working tree clean — nothing to commit.");
  else {
    const add = run(["git", "add", "-A"], dir);
    if (add.code !== 0) return `git add failed: ${add.err}`;
    const commit = run(["git", "commit", "-m", message], dir);
    if (commit.code !== 0) return `git commit failed: ${commit.err}`;
    lines.push(commit.out.trim() || `Committed: ${message}`);
  }

  if (opts.push) {
    const slug = repoSlug(dir);
    // Prefer gh's credential helper; fall back to https URL with gh token.
    const pushCmd = slug
      ? ["git", "push", `https://github.com/${slug}.git`, "main"]
      : ["git", "push", "origin", "main"];
    const push = run(pushCmd, dir);
    if (push.code !== 0) {
      const workflowBlocked = /workflow/i.test(push.err) && /scope/i.test(push.err);
      lines.push(
        workflowBlocked
          ? `[WARN] push rejected: workflow scope missing on token. Run \`gh auth refresh -s workflow\` then push manually.`
          : `[FAIL] push: ${push.err.trim()}`,
      );
    } else {
      lines.push(push.out.trim() || `Pushed to main.`);
    }
  } else {
    lines.push("Push skipped (no --push).");
  }

  if (opts.verify) {
    lines.push("", "Post-pass audit:");
    lines.push(formatAudit(auditRepo(dir)));
  }
  return lines.join("\n");
}