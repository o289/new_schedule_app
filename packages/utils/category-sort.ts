import { categoryColorValues, categoryIconValues } from "../schemas/category";

/** カテゴリー一覧を固定順で並べるために必要な最小限の項目。 */
export interface SortableCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const colorRank = new Map<string, number>(
  categoryColorValues.map((color, index) => [color, index]),
);

const iconRank = new Map<string, number>(
  categoryIconValues.map((icon, index) => [icon, index]),
);

function rankOf(rankMap: ReadonlyMap<string, number>, value: string): number {
  return rankMap.get(value) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * 色、アイコン、名前、IDの順にカテゴリーを比較する。
 * 未知の値は既知の値の後ろへ置き、名前とIDで順番を固定する。
 */
export function compareCategories(
  left: SortableCategory,
  right: SortableCategory,
): number {
  const colorDifference =
    rankOf(colorRank, left.color) - rankOf(colorRank, right.color);
  if (colorDifference !== 0) {
    return colorDifference;
  }

  const iconDifference =
    rankOf(iconRank, left.icon) - rankOf(iconRank, right.icon);
  if (iconDifference !== 0) {
    return iconDifference;
  }

  const nameDifference = left.name.localeCompare(right.name, "ja-JP");
  if (nameDifference !== 0) {
    return nameDifference;
  }

  return left.id.localeCompare(right.id);
}

/** 元の配列を変更せず、カテゴリーを固定順で返す。 */
export function sortCategories<T extends SortableCategory>(
  categories: readonly T[],
): T[] {
  return [...categories].sort(compareCategories);
}
