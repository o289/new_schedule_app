import { z } from "zod";

/** Canonical identifier used to keep every run inside its own directory. */
export const runIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function runPaths(runId: string) {
  const id = runIdSchema.parse(runId);
  return {
    runId: id,
    human: `human/runs/${id}`,
    ai: `ai/runs/${id}`,
    runtime: `.agent-runs/${id}`,
    worktree: `.agent-runs/worktrees/${id}`,
    marker: `.agent-runs/worktrees/${id}/.agent-run-marker.json`,
    review: `human/runs/${id}/plan-review.html`,
    planSource: `ai/runs/${id}/plan.source.json`,
    plan: `ai/runs/${id}/plan.json`,
    approval: `ai/runs/${id}/approval.json`,
    start: `ai/runs/${id}/start.json`,
    manifest: `ai/runs/${id}/manifest.json`,
    events: `.agent-runs/${id}/events.jsonl`,
    evidence: `.agent-runs/${id}/evidence`,
  } as const;
}

export function assertRunPath(runId: string, path: string): void {
  const paths = runPaths(runId);
  const roots = [paths.human, paths.ai, paths.runtime, paths.worktree];
  if (
    path.split("/").includes("..") ||
    !roots.some((root) => path.startsWith(`${root}/`))
  ) {
    throw new Error("run専用pathが不正です");
  }
}
