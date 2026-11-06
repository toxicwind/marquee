import { describe, expect, test } from "bun:test";
import { renderReadme } from "../src/readme.ts";

const base = {
  name: "demo",
  repoUrl: "https://github.com/toxicwind/demo",
  tagline: "A simple tool for everyone.",
  installCommand: "bun install",
  license: "MIT",
};

describe("readme renderer", () => {
  test("renders badges, tagline, quickstart, roadmap, star CTA", () => {
    const md = renderReadme({ ...base, roadmap: [{ done: true, label: "First release" }] });
    expect(md).toContain("img.shields.io");
    expect(md).toContain("A simple tool for everyone.");
    expect(md).toContain("bun install");
    expect(md).toContain("## Roadmap");
    expect(md).toContain("[x] First release");
    expect(md).toContain("Don't forget to give the project a star");
    expect(md).toContain("MIT License");
  });

  test("demo block appears above features when provided", () => {
    const md = renderReadme({ ...base, demo: "![demo](demo.gif)" });
    const demoIdx = md.indexOf("## Demo");
    const featuresIdx = md.indexOf("## Features");
    expect(demoIdx).toBeGreaterThan(-1);
    expect(featuresIdx).toBeGreaterThan(demoIdx);
  });

  test("custom badges override default row", () => {
    const md = renderReadme({ ...base, badges: "[![custom](https://img.shields.io/badge/custom-yes-blue)]" });
    expect(md).toContain("custom-yes-blue");
    expect(md).not.toContain("Licnese");
  });

  test("acknowledgments render when given", () => {
    const md = renderReadme({
      ...base,
      acknowledgments: { "Best-README-Template": "othneildrew/othneildrew/Best-README-Template" },
    });
    expect(md).toContain("## Contact & Acknowledgments");
    expect(md).toContain("Best-README-Template");
  });
});