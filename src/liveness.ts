/**
 * marquee liveness — badge/link health checks.
 * Extracts URLs from README.md, docs markdown, and .github globs, HEADs each
 * with a short timeout, reports 200/redirect/broken. Own mini implementation
 * (no dep) — pattern credit: linkinator / @umbrelladocs/linkspector.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const URL_RE = /(https?:\/\/[^\s)\]}>"'`]+)/g;
const MARKDOWN_GLOB = ["README.md", "docs", ".github", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md", "CHANGELOG.md"];

export interface LinkCheck {
  url: string;
  file: string;
  status: number | "skip";
  ok: boolean;
  note?: string;
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string, rel: string) => {
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        if (rel === "node_modules" || rel === ".git") return;
        for (const e of readdirSync(p)) walk(join(p, e), rel ? `${rel}/${e}` : e);
      } else if (st.isFile() && /\.(md|yml|yaml|json)$/.test(p)) {
        out.push(p);
      }
    } catch { /* skip */ }
  };
  for (const root of MARKDOWN_GLOB) {
    if (statSync(join(dir, root), { throwIfNoEntry: false })) walk(join(dir, root), root);
  }
  return out;
}

/** Extract absolute URLs + relative md links from a file. */
export function extractUrls(file: string): string[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const u = m[1].replace(/[.,;:!?]+$/, "");
    if (/^https?:\/\//.test(u)) urls.push(u);
  }
  // relative markdown links: [text](./path) or [text](path.md)
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1];
    if (!/^https?:\/\//.test(target) && !target.startsWith("#") && !target.startsWith("mailto:")) {
      urls.push(target);
    }
  }
  return urls;
}

/**
 * Check all links in a repo dir. Concurrent HEADs with hard 8s timeout.
 * Local relative links are resolved against the file's dir.
 */
export async function checkLinks(dir: string, concurrency = 8): Promise<LinkCheck[]> {
  const files = collectFiles(dir);
  const checks: LinkCheck[] = [];
  const tasks: { file: string; url: string }[] = [];

  for (const f of files) {
    for (const u of extractUrls(f)) {
      const rel = relative(dir, f);
      if (/^https?:\/\//.test(u)) {
        tasks.push({ file: rel, url: u });
      } else {
        // local relative link: resolve text until '#' or '?'
        const clean = u.split(/[#?]/)[0];
        const target = join(dir, rel.split("/").slice(0, -1).join("/"), clean);
        const ok = statSync(target, { throwIfNoEntry: false })?.isFile() ?? false;
        checks.push({ url: u, file: rel, status: ok ? 200 : 404, ok, note: ok ? undefined : "local file missing" });
      }
    }
  }

  let i = 0;
  const runner = async () => {
    while (i < tasks.length) {
      const t = tasks[i++];
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(t.url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
        clearTimeout(timer);
        checks.push({ url: t.url, file: t.file, status: res.status, ok: res.status < 400, note: res.status >= 400 ? `HTTP ${res.status}` : undefined });
      } catch {
        checks.push({ url: t.url, file: t.file, status: 0, ok: false, note: "unreachable/timeout" });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, runner));
  return checks.sort((a, b) => Number(a.ok) - Number(b.ok));
}

export function formatLiveness(checks: LinkCheck[]): string {
  const ok = checks.filter((c) => c.ok).length;
  const lines = [`${ok}/${checks.length} links live.`];
  for (const c of checks.filter((c) => !c.ok)) {
    lines.push(`[BROKEN] ${c.file}: ${c.url}${c.note ? ` — ${c.note}` : ""}`);
  }
  return lines.join("\n");
}