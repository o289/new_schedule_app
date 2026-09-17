import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

/** AI同士が作業を引き継ぐための、最小限の共有メモ。 */
export const workSchema = z
  .object({
    goal: nonEmpty,
    currentPhase: nonEmpty,
    nextAction: nonEmpty,
    lastVerification: nonEmpty,
    blocker: z.string(),
    updatedAt: nonEmpty,
  })
  .strict();

export type WorkBoard = z.infer<typeof workSchema>;

export function parseWorkBoard(input: unknown): WorkBoard {
  return workSchema.parse(input);
}
