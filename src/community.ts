/**
 * marquee community — friction-remover files per community-files.md.
 * CONTRIBUTING.md (short), Contributor Covenant CoC, issue templates (bug+feature+config),
 * PR template (<15 lines), SECURITY.md, FUNDING.yml (optional).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CommunityConfig {
  /** package manager, e.g. "bun install" */
  installCommand: string;
  /** test command, e.g. "bun test" */
  testCommand: string;
  /** security-adjacent project → SECURITY.md required */
  securityAdjacent?: boolean;
  /** funding: sponsor URL or empty to skip FUNDING.yml */
  fundingUrl?: string;
  /** repo URL for links */
  repoUrl?: string;
}

const CONTRIBUTING = (c: CommunityConfig) => `# Contributing

Thanks for considering a contribution! Keep it simple.

## Setup

\`\`\`bash
${c.installCommand}
\`\`\`

## Tests

\`\`\`bash
${c.testCommand}
\`\`\`

## PR process

1. Branch off \`main\`, keep changes focused.
2. Add a test for any behavior change.
3. Green checks: \`${c.testCommand}\` + typecheck.
4. Fill in the PR template — one paragraph on what and why.
5. CI green = merge.

## Structure

Keep it boring: small modules, clear names, no premature abstraction.
`;

const COC = `# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, religion, or sexual identity and
orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment:

* Demonstrating empathy and kindness toward other people
* Being respectful of differing opinions, viewpoints, and experiences
* Giving and gracefully accepting constructive feedback
* Accepting responsibility and apologizing to those affected by our mistakes
* Focusing on what is best not just for us as individuals, but for the overall community

Examples of unacceptable behavior:

* The use of sexualized language or imagery, and sexual attention or advances
* Trolling, insulting or derogatory comments, and personal or political attacks
* Public or private harassment
* Publishing others' private information without explicit permission
* Other conduct which could reasonably be considered inappropriate in a professional setting

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the community leaders responsible for enforcement. All complaints
will be reviewed and investigated promptly and fairly.

This Code of Conduct is adapted from the [Contributor Covenant][homepage],
version 2.1, available at https://www.contributor-covenant.org/version/2/1/code_of_conduct.html.

[homepage]: https://www.contributor-covenant.org
`;

const BUG_TEMPLATE = `name: Bug report
about: Create a report to help us improve
title: "[bug] "
labels: bug
body:
  - type: textarea
    id: what
    attributes:
      label: What happened?
      description: A clear description of the bug.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: What should have happened?
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Reproduction
      description: Minimal code/commands to reproduce.
    validations:
      required: true
  - type: textarea
    id: env
    attributes:
      label: Environment
      description: Runtime, version, OS.
    validations:
      required: false
`;

const FEATURE_TEMPLATE = `name: Feature request
about: Suggest an idea for this project
title: "[feat] "
labels: enhancement
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem statement
      description: What need does this address?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How should it work?
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: What else did you think about?
    validations:
      required: false
`;

const ISSUE_CONFIG = (repoUrl?: string) => `blank_issues_enabled: false
contact_links:
  - name: Discussions
    url: ${repoUrl ? `${repoUrl}/discussions` : "https://github.com/"}
    about: Ask questions and share ideas here.
`;

const PR_TEMPLATE = `## What does this PR do?

One paragraph.

## Why?

Concrete motivation; link issues if relevant.

## Checks

- [ ] Tests pass
- [ ] Typecheck clean
- [ ] Docs/CHANGELOG updated where needed
`;

const SECURITY = `# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities. Report privately:

- Open a [private security advisory](https://github.com/OWNER/REPO/security/advisories/new)
  (replace OWNER/REPO with the actual repo), or
- Email the maintainer(s) directly.

Please include the affected version, a minimal reproduction, and impact.

## Supported versions

The latest release on \`main\` is supported. Backports happen on request for
security fixes.
`;

/** Write all community files into the repo dir. Returns created paths. */
export function writeCommunity(dir: string, cfg: CommunityConfig): string[] {
  const created: string[] = [];
  const write = (p: string, content: string) => {
    const abs = join(dir, p);
    if (p.includes("/")) mkdirSync(join(dir, p.split("/").slice(0, -1).join("/")), { recursive: true });
    if (!existsSync(abs)) {
      writeFileSync(abs, content, "utf8");
      created.push(p);
    }
  };
  write("CONTRIBUTING.md", CONTRIBUTING(cfg));
  write("CODE_OF_CONDUCT.md", COC);
  write(".github/ISSUE_TEMPLATE/bug_report.yml", BUG_TEMPLATE);
  write(".github/ISSUE_TEMPLATE/feature_request.yml", FEATURE_TEMPLATE);
  write(".github/ISSUE_TEMPLATE/config.yml", ISSUE_CONFIG(cfg.repoUrl));
  write(".github/PULL_REQUEST_TEMPLATE.md", PR_TEMPLATE);
  if (cfg.securityAdjacent) {
    const sec = SECURITY.replace("OWNER/REPO", cfg.repoUrl?.replace(/^https?:\/\/github\.com\//, "") ?? "OWNER/REPO");
    write("SECURITY.md", sec);
  }
  if (cfg.fundingUrl) {
    write(".github/FUNDING.yml", `${cfg.fundingUrl.startsWith("https://github.com/sponsors/") ? "github:" : "custom:"} ${cfg.fundingUrl}\n`);
  }
  return created;
}