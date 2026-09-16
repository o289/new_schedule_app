import { createHash } from "node:crypto";
import { parsePlan, type Plan } from "./plan-schema";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

export function normalizePlan(plan: Plan): string {
  return `${JSON.stringify(sortKeys(plan))}\n`;
}

export function hashPlan(plan: Plan): string {
  return createHash("sha256").update(normalizePlan(plan), "utf8").digest("hex");
}

export function parseAndHashPlan(input: unknown): {
  plan: Plan;
  planHash: string;
} {
  const plan = parsePlan(input);
  return { plan, planHash: hashPlan(plan) };
}
