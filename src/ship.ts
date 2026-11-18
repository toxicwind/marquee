/**
 * marquee ship — commit + push + verify. Forward-only, main is fine (Pens doctrine:
 * "we are allowed to main"). Never force-push unless --preserve is set, in which
 * case the current `main` is renamed to `main-archived-YYYYMMDD` first so the
 * pre-rewrite state is never lost (Pens convention). Uses gh auth for push (PAT
 * w/o workflow scope can't touch .github — surfaced as a clear warning, workaround:
 * gh auth refresh).
 */
import { auditRepo, formatAudit, repoSlug } from "./audit.ts";

export interface ShipOptions {
  message?: string;
  push?: boolean;
  /** final re-verify after push */
  verify?: boolean;
  /**
   * Before force-pushing, rename the current `main` to `main-archived-YYYYMMDD`
   * so the pre-rewrite state is preserved as a branch (Pens convention:
   * "main always gets renamed with a timestamp before it is rewritten").
   */
  preserve?: boolean;
}

function run(args: string[], cwd: string): { code: number; out: string; err: string } {
  const proc = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode ?? -1, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * Rename the current `main` to `main-archived-YYYYMMDD` (locally + on origin) so
 * a subsequent force-push/rewrite never destroys the pre-rewrite state. No-op if
 * there is no `main` branch. Returns a human-readable note (or "" if nothing done).
 */
function preserveMain(dir: string): string {
  const hasMain = run(["git", "rev-parse", "--verify", "refs/heads/main"], dir);
  if (hasMain.code !== 0) return "";
  const archived = `main-archived-${todayStamp()}`;
  const mv = run(["git", "branch", "-m", "main", archived], dir);
  if (mv.code !== 0) return `[WARN] preserve: could not rename main -> ${archived}: ${mv.err.trim()}`;
  // Push the archived branch so it survives on origin too.
  const slug = repoSlug(dir);
  const push = run(
    slug ? ["git", "push", `https://github.com/${slug}.git`, archived] : ["git", "push", "origin", archived],
    dir,
  );
  const note = `[preserve] renamed main -> ${archived}`;
  return push.code === 0 ? note : `${note} (push: ${push.err.trim()})`;
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

  // Preserve the pre-rewrite main before any force-push (Pens convention).
  if (opts.preserve) {
    const note = preserveMain(dir);
    if (note) lines.push(note);
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