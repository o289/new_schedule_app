import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPlanViewModel,
  renderPlanHtml,
  renderPlanMarkdown,
  writePlanRun,
} from "./plan-render";

const input = {
  schemaVersion: 2,
  planId: "render-plan",
  runId: "run-render",
  objective: "<script>alert(1)</script>",
  assumptions: [],
  openDecisions: [],
  phases: [
    {
      id: "phase-1",
      name: "render",
      objective: "確認",
      allowedPaths: ["tools/**"],
      qualityGates: ["unit"],
      acceptanceCriteria: ["ok"],
      stopConditions: ["fail"],
    },
  ],
  allowedPaths: ["tools/**"],
  forbiddenPaths: [".git/**", ".env*", "docs/agent-runs/**"],
  apiChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "api-description",
      method: "POST",
      path: "/api/unique",
      request: "api-request",
      response: "api-response",
      compatibility: "backward-compatible",
    },
  ],
  dbChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "none",
      model: "none",
      migration: "none",
      dataImpact: "none",
      rollback: "none",
    },
  ],
  dependencyChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "none",
      name: "none",
      version: "none",
      reason: "none",
      license: "none",
    },
  ],
  permissionChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "none",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  secretChanges: [
    {
      status: "NOT_APPLICABLE",
      description: "none",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  externalSideEffects: [
    {
      status: "NOT_APPLICABLE",
      description: "none",
      target: "none",
      boundary: "none",
      mitigation: "none",
    },
  ],
  qualityGates: ["unit"],
  failurePolicy: "stop",
  limits: { maxRetries: 3, maxDurationMinutes: 120, maxCostYen: 0 },
  branch: { source: "feature/v3.2.3", worktree: "run", mode: "push_only" },
  acceptanceCriteria: ["ok"],
};

const detailedInput = {
  ...input,
  dbChanges: [
    {
      ...input.dbChanges[0],
      description: "db-description",
      model: "db-model",
      migration: "db-migration",
      dataImpact: "db-impact",
      rollback: "db-rollback",
    },
  ],
  dependencyChanges: [
    {
      ...input.dependencyChanges[0],
      description: "dependency-description",
      name: "zod",
      version: "4.4.3",
      reason: "validation",
      license: "MIT",
    },
  ],
  permissionChanges: [
    {
      ...input.permissionChanges[0],
      description: "permission-description",
      target: "runner",
      boundary: "local-only",
      mitigation: "allowlist",
    },
  ],
  secretChanges: [
    {
      ...input.secretChanges[0],
      description: "secret-description",
      target: "credential",
      boundary: "process-env",
      mitigation: "redaction",
    },
  ],
  externalSideEffects: [
    {
      ...input.externalSideEffects[0],
      description: "external-description",
      target: "network",
      boundary: "disabled",
      mitigation: "deny",
    },
  ],
};

describe("plan renderer", () => {
  it("renders the same identity in HTML and Markdown and escapes HTML", () => {
    const view = createPlanViewModel(input);
    const html = renderPlanHtml(view);
    const markdown = renderPlanMarkdown(view);
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
    expect(html).toContain(view.planHash);
    expect(markdown).toContain(view.planHash);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("../../styles/documentation.css");
    expect(markdown).toContain("phase-1");
    for (const value of [
      "api-description",
      "POST",
      "/api/unique",
      "api-request",
      "api-response",
      "backward-compatible",
      "feature/v3.2.3",
      "run",
      "push_only",
      "120",
      "0",
      "stop",
      "ok",
    ]) {
      expect(html).toContain(value);
      expect(markdown).toContain(value);
    }
  });

  it("writes three artifacts and an exclusive completion manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-plan-"));
    const runDirectory = await writePlanRun(input, root);
    expect(await readFile(join(runDirectory, "plan.json"), "utf8")).toContain(
      input.planId,
    );
    expect(
      await readFile(join(runDirectory, "plan-review.html"), "utf8"),
    ).toContain("planHash");
    expect(
      await readFile(join(runDirectory, "agent-plan.md"), "utf8"),
    ).toContain("API changes");
    const manifest = JSON.parse(
      await readFile(join(runDirectory, "manifest.json"), "utf8"),
    ) as { artifacts: string[]; planHash: string };
    expect(manifest.artifacts).toEqual([
      "plan.json",
      "plan-review.html",
      "agent-plan.md",
    ]);
    expect(manifest.planHash).toBe(createPlanViewModel(input).planHash);
    await expect(writePlanRun(input, root)).rejects.toThrow();
  });

  it("keeps representative values for every inventory category in both views", () => {
    const view = createPlanViewModel(detailedInput);
    const html = renderPlanHtml(view);
    const markdown = renderPlanMarkdown(view);
    for (const value of [
      "db-model",
      "db-migration",
      "db-impact",
      "db-rollback",
      "zod",
      "4.4.3",
      "validation",
      "MIT",
      "runner",
      "local-only",
      "allowlist",
      "credential",
      "process-env",
      "redaction",
      "network",
      "disabled",
      "deny",
    ]) {
      expect(html).toContain(value);
      expect(markdown).toContain(value);
    }
  });

  it("shows NOT_APPLICABLE presentation without mutating empty JSON lists", () => {
    const empty = {
      ...input,
      apiChanges: [],
      dbChanges: [],
      dependencyChanges: [],
      permissionChanges: [],
      secretChanges: [],
      externalSideEffects: [],
    };
    const view = createPlanViewModel(empty);
    expect(view.plan.apiChanges).toEqual([]);
    expect(renderPlanHtml(view)).toContain("NOT_APPLICABLE: 変更なし");
    expect(renderPlanMarkdown(view)).toContain("NOT_APPLICABLE: 変更なし");
  });
});
