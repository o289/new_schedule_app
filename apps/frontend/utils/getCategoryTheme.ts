import { CATEGORY_THEME } from "../constants/categoryTheme";
import type { CategoryColor } from "#schemas/category";

export function getCategoryTheme(color: CategoryColor | undefined) {
  return (color && CATEGORY_THEME[color]) || CATEGORY_THEME.gray;
}
