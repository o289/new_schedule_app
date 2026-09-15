import { z } from "zod";

const identifier = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "小文字英数字とハイフンだけを使用してください",
  );
const nonEmpty = z.string().trim().min(1);
const decisionStatus = z.enum(["APPROVED", "NOT_APPLICABLE", "REJECTED"]);

function uniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isRepositoryPath(value: string): boolean {
  if (value === ".env*") return true;
  if (
    value === "." ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0")
  )
    return false;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return false;
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === ".." || part === "."))
    return false;
  return value.endsWith("/**") || !value.includes("*");
}

const pathList = z
  .array(nonEmpty)
  .min(1)
  .superRefine((paths, context) => {
    if (!uniqueStrings(paths)) {
      context.addIssue({ code: "custom", message: "pathが重複しています" });
    }
    paths.forEach((path, index) => {
      if (!isRepositoryPath(path)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message:
            "repository相対pathまたは末尾 /** のglobだけを指定してください",
        });
      }
    });
  });

const changeBase = z
  .object({ status: decisionStatus, description: nonEmpty })
  .strict();
const apiChange = changeBase
  .extend({
    method: nonEmpty,
    path: nonEmpty,
    request: nonEmpty,
    response: nonEmpty,
    compatibility: nonEmpty,
  })
  .strict();
const dbChange = changeBase
  .extend({
    model: nonEmpty,
    migration: nonEmpty,
    dataImpact: nonEmpty,
    rollback: nonEmpty,
  })
  .strict();
const dependencyChange = changeBase
  .extend({
    name: nonEmpty,
    version: nonEmpty,
    reason: nonEmpty,
    license: nonEmpty,
  })
  .strict();
const boundaryChange = changeBase
  .extend({ target: nonEmpty, boundary: nonEmpty, mitigation: nonEmpty })
  .strict();

const changeList = <T extends z.ZodType>(schema: T) => z.array(schema).min(1);

const phaseSchema = z
  .object({
    id: identifier,
    name: nonEmpty,
    objective: nonEmpty,
    allowedPaths: pathList,
    qualityGates: z.array(nonEmpty).min(1),
    acceptanceCriteria: z.array(nonEmpty).min(1),
    stopConditions: z.array(nonEmpty).min(1),
  })
  .strict();

const limitsSchema = z
  .object({
    maxRetries: z.number().int().min(0).max(3),
    maxDurationMinutes: z.number().int().positive().max(120),
    maxCostYen: z.number().finite().min(0),
  })
  .strict();

export const planSchema = z
  .object({
    schemaVersion: z.literal(2),
    planId: identifier,
    runId: identifier,
    objective: nonEmpty,
    assumptions: z.array(nonEmpty),
    openDecisions: z.array(nonEmpty),
    phases: z.array(phaseSchema).min(1),
    allowedPaths: pathList,
    forbiddenPaths: pathList,
    apiChanges: changeList(apiChange),
    dbChanges: changeList(dbChange),
    dependencyChanges: changeList(dependencyChange),
    permissionChanges: changeList(boundaryChange),
    secretChanges: changeList(boundaryChange),
    externalSideEffects: changeList(boundaryChange),
    qualityGates: z.array(nonEmpty).min(1),
    failurePolicy: nonEmpty,
    limits: limitsSchema,
    branch: z
      .object({
        source: nonEmpty,
        worktree: nonEmpty,
        mode: z.enum(["push_only", "pull_request"]),
      })
      .strict(),
    acceptanceCriteria: z.array(nonEmpty).min(1),
  })
  .strict()
  .superRefine((plan, context) => {
    const requiredForbidden = [".git/**", ".env*", "docs/agent-runs/**"];
    requiredForbidden.forEach((path) => {
      if (!plan.forbiddenPaths.includes(path)) {
        context.addIssue({
          code: "custom",
          path: ["forbiddenPaths"],
          message: `必須禁止path ${path} がありません`,
        });
      }
    });
    if (!uniqueStrings(plan.phases.map(({ id }) => id))) {
      context.addIssue({
        code: "custom",
        path: ["phases"],
        message: "Phase idが重複しています",
      });
    }
    const isUnder = (child: string, parent: string): boolean => {
      if (parent === ".env*")
        return child === ".env" || child.startsWith(".env.");
      if (parent.endsWith("/**")) {
        const base = parent.slice(0, -3);
        return child === base || child.startsWith(`${base}/`);
      }
      return child === parent;
    };
    if (
      plan.allowedPaths.some((allowed) =>
        plan.forbiddenPaths.some((forbidden) => isUnder(allowed, forbidden)),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedPaths"],
        message: "許可pathと禁止pathが重複しています",
      });
    }
    plan.phases.forEach((phase, phaseIndex) => {
      phase.allowedPaths.forEach((phasePath, pathIndex) => {
        if (!plan.allowedPaths.some((allowed) => isUnder(phasePath, allowed))) {
          context.addIssue({
            code: "custom",
            path: ["phases", phaseIndex, "allowedPaths", pathIndex],
            message: "Phaseの許可pathが計画全体の範囲外です",
          });
        }
      });
    });
  });

export type Plan = z.infer<typeof planSchema>;
export type ChangeAssessment =
  | z.infer<typeof apiChange>
  | z.infer<typeof dbChange>
  | z.infer<typeof dependencyChange>
  | z.infer<typeof boundaryChange>;

export function parsePlan(input: unknown): Plan {
  return planSchema.parse(input);
}

export function assertPlanApprovable(plan: Plan): void {
  if (plan.openDecisions.length > 0) {
    throw new Error("STOP: openDecisionsが残っています");
  }
  const assessments: ChangeAssessment[] = [
    ...plan.apiChanges,
    ...plan.dbChanges,
    ...plan.dependencyChanges,
    ...plan.permissionChanges,
    ...plan.secretChanges,
    ...plan.externalSideEffects,
  ];
  if (
    assessments.some(
      ({ status }) => status !== "APPROVED" && status !== "NOT_APPLICABLE",
    )
  ) {
    throw new Error("STOP: 未承認または説明のない変更単位があります");
  }
}
