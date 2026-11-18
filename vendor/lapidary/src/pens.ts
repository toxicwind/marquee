// pens.ts — pens-aware lapidary operations (move / retire / merge).
// These build on the generic core but understand the pens layout from config.
// Only available when a config file defines root + pensLayout (generic mode
// has no pens assumptions). All use the shared rewriteEngine for ref rewrites.
import * as fs from "node:fs";
import * as path from "node:path";
import { rewriteEngine, walkPens, journalRun, rule } from "./core.ts";
import { loadConfig, productPath } from "./config.ts";

/** Move a product between pens: physically move + rewrite refs + verify. */
export function moveProduct(product: string, fromPen: string, toPen: string, dryRun = false): void {
	const cfg = loadConfig();
	if (!cfg.root || !cfg.pensLayout) throw new Error("move requires a pens config (root + pensLayout)");
	const root = cfg.root;
	const fromPath = productPath(fromPen, product)!;
	const toPath = productPath(toPen, product)!;
	if (!fs.existsSync(fromPath)) throw new Error(`source not found: ${fromPath}`);
	if (fs.existsSync(toPath)) throw new Error(`destination exists: ${toPath}`);
	console.log(`[move] ${product}: ${fromPath} -> ${toPath}`);
	if (!dryRun) { fs.mkdirSync(path.dirname(toPath), { recursive: true }); fs.renameSync(fromPath, toPath); }

	const rules = [
		rule("substr", `pens/${fromPen}/products/${product}`, `pens/${toPen}/products/${product}`),
		rule("substr", `pens/${fromPen}/products/${product}/`, `pens/${toPen}/products/${product}/`),
		rule("substr", `/${fromPen}/products/${product}`, `/${toPen}/products/${product}`),
	];
	const undoPath = path.join(root, ".lapidary-undo.jsonl");
	const files = walkPens(root)
		.filter((rel: string) => !rel.startsWith(`${toPen}/products/${product}/`))
		.map((rel: string) => ({ rel, full: path.join(root, rel) }));
	const outcome = rewriteEngine({ files, rules, undoPath, dryRun });
	console.log(`[move] edits=${outcome.edits} files=${outcome.files}${dryRun ? " (dry-run)" : ""}`);
	journalRun({ mode: dryRun ? "move-pen-dry" : "move-pen", repo: root, edits: outcome.edits, files: outcome.files });
}

/** Retire a whole pen into another: move products/docs/ssot + rewrite refs. */
export function retirePen(oldPen: string, targetPen: string, dryRun = false, deleteRepo = false): void {
	const cfg = loadConfig();
	if (!cfg.root) throw new Error("retire requires a pens config (root)");
	const root = cfg.root;
	const oldPath = path.join(root, oldPen);
	const targetPath = path.join(root, targetPen);
	if (!fs.existsSync(oldPath)) throw new Error(`source pen not found: ${oldPath}`);
	if (!fs.existsSync(targetPath)) throw new Error(`target pen not found: ${targetPath}`);
	console.log(`[retire] ${oldPen} -> ${targetPen}...`);

	// 1. move products
	const oldProducts = path.join(oldPath, "products");
	const targetProducts = path.join(targetPath, "products");
	if (fs.existsSync(oldProducts)) {
		fs.mkdirSync(targetProducts, { recursive: true });
		for (const prod of fs.readdirSync(oldProducts)) {
			const src = path.join(oldProducts, prod);
			const dst = path.join(targetProducts, prod);
			if (!fs.existsSync(dst)) { console.log(`  moving product: ${prod}`); if (!dryRun) fs.renameSync(src, dst); }
		}
	}
	// 2. move docs + metadata
	for (const item of ["docs", "ssot", "products.registry.json", "CHANGELOG.md"]) {
		const src = path.join(oldPath, item);
		const dst = path.join(targetPath, item);
		if (fs.existsSync(src) && !fs.existsSync(dst)) { console.log(`  moving: ${item}`); if (!dryRun) fs.renameSync(src, dst); }
	}

	// 3. rewrite refs
	const rules = [
		rule("word", oldPen, targetPen),
		rule("word", oldPen.charAt(0).toUpperCase() + oldPen.slice(1), targetPen.charAt(0).toUpperCase() + targetPen.slice(1)),
		rule("word", oldPen.toUpperCase(), targetPen.toUpperCase()),
		rule("substr", `pens/${oldPen}`, `pens/${targetPen}`),
		rule("substr", `/pens/${oldPen}`, `/pens/${targetPen}`),
	];
	const undoPath = path.join(root, ".lapidary-undo.jsonl");
	const files = walkPens(root)
		.filter((rel: string) => !rel.startsWith(`${oldPen}/`))
		.map((rel: string) => ({ rel, full: path.join(root, rel) }));
	const outcome = rewriteEngine({ files, rules, undoPath, dryRun });
	console.log(`[retire] edits=${outcome.edits} files=${outcome.files}${dryRun ? " (dry-run)" : ""}`);
	if (deleteRepo && !dryRun) { console.log(`[retire] removing ${oldPath}`); fs.rmSync(oldPath, { recursive: true, force: true }); }
	journalRun({ mode: dryRun ? "retire-dry" : "retire", repo: root, edits: outcome.edits, files: outcome.files });
}

/** Merge one folder's content into another: full move + symlink + ref rewrite. */
export function mergeInto(fromPath: string, intoPath: string, dryRun = false): void {
	const cfg = loadConfig();
	if (!cfg.root) throw new Error("merge requires a pens config (root)");
	const root = cfg.root;
	if (!fs.existsSync(fromPath)) throw new Error(`source not found: ${fromPath}`);
	if (!fs.existsSync(intoPath)) throw new Error(`target not found: ${intoPath}`);
	const fromProduct = path.basename(fromPath);
	const intoProduct = path.basename(intoPath);
	console.log(`[merge] ${fromPath} -> ${intoPath}`);

	// 1. full move
	let moved = 0;
	for (const entry of fs.readdirSync(fromPath)) {
		const src = path.join(fromPath, entry);
		const dst = path.join(intoPath, entry);
		if (fs.existsSync(dst)) {
			if (!dryRun) {
				if (fs.statSync(src).isDirectory() && fs.statSync(dst).isDirectory()) {
					for (const sub of fs.readdirSync(src)) fs.renameSync(path.join(src, sub), path.join(dst, sub));
					fs.rmSync(src, { recursive: true, force: true });
				} else { fs.rmSync(dst, { recursive: true, force: true }); fs.renameSync(src, dst); }
			}
		} else if (!dryRun) fs.renameSync(src, dst);
		moved++;
	}
	// 2. continuity symlink
	if (!dryRun) { fs.rmSync(fromPath, { recursive: true, force: true }); fs.symlinkSync(intoProduct, fromPath); }

	// 3. rewrite refs
	const rules = [
		rule("substr", `products/${fromProduct}/`, `products/${intoProduct}/`),
		rule("substr", `products/${fromProduct}`, `products/${intoProduct}`),
		rule("substr", `/products/${fromProduct}/`, `/products/${intoProduct}/`),
		rule("substr", `/products/${fromProduct}`, `/products/${intoProduct}`),
	];
	const undoPath = path.join(root, ".lapidary-undo.jsonl");
	const files = walkPens(root)
		.filter((rel: string) => !rel.startsWith(`products/${intoProduct}/`))
		.map((rel: string) => ({ rel, full: path.join(root, rel) }));
	const outcome = rewriteEngine({ files, rules, undoPath, dryRun });
	console.log(`[merge] moved=${moved} edits=${outcome.edits} files=${outcome.files}${dryRun ? " (dry-run)" : ""}`);
	journalRun({ mode: dryRun ? "merge-dry" : "merge", repo: root, edits: outcome.edits, files: outcome.files });
}