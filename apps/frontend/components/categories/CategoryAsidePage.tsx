import { useState } from "react";
import type { AsideMode } from "../../context/CalendarContext";
import { CircularProgress } from "@mui/material";

import { useCategory } from "./useCategory";

import CategoryPanel from "./CategoryPanel";

export default function CategoryAsidePage({
  setAsideMode,
}: {
  setAsideMode: (mode: AsideMode) => void;
}) {
  const {
    categories,
    form,
    isFetching,
    editingId,
    handleChange,
    handleSubmit,
    handleEditClick,
    handleCancelEdit,
    handleDelete,
  } = useCategory();

  const [expanded, setExpanded] = useState(false);

  if (isFetching) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircularProgress aria-label="処理中" className="w-64 max-w-full" />
      </div>
    );
  }

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
