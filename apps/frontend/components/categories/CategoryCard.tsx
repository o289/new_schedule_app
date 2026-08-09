import { getCategoryTheme } from "#frontend/utils/getCategoryTheme";
import { getCategoryIcon } from "#frontend/constants/categoryIcons";
import type { CategoryResponse } from "#frontend/types/schedule";

export default function CategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: CategoryResponse;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = getCategoryTheme(category.color);
  const Icon = getCategoryIcon(category.icon);

  return (
    <div
      className="flex justify-between rounded-xl text-lg px-5 py-5 font-semibold text-white shadow-[0_6px_14px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)]"
      style={{ background: theme.border }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" />
        <span className="truncate">{category.name}</span>
      </span>

      <div className="flex items-center">
        <button
          type="button"
          aria-label={`${category.name}を編集`}
          className="ml-[15px] cursor-pointer border-0 bg-transparent p-0 opacity-85 hover:opacity-100"
          onClick={onEdit}
        >
          ✏️
        </button>

        <button
          type="button"
          aria-label={`${category.name}を削除`}
          className="ml-[15px] cursor-pointer border-0 bg-transparent p-0 opacity-85 hover:opacity-100"
          onClick={onDelete}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
