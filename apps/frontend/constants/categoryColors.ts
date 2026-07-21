import type { CategoryColor } from "../../../packages/schemas/category";

type CategoryColorOption = {
  value: CategoryColor;
  label: string;
};

export const CATEGORY_COLORS = [
  { value: "gray", label: "グレー" },
  { value: "red", label: "赤" },
  { value: "blue", label: "青" },
  { value: "green", label: "緑" },
  { value: "yellow", label: "黄" },
  { value: "purple", label: "紫" },
  { value: "orange", label: "橙" },
  { value: "pink", label: "ピンク" },
  { value: "teal", label: "青緑" },
  { value: "brown", label: "茶" },
] as const satisfies readonly CategoryColorOption[];
