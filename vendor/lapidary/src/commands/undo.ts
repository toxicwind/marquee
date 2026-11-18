// undo.ts — `lapidary undo <root>`
// Rolls back the last rewrite from a target's undo journal (.lapidary-undo.jsonl).
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export function run(args: string[]): void {
	const root = args[0];
	if (!root) { console.error("lapidary undo: <root> required"); process.exit(2); }
	const undoPath = path.join(root, ".lapidary-undo.jsonl");
	if (!fs.existsSync(undoPath)) { console.error(`lapidary undo: no undo journal at ${undoPath}`); process.exit(1); }
	const entries = fs.readFileSync(undoPath, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
	let undone = 0;
	for (const entry of entries.reverse() as Array<{ file: string; before: string; hash: string }>) {
		const full = path.join(root, entry.file);
		try {
			const current = fs.readFileSync(full, "utf8");
			if (createHash("sha256").update(current).digest("hex") === entry.hash) {
				fs.writeFileSync(full, entry.before); undone++;
				console.log(`undone: ${entry.file}`);
			} else console.log(`skip (changed since): ${entry.file}`);
		} catch { console.log(`skip (missing): ${entry.file}`); }
	}
	console.log(`undone ${undone} file(s)`);
}