import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectMarkdownFiles,
  collectWorkflowDocumentFiles,
} from "./check-project-rules";

const fixtureRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "project-rules-"));
  fixtureRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("workflow document file discovery", () => {
  it("recursively includes nested instruction Markdown files", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, ".agents/instructions/tasks"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "入口");
    writeFileSync(join(root, ".agents/instructions/AGENTS-DETAILS.md"), "共通");
    writeFileSync(join(root, ".agents/instructions/tasks/01.md"), "task");

    expect(
      collectMarkdownFiles(join(root, ".agents/instructions")),
    ).toHaveLength(2);
    expect(collectWorkflowDocumentFiles(root)).toEqual(
      expect.arrayContaining([
        join(root, "AGENTS.md"),
        join(root, ".agents/instructions/tasks/01.md"),
      ]),
    );
  });

  it("treats codx README as optional but AGENTS and instructions as required", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, ".agents/instructions"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "入口");

    expect(collectWorkflowDocumentFiles(root)).not.toContain(
      join(root, "codx/README.md"),
    );
    expect(() => collectWorkflowDocumentFiles(join(root, "missing"))).toThrow();

    const missingAgentsRoot = fixtureRoot();
    mkdirSync(join(missingAgentsRoot, ".agents/instructions"), {
      recursive: true,
    });
    expect(() => collectWorkflowDocumentFiles(missingAgentsRoot)).toThrow();

    const missingInstructionsRoot = fixtureRoot();
    writeFileSync(join(missingInstructionsRoot, "AGENTS.md"), "入口");
    expect(() =>
      collectWorkflowDocumentFiles(missingInstructionsRoot),
    ).toThrow();
  });
});
