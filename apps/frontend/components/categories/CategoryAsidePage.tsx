import { useState } from "react";
import type { AsideMode } from "../../context/CalendarContext";
import { LinearProgress } from "@mui/material";

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
    return <LinearProgress aria-label="処理中" />;
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
