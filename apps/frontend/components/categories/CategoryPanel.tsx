import { renderCategories } from "./categoryUI";
import CategoryCard from "./CategoryCard";
import { CATEGORY_COLORS } from "../../constants/categoryColors";

import { Button } from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { ChangeEvent, FormEvent } from "react";
import type { AsideMode } from "../../context/CalendarContext";
import type {
  CategoryColor,
  CategoryResponse,
} from "../../../../packages/schemas/category";

type Category = CategoryResponse;

interface CategoryForm {
  name: string;
  color: CategoryColor;
}

export default function CategoryPanel({
  categories,
  formData,
  onChange,
  onSubmit,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  setAsideMode,
  editingCategory,
  onCancelEdit,
}: {
  categories: Category[];
  formData: CategoryForm;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: () => void | Promise<void>;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void | Promise<void>;
  setAsideMode: (mode: AsideMode) => void;
  editingCategory: Category["id"] | null;
  onCancelEdit: () => void;
}) {
  const visibleCategories = renderCategories(categories, expanded);

  return (
    <>
      <Button
        type="button"
        variant="text"
        startIcon={<ArrowBackIcon sx={{ fontSize: 36 }} />}
        onClick={() => setAsideMode(null)}
        sx={{
          color: "#111827",
          minWidth: "auto",
          "&:hover": {
            backgroundColor: "transparent",
          },
        }}
        className="!text-xl !justify-start !p-0"
      >
        戻る
      </Button>
      <div className="w-full">
        <div className="mb-6 rounded-[14px] bg-white p-5 shadow-[0_6px_16px_rgba(0,0,0,0.08)]">
          <form
            className="flex flex-col"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <h3 className="mb-4">
              {editingCategory ? "カテゴリ編集" : "カテゴリ作成"}
            </h3>

            <input
              className="mb-3 w-full rounded-lg border border-[#ccc] p-3 text-[16px] leading-[1.4]"
              name="name"
              value={formData.name}
              onChange={onChange}
              placeholder="カテゴリ名"
              required
            />
            <select
              className="mb-3 w-full rounded-lg border border-[#ccc] p-3 text-[16px] leading-[1.4]"
              name="color"
              value={formData.color}
              onChange={onChange}
              required
            >
              {CATEGORY_COLORS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <Button
              className="!mt-[10px] !w-full"
              variant="contained"
              type="submit"
              startIcon={<AddIcon />}
            >
              {editingCategory ? "更新" : "作成"}
            </Button>

            {editingCategory && (
              <>
                <Button
                  className="!mt-[10px] !w-full"
                  variant="contained"
                  startIcon={<CloseIcon />}
                  onClick={onCancelEdit}
                >
                  キャンセル
                </Button>
              </>
            )}
          </form>
        </div>

        <div className="flex flex-col gap-[16px]">
          {visibleCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onEdit={() => onEdit(cat)}
              onDelete={() => onDelete(cat)}
            />
          ))}
        </div>

        {categories.length > 5 && (
          <div
            className="mt-4 cursor-pointer text-center text-[18px] font-semibold text-[#4a90e2]"
            onClick={onToggle}
          >
            {expanded ? "閉じる" : `＋${categories.length - 5}件表示`}
          </div>
        )}
      </div>
    </>
  );
}
