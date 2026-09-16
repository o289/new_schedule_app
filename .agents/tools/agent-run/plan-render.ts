import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hashPlan, normalizePlan } from "./plan-hash";
import { parsePlan, type Plan } from "./plan-schema";

export interface PlanViewModel {
  plan: Plan;
  planHash: string;
}

export function validateCliInvocation(
  args: string[],
  cwd: string,
  root: string,
): void {
  if (args.length !== 0) throw new Error("STOP: 引数は受け付けません");
  if (cwd !== root)
    throw new Error("STOP: repository rootから実行してください");
}
type Entry = Record<string, string>;

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
const htmlList = (values: string[]): string =>
  values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
const htmlEntries = (entries: Entry[]): string =>
  `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${entries
    .map((entry) =>
      Object.entries(entry)
        .map(
          ([key, value]) =>
            `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`,
        )
        .join(""),
    )
    .join("")}</tbody></table></div>`;
const markdownEntries = (entries: Entry[]): string[] =>
  entries.flatMap((entry) =>
    Object.entries(entry).map(([key, value]) => `- ${key}: ${value}`),
  );
const displayChanges = (entries: Entry[]): Entry[] =>
  entries.length > 0
    ? entries
    : [{ status: "NOT_APPLICABLE", description: "NOT_APPLICABLE: 変更なし" }];

export function createPlanViewModel(input: unknown): PlanViewModel {
  const plan = parsePlan(input);
  return { plan, planHash: hashPlan(plan) };
}

export function renderPlanHtml(view: PlanViewModel): string {
  const { plan, planHash } = view;
  const changes = (title: string, entries: Entry[]) =>
    `<section class="doc-section"><h2>${escapeHtml(title)}</h2>${htmlEntries(displayChanges(entries))}</section>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="plan-id" content="${escapeHtml(plan.planId)}"><meta name="schema-version" content="${plan.schemaVersion}"><meta name="plan-hash" content="${planHash}"><link rel="stylesheet" href="../../styles/documentation.css"><title>${escapeHtml(plan.planId)}</title></head><body><main class="doc-page"><header class="doc-hero"><h1>${escapeHtml(plan.objective)}</h1><p>planId: <code>${escapeHtml(plan.planId)}</code> / runId: <code>${escapeHtml(plan.runId)}</code> / schemaVersion: <code>${plan.schemaVersion}</code> / planHash: <code>${planHash}</code></p></header><section class="doc-section"><h2>目的・前提</h2><p>${escapeHtml(plan.objective)}</p><ul>${htmlList(plan.assumptions)}</ul><h2>Open decisions</h2><ul>${htmlList(plan.openDecisions)}</ul></section><section class="doc-section"><h2>Phases</h2>${plan.phases.map((phase) => `<article class="doc-phase"><h3>${escapeHtml(phase.id)}: ${escapeHtml(phase.name)}</h3><p>${escapeHtml(phase.objective)}</p><h4>Allowed paths</h4><ul>${htmlList(phase.allowedPaths)}</ul><h4>Quality gates</h4><ul>${htmlList(phase.qualityGates)}</ul><h4>Acceptance criteria</h4><ul>${htmlList(phase.acceptanceCriteria)}</ul><h4>Stop conditions</h4><ul>${htmlList(phase.stopConditions)}</ul></article>`).join("")}</section><section class="doc-section"><h2>Paths</h2><h3>Allowed</h3><ul>${htmlList(plan.allowedPaths)}</ul><h3>Forbidden</h3><ul>${htmlList(plan.forbiddenPaths)}</ul></section>${changes("API changes", plan.apiChanges)}${changes("DB changes", plan.dbChanges)}${changes("Dependency changes", plan.dependencyChanges)}${changes("Permission changes", plan.permissionChanges)}${changes("Secret changes", plan.secretChanges)}${changes("External side effects", plan.externalSideEffects)}<section class="doc-section"><h2>Quality and execution</h2><h3>Quality gates</h3><ul>${htmlList(plan.qualityGates)}</ul><h3>Failure policy</h3><p>${escapeHtml(plan.failurePolicy)}</p><h3>Limits</h3>${htmlEntries([Object.fromEntries(Object.entries(plan.limits).map(([key, value]) => [key, String(value)]))])}<h3>Branch / worktree</h3>${htmlEntries([plan.branch])}<h3>Acceptance criteria</h3><ul>${htmlList(plan.acceptanceCriteria)}</ul></section></main></body></html>\n`;
}

export function renderPlanMarkdown(view: PlanViewModel): string {
  const { plan, planHash } = view;
  const lines = [
    `# ${plan.objective}`,
    "",
    `- planId: ${plan.planId}`,
    `- runId: ${plan.runId}`,
    `- schemaVersion: ${plan.schemaVersion}`,
    `- planHash: ${planHash}`,
    "",
    "## 目的・前提",
    plan.objective,
    ...plan.assumptions.map((value) => `- ${value}`),
    "",
    "## Open decisions",
    ...plan.openDecisions.map((value) => `- ${value}`),
    "",
    "## Phases",
  ];
  for (const phase of plan.phases)
    lines.push(
      `### ${phase.id}: ${phase.name}`,
      "",
      phase.objective,
      "",
      "Allowed paths:",
      ...phase.allowedPaths.map((value) => `- ${value}`),
      "",
      "Quality gates:",
      ...phase.qualityGates.map((value) => `- ${value}`),
      "",
      "Acceptance criteria:",
      ...phase.acceptanceCriteria.map((value) => `- ${value}`),
      "",
      "Stop conditions:",
      ...phase.stopConditions.map((value) => `- ${value}`),
      "",
    );
  lines.push(
    "## Allowed paths",
    ...plan.allowedPaths.map((value) => `- ${value}`),
    "",
    "## Forbidden paths",
    ...plan.forbiddenPaths.map((value) => `- ${value}`),
  );
  for (const [title, entries] of [
    ["API changes", displayChanges(plan.apiChanges)],
    ["DB changes", displayChanges(plan.dbChanges)],
    ["Dependency changes", displayChanges(plan.dependencyChanges)],
    ["Permission changes", displayChanges(plan.permissionChanges)],
    ["Secret changes", displayChanges(plan.secretChanges)],
    ["External side effects", displayChanges(plan.externalSideEffects)],
  ] as const)
    lines.push("", `## ${title}`, ...markdownEntries(entries));
  lines.push(
    "",
    "## Quality gates",
    ...plan.qualityGates.map((value) => `- ${value}`),
    "",
    "## Failure policy",
    plan.failurePolicy,
    "",
    "## Limits",
    ...Object.entries(plan.limits).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Branch / worktree",
    ...Object.entries(plan.branch).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Acceptance criteria",
    ...plan.acceptanceCriteria.map((value) => `- ${value}`),
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function writePlanRun(
  input: unknown,
  root: string,
): Promise<string> {
  const view = createPlanViewModel(input);
  const runDirectory = join(root, "docs", "agent-runs", view.plan.runId);
  await mkdir(dirname(runDirectory), { recursive: true });
  await mkdir(runDirectory);
  await writeFile(
    join(runDirectory, "plan.json"),
    normalizePlan(view.plan),
    "utf8",
  );
  await writeFile(
    join(runDirectory, "plan-review.html"),
    renderPlanHtml(view),
    "utf8",
  );
  await writeFile(
    join(runDirectory, "agent-plan.md"),
    renderPlanMarkdown(view),
    "utf8",
  );
  await writeFile(
    join(runDirectory, "manifest.json"),
    JSON.stringify({
      planId: view.plan.planId,
      runId: view.plan.runId,
      planHash: view.planHash,
      artifacts: ["plan.json", "plan-review.html", "agent-plan.md"],
    }) + "\n",
    { encoding: "utf8", flag: "wx" },
  );
  return runDirectory;
}
