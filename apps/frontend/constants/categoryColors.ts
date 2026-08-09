import { categoryColorValues, type CategoryColor } from "#schemas/category";

type CategoryColorOption = {
  value: CategoryColor;
  label: string;
};

const categoryColorLabels = {
  gray: "グレー",
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
  purple: "紫",
  orange: "橙",
  pink: "ピンク",
  teal: "青緑",
  brown: "茶",
} satisfies Record<CategoryColor, string>;

export const CATEGORY_COLORS = categoryColorValues.map((value) => ({
  value,
  label: categoryColorLabels[value],
})) satisfies readonly CategoryColorOption[];
