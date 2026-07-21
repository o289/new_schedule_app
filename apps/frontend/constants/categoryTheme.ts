import type { CategoryColor } from "../../../packages/schemas/category";

export interface CategoryTheme {
  border: string;
  bg: string;
  text: string;
}

export const CATEGORY_THEME = {
  red: {
    border: "#ef4444",
    bg: "#fef2f2",
    text: "#991b1b",
  },

  blue: {
    border: "#3b82f6",
    bg: "#eff6ff",
    text: "#1e3a8a",
  },

  green: {
    border: "#22c55e",
    bg: "#f0fdf4",
    text: "#166534",
  },

  yellow: {
    border: "#eab308",
    bg: "#fefce8",
    text: "#854d0e",
  },

  purple: {
    border: "#a855f7",
    bg: "#faf5ff",
    text: "#6b21a8",
  },

  orange: {
    border: "#f97316",
    bg: "#fff7ed",
    text: "#9a3412",
  },

  pink: {
    border: "#ec4899",
    bg: "#fdf2f8",
    text: "#9d174d",
  },

  teal: {
    border: "#14b8a6",
    bg: "#f0fdfa",
    text: "#115e59",
  },

  gray: {
    border: "#6b7280",
    bg: "#f9fafb",
    text: "#374151",
  },

  brown: {
    border: "#92400e",
    bg: "#fef7ed",
    text: "#78350f",
  },
} satisfies Record<CategoryColor, CategoryTheme>;
