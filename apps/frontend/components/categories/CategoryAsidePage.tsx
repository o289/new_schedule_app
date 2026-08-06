import { useState } from "react";
import type { AsideMode } from "#frontend/context/CalendarContext";

import type { useCategory } from "./useCategory";

import CategoryPanel from "./CategoryPanel";

export default function CategoryAsidePage({
  setAsideMode,
  category,
}: {
  setAsideMode: (mode: AsideMode) => void;
  category: Pick<
    ReturnType<typeof useCategory>,
    | "categories"
    | "form"
    | "editingId"
    | "handleChange"
    | "handleSubmit"
    | "handleEditClick"
    | "handleCancelEdit"
    | "handleDelete"
  >;
}) {
  const {
    categories,
    form,
    editingId,
    handleChange,
    handleSubmit,
    handleEditClick,
    handleCancelEdit,
    handleDelete,
  } = category;

  const [expanded, setExpanded] = useState(false);

  return (
    <CategoryPanel
      categories={categories}
      formData={form}
      onChange={handleChange}
      onSubmit={handleSubmit}
      expanded={expanded}
      editingCategory={editingId}
      onDelete={handleDelete}
      onEdit={handleEditClick}
      onToggle={() => setExpanded((prev) => !prev)}
      onCancelEdit={handleCancelEdit}
      setAsideMode={setAsideMode}
    />
  );
}
