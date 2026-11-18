/**
 * marquee/src/header.ts — generate + judge a branded hero header image.
 *
 * Uses the estate's vision-kit:
 *  - generateImage: SVG/HTML → PNG via headless chromium rasterize
 *  - visionChat:    judge the rendered PNG (qwen3.6-35b vision via FreeInference)
 *
 * Clean capability — no proprietary internals. The header is a hand-authored SVG
 * template branded with the repo name/tagline, rasterized, then vision-judged.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface HeaderOptions {
  /** Repo name (e.g. "revive") */
  name: string;
  /** One-line tagline */
  tagline: string;
  /** Output PNG path */
  out?: string;
  /** Vision-kit product root (defaults to ranch/products/vision-kit) */
  visionKitRoot?: string;
  /** chromium binary for rasterize */
  chromium?: string;
  /** Skip the vision judge */
  noJudge?: boolean;
}

export interface HeaderResult {
  png: string;
  bytes: number;
  judge?: string;
}

/** Escape text for safe SVG embedding. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Default branded hero SVG template. */
export function renderHeroSvg(name: string, tagline: string): string {
  const n = esc(name);
  const t = esc(tagline);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <text x="960" y="460" text-anchor="middle" font-family="monospace" font-size="120" font-weight="bold" fill="#e0e0e0">${n}</text>
  <text x="960" y="560" text-anchor="middle" font-family="monospace" font-size="40" fill="#00d4ff">${t}</text>
  <text x="960" y="980" text-anchor="middle" font-family="monospace" font-size="24" fill="#666">star-grade, marquee</text>
</svg>`;
}

/** Rasterize an SVG to PNG via vision-kit generateImage (chromium headless). */
export function rasterize(svg: string, out: string, visionKitRoot: string, chromium = "chromium"): { bytes: number } {
  const doc = `<!doctype html><html><head><style>*{margin:0}body{width:1920px;height:1080px;overflow:hidden}</style></head><body>${svg}</body></html>`;
  const tmp = join(resolve(visionKitRoot), "..", "..", "..", "tmp-marquee-header.html");
  writeFileSync(tmp, doc);
  const r = spawnSync(
    chromium,
    ["--headless", "--disable-gpu", "--no-sandbox", `--screenshot=${out}`, "--window-size=1920,1080", tmp],
    { encoding: "utf8" },
  );
  try { spawnSync("rm", ["-f", tmp]); } catch { /* ignore */ }
  if (r.status !== 0) throw new Error(`chromium rasterize failed: ${(r.stderr || "").slice(0, 200)}`);
  const bytes = existsSync(out) ? readFileSync(out).length : 0;
  return { bytes };
}

/** Judge a PNG via vision-kit visionChat (qwen3.6-35b vision / FreeInference). */
export function judge(png: string, visionKitRoot: string, name: string): string {
  const module = join(resolve(visionKitRoot), "src", "index.mjs");
  const script = `
import { visionChat } from ${JSON.stringify(module)};
const j = await visionChat({
  path: ${JSON.stringify(png)},
  note: 'Assess this hero banner for the repo ${JSON.stringify(name)}. Clear, on-brand (dark blue tech), conveys the product. Rate 1-10.',
  max_tokens: 250,
});
console.log(j);
`;
  const r = spawnSync("bun", ["-e", script], { encoding: "utf8", env: process.env });
  return (r.stdout || "").trim() || (r.stderr || "").trim();
}

/**
 * Generate a branded hero PNG for a repo and judge it. Returns paths + judge text.
 */
export function generateHeader(opts: HeaderOptions): HeaderResult {
  const visionKitRoot = opts.visionKitRoot ?? "/home/toxic/pens/ranch/products/vision-kit";
  const out = opts.out ?? `${opts.name}-hero.png`;
  const svg = renderHeroSvg(opts.name, opts.tagline);
  const { bytes } = rasterize(svg, out, visionKitRoot, opts.chromium);
  const judgeText = opts.noJudge ? undefined : judge(out, visionKitRoot, opts.name);
  return { png: out, bytes, judge: judgeText };
}