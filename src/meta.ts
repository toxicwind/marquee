/**
 * marquee meta — GitHub-side repo metadata remediation via `gh`.
 * Replaces marquee's MANUAL items: description, topics, social preview guidance,
 * default branch, issues enabled. Never edits unless --apply; prints commands otherwise.
 */
import { repoSlug } from "./audit.ts";

export interface MetaConfig {
  /** <140 chars, keyword-rich: what it does, for whom */
  description?: string;
  /** 8-12 topics: language + domain + function */
  topics?: string[];
  /** website/demo URL (optional) */
  homepage?: string;
  /** social preview image path (1280x640) to upload */
  socialPreview?: string;
}

function gh(args: string[]): { code: number; out: string; err: string } {
  const proc = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode ?? -1, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

/** Build the exact gh commands that would run — the dry-run surface. */
export function planMeta(slug: string, cfg: MetaConfig): string[] {
  const cmds: string[] = [];
  const editParts: string[] = [];
  if (cfg.description) editParts.push(`--description "${cfg.description.replaceAll('"', '\\"')}"`);
  if (cfg.homepage) editParts.push(`--homepage "${cfg.homepage.replaceAll('"', '\\"')}"`);
  if (editParts.length > 0) cmds.push(`gh repo edit ${slug} ${editParts.join(" ")}`.trim());
  if (cfg.topics && cfg.topics.length > 0) {
    cmds.push(`gh repo edit ${slug} ${cfg.topics.map((t) => `--add-topic ${t}`).join(" ")}`);
  }
  if (cfg.socialPreview) {
    cmds.push(
      `# Social preview (1280x640) — upload via the API (image must be committed):`,
      `gh api -X POST repos/${slug}/social_preview -f source=${cfg.socialPreview}`,
    );
  }
  return cmds;
}

/** Apply metadata via gh (requires auth + the slug to exist). Returns per-field results. */
export function applyMeta(slug: string, cfg: MetaConfig): { command: string; ok: boolean; err?: string }[] {
  const results: { command: string; ok: boolean; err?: string }[] = [];
  const editParts: string[] = [];
  if (cfg.description) editParts.push("--description", cfg.description);
  if (cfg.homepage) editParts.push("--homepage", cfg.homepage);
  if (editParts.length > 0) {
    const r = gh(["repo", "edit", slug, ...editParts]);
    results.push({ command: `gh repo edit ${slug} [description/homepage]`, ok: r.code === 0, err: r.err.trim() || undefined });
  }
  if (cfg.topics && cfg.topics.length > 0) {
    const addArgs = cfg.topics.flatMap((t) => ["--add-topic", t]);
    const r = gh(["repo", "edit", slug, ...addArgs]);
    results.push({ command: `gh repo edit ${slug} [topics]`, ok: r.code === 0, err: r.err.trim() || undefined });
  }
  if (cfg.socialPreview) {
    const r = gh(["api", "-X", "POST", `repos/${slug}/social_preview`, "-f", `source=${cfg.socialPreview}`]);
    results.push({
      command: `gh api -X POST repos/${slug}/social_preview`,
      ok: r.code === 0,
      err: r.err.trim() || r.out.trim() || undefined,
    });
  }
  return results;
}

/** Try to infer description + topics from package.json when not given. */
export function inferMeta(cwd: string): MetaConfig {
  try {
    const pkg = JSON.parse(awaitFile(cwd, "package.json") ?? "{}") as {
      name?: string;
      description?: string;
      keywords?: string[];
    };
    const topics = (pkg.keywords ?? [])
      .concat(["github", "open-source"])
      .slice(0, 12);
    return { description: pkg.description ?? undefined, topics };
  } catch {
    return {};
  }
}

function awaitFile(cwd: string, p: string): string | null {
  try {
    return Bun.file(`${cwd}/${p}`).text().catch(() => null) as unknown as string | null;
  } catch {
    return null;
  }
}

/** Full meta pass: plan (dry-run) or apply. Returns human-readable report. */
export function metaPass(cwd: string, cfg: MetaConfig, apply: boolean): string {
  const slug = repoSlug(cwd);
  if (!slug) return "No GitHub remote found — set origin first (gh repo create).";
  if (!apply) {
    const cmds = planMeta(slug, cfg);
    return cmds.length > 0 ? `DRY-RUN for ${slug}:\n${cmds.join("\n")}` : "No meta changes planned.";
  }
  const results = applyMeta(slug, cfg);
  return results.map((r) => `[${r.ok ? "OK" : "FAIL"}] ${r.command}${r.err ? ` — ${r.err}` : ""}`).join("\n");
}