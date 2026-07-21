import { TIME_OPTIONS } from "./timeOptions";

export const getConstraints = (value: string, mode: "start" | "end") => {
  if (!value) return { min: null, max: null };

  const idx = TIME_OPTIONS.indexOf(value);
  if (idx === -1) return { min: null, max: null };

  if (mode === "start") {
    // endTime を基準に「上限のみ」
    return { min: null, max: TIME_OPTIONS[idx - 1] ?? null };
  }

  if (mode === "end") {
    // startTime を基準に「下限のみ」
    return { min: TIME_OPTIONS[idx + 1] ?? null, max: null };
  }

  return { min: null, max: null };
};
