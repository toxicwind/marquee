/**
 * marquee ci — GitHub Actions workflow generator.
 * Detects the toolchain from the repo (bun/node/python) and emits a green-badge-ready
 * build+test workflow. Pattern credit: GitHub Actions starter workflows.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Toolchain = "bun" | "node" | "python" | "rust" | "go" | "generic";

export function detectToolchain(dir: string): Toolchain {
  if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bunfig.toml")) || (existsSync(join(dir, "package.json")) && hasScript(dir, "bun"))) return "bun";
  if (existsSync(join(dir, "package-lock.json")) || existsSync(join(dir, "yarn.lock")) || existsSync(join(dir, "pnpm-lock.yaml")) || existsSync(join(dir, "package.json"))) return "node";
  if (existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "setup.py"))) return "python";
  if (existsSync(join(dir, "Cargo.toml"))) return "rust";
  if (existsSync(join(dir, "go.mod"))) return "go";
  return "generic";
}

function hasScript(dir: string, needle: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    return Object.values(pkg.scripts ?? {}).some((s) => s.includes(needle));
  } catch {
    return false;
  }
}

const WORKFLOWS: Record<Toolchain, string> = {
  bun: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bun x tsc --noEmit
`,
  node: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
`,
  python: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -e ".[dev]"
      - run: pytest
`,
  rust: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --all-features
      - run: cargo clippy -- -D warnings
`,
  go: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"
      - run: go test ./...
      - run: go vet ./...
`,
  generic: `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Add your build+test steps here — see marquee ci --lang <bun|node|python|rust|go>"
`,
};

/** Write .github/workflows/ci.yml unless it exists. Returns created path or null. */
export function writeCi(dir: string, lang?: Toolchain): string | null {
  const tc = lang ?? detectToolchain(dir);
  const abs = join(dir, ".github/workflows/ci.yml");
  if (existsSync(abs)) return null;
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(abs, WORKFLOWS[tc], "utf8");
  return abs;
}

/** shields.io CI badge for the repo (green once CI is green). */
export function ciBadge(slug: string): string {
  return `[![CI](https://img.shields.io/github/actions/workflow/status/${slug}/ci.yml?style=for-the-badge&label=CI)](${slug}/actions)`;
}

export function formatCi(tc: Toolchain): string {
  return `Detected toolchain: ${tc}\n${WORKFLOWS[tc]}`;
}