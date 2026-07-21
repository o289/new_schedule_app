export const MAX_VISIBLE = 5;

export function renderCategories<T>(categories: T[], expanded: boolean): T[] {
  if (expanded) return categories;
  return categories.slice(0, MAX_VISIBLE);
}
