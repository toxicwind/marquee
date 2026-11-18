// config.ts — lapidary configuration.
// Lapidary is a standalone transform engine that works on ANY ecosystem. An
// optional config file makes it "specific enough for here" (the pens estate):
// the pens root, pens layout, prune list, and MCP/HTTP/web ports. Without a
// config, lapidary is fully generic (any target path, no pens assumptions).
import * as fs from "node:fs";
import * as path from "node:path";

export interface LapidaryConfig {
	/** Pens root (e.g. /home/toxic/pens). undefined = generic mode. */
	root?: string;
	/** Pens layout: how products live under root (e.g. "{pen}/products/{product}"). */
	pensLayout?: string;
	/** Directory names pruned from walks. */
	prune: string[];
	/** HTTP API port. */
	httpPort: number;
	/** Web app dev port. */
	webPort: number;
	/** MCP server name (for thresher registration). */
	mcpName: string;
}

const DEFAULT_PRUNE = [
	"node_modules", ".git", ".jj", "target", "dist", "build", "out",
	"runs", "blobs", "sessions", "installs", "cache", ".cache",
	"__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache",
	".turbo", ".corral", ".smithers", ".bun", ".npm", ".yarn", ".cargo",
	".rustup", ".local", ".config", ".ssh", ".gnupg", ".mise", ".kilo",
	".ffs", ".gh-search-cache", ".openfang", ".tau", ".claude", ".codex",
	".vscode", ".vscode-insiders", "archive", "backups",
];

const DEFAULTS: LapidaryConfig = {
	prune: DEFAULT_PRUNE,
	httpPort: 25220,
	webPort: 5174,
	mcpName: "lapidary",
};

const CONFIG_CANDIDATES = [
	process.env.LAPIDARY_CONFIG,
	path.join(process.cwd(), "lapidary.config.json"),
	path.join(process.cwd(), "lapidary.config.toml"),
	path.join(process.env.HOME ?? "/home/toxic", ".config", "lapidary", "config.json"),
];

function loadJson(p: string): Partial<LapidaryConfig> | null {
	try {
		return JSON.parse(fs.readFileSync(p, "utf8")) as Partial<LapidaryConfig>;
	} catch {
		return null;
	}
}

function loadToml(p: string): Partial<LapidaryConfig> | null {
	// Minimal TOML subset: `key = value` / `key = "value"` / arrays.
	try {
		const raw = fs.readFileSync(p, "utf8");
		const out: Record<string, unknown> = {};
		for (const line of raw.split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#") || t.startsWith("[")) continue;
			const eq = t.indexOf("=");
			if (eq < 0) continue;
			const key = t.slice(0, eq).trim();
			let val: unknown = t.slice(eq + 1).trim();
			if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
			else if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) val = val.slice(1, -1).split(",").map(s => s.trim().replace(/^"|"$/g, ""));
			else if (typeof val === "string" && /^\d+$/.test(val)) val = Number(val);
			out[key] = val;
		}
		return out as Partial<LapidaryConfig>;
	} catch {
		return null;
	}
}

let cached: LapidaryConfig | null = null;

/** Load config (cached). Returns defaults when no config file is found. */
export function loadConfig(): LapidaryConfig {
	if (cached) return cached;
	let merged: Partial<LapidaryConfig> = {};
	for (const cand of CONFIG_CANDIDATES) {
		if (!cand || !fs.existsSync(cand)) continue;
		const parsed = cand.endsWith(".toml") ? loadToml(cand) : loadJson(cand);
		if (parsed) merged = { ...merged, ...parsed };
	}
	cached = { ...DEFAULTS, ...merged };
	return cached;
}

/** True when a config file exists (pens-aware mode). */
export function hasConfig(): boolean {
	return CONFIG_CANDIDATES.some(c => c && fs.existsSync(c));
}

/** Resolve a product path under the pens root using the pens layout. */
export function productPath(pen: string, product: string): string | null {
	const cfg = loadConfig();
	if (!cfg.root || !cfg.pensLayout) return null;
	return cfg.pensLayout
		.replace("{pen}", pen)
		.replace("{product}", product)
		.split("/")
		.reduce((acc, seg) => path.join(acc, seg), cfg.root);
}