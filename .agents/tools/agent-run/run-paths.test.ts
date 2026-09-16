import { describe, expect, it } from "vitest";
import { assertRunPath, runPaths } from "./run-paths";

describe("run paths", () => {
  it("keeps durable artifacts and runtime evidence in one run namespace", () => {
    const a = runPaths("run-001");
    const b = runPaths("run-002");
    expect(a.review).toBe("human/runs/run-001/plan-review.html");
    expect(a.planSource).toBe("ai/runs/run-001/plan.source.json");
    expect(a.plan).toBe("ai/runs/run-001/plan.json");
    expect(a.approval).toBe("ai/runs/run-001/approval.json");
    expect(a.start).toBe("ai/runs/run-001/start.json");
    expect(a.manifest).toBe("ai/runs/run-001/manifest.json");
    expect(a.events).toBe(".agent-runs/run-001/events.jsonl");
    expect(a.evidence).toBe(".agent-runs/run-001/evidence");
    expect(a.worktree).toBe(".agent-runs/worktrees/run-001");
    expect(a.marker).toBe(
      ".agent-runs/worktrees/run-001/.agent-run-marker.json",
    );
    expect(a.plan).not.toBe(b.plan);
    expect(a.events).not.toBe(b.events);
  });

  it.each(["Run-001", "run_001", "run/001", "../run-001", "run--001"])(
    "rejects unsafe run id %s",
    (runId) => expect(() => runPaths(runId)).toThrow(),
  );

  it("rejects paths outside the run namespace", () => {
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-002/plan.json"),
    ).toThrow();
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-0012/plan.json"),
    ).toThrow();
    expect(() =>
      assertRunPath("run-001", "docs/pr-agent-start-record.json"),
    ).toThrow();
    expect(() =>
      assertRunPath("run-001", "docs/agent-runs/run-001/plan.json"),
    ).toThrow();
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-001/../run-002/plan.json"),
    ).toThrow();
    expect(() =>
      assertRunPath("run-001", "human/runs/run-001/plan-review.html"),
    ).not.toThrow();
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-001/plan.json"),
    ).not.toThrow();
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-001/approval.json"),
    ).not.toThrow();
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-001/start.json"),
    ).not.toThrow();
    expect(() =>
      assertRunPath("run-001", "ai/runs/run-001/manifest.json"),
    ).not.toThrow();
    expect(() =>
      assertRunPath("run-001", ".agent-runs/run-001/events.jsonl"),
    ).not.toThrow();
    expect(() =>
      assertRunPath("run-001", ".agent-runs/run-001/evidence/report.json"),
    ).not.toThrow();
    expect(() =>
      assertRunPath(
        "run-001",
        ".agent-runs/worktrees/run-001/.agent-run-marker.json",
      ),
    ).not.toThrow();
  });
});
