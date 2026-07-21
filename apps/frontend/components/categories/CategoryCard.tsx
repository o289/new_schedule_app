import { getCategoryTheme } from "../../utils/getCategoryTheme";
import type { CategoryResponse } from "../../types/schedule";

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

  return (
    <div
      className="flex justify-between rounded-xl text-lg px-5 py-5 font-semibold text-white shadow-[0_6px_14px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)]"
      style={{ background: theme.border }}
    >
      <span>{category.name}</span>

      <div>
        <span
          className="ml-[15px] cursor-pointer opacity-85 hover:opacity-100"
          onClick={onEdit}
        >
          ✏️
        </span>

        <span
          className="ml-[15px] cursor-pointer opacity-85 hover:opacity-100"
          onClick={onDelete}
        >
          🗑️
        </span>
      </div>
    </div>
  );
}
