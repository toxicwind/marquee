// targets.ts — lapidary rename target routing.
// Resolves rename targets (file(s), folder(s), or git repo(s)) into a list of
// `{ rel, full }` file entries to process, plus the journal/commit root.
// Supports: multiple targets, a max walk depth, and ignore-folder patterns.
import * as fs from "node:fs";
import * as path from "node:path";
import { listAllFiles, isSymlink } from "../core.ts";

export type RenameTarget = {
	/** Root used for the undo journal + rename.map + git commit. */
	root: string;
	/** Files to process, relative to `root`. */
	files: Array<{ rel: string; full: string }>;
	/** Human label for the target kind. */
	kind: "file" | "folder" | "repo";
};

export type TargetOptions = {
	/** Max directory depth to descend (undefined = unlimited). */
	depth?: number;
	/** Folder names/globs to skip entirely (e.g. node_modules, dist). */
	ignore?: string[];
};

function isGitRepo(dir: string): boolean {
	try {
		return fs.existsSync(path.join(dir, ".git"));
	} catch {
		return false;
	}
}

function shouldIgnore(rel: string, ignore: string[]): boolean {
	if (ignore.length === 0) return false;
	const parts = rel.split(/[\\/]/);
	return parts.some(part => ignore.some(pat => part === pat || (pat.endsWith("*") && part.startsWith(pat.slice(0, -1)))));
}

function walkFolder(root: string, opts: TargetOptions): Array<{ rel: string; full: string }> {
	const out: Array<{ rel: string; full: string }> = [];
	const stack: Array<{ rel: string; depth: number }> = [{ rel: "", depth: 0 }];
	while (stack.length) {
		const { rel, depth } = stack.pop()!;
		const abs = path.join(root, rel);
		let entries: fs.Dirent[];
		try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { continue; }
		for (const e of entries) {
			const childRel = rel ? path.join(rel, e.name) : e.name;
			if (e.isDirectory()) {
				if (shouldIgnore(childRel, opts.ignore ?? [])) continue;
				if (opts.depth !== undefined && depth + 1 > opts.depth) continue;
				stack.push({ rel: childRel, depth: depth + 1 });
			} else if (e.isFile() || e.isSymbolicLink()) {
				out.push({ rel: childRel, full: path.join(root, childRel) });
			}
		}
	}
	return out;
}

/** Route a rename target by what it actually is: file, folder, or repo. */
export function resolveTarget(target: string, opts: TargetOptions = {}): RenameTarget {
	const stat = fs.statSync(target);
	if (stat.isFile()) {
		return {
			root: path.dirname(target),
			files: [{ rel: path.basename(target), full: target }],
			kind: "file",
		};
	}
	if (stat.isDirectory()) {
		if (isGitRepo(target)) {
			// Git repo: use tracked+untracked list, then apply depth/ignore filters.
			const files = listAllFiles(target)
				.filter((rel: string) => !isSymlink(target, rel))
				.filter((rel: string) => {
					if (opts.depth !== undefined && rel.split(/[\\/]/).length - 1 > opts.depth) return false;
					return !shouldIgnore(rel, opts.ignore ?? []);
				})
				.map((rel: string) => ({ rel, full: path.join(target, rel) }));
			return { root: target, files, kind: "repo" };
		}
		// Plain folder: walk it (no git), honoring depth + ignore.
		const files = walkFolder(target, opts).filter(({ rel }) => !isSymlink(target, rel));
		return { root: target, files, kind: "folder" };
	}
	throw new Error(`lapidary rename: target not found or not a file/dir: ${target}`);
}

/** Resolve multiple targets (array) into one combined RenameTarget. */
export function resolveTargets(targets: string[], opts: TargetOptions = {}): RenameTarget {
	if (targets.length === 1) return resolveTarget(targets[0], opts);
	// Multiple targets: use the first target's dir as the journal root only if
	// all targets share it; otherwise fall back to the first target's root.
	const resolved = targets.map(t => resolveTarget(t, opts));
	const roots = new Set(resolved.map(r => r.root));
	const root = roots.size === 1 ? resolved[0].root : resolved[0].root;
	const files = resolved.flatMap(r => r.files);
	const kind = resolved.every(r => r.kind === "file") ? "file" : resolved.every(r => r.kind === "repo") ? "repo" : "folder";
	return { root, files, kind };
}