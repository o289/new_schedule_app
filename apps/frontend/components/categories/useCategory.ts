// src/pages/categories/useCategory.ts

import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import useLoading from "../../hooks/useLoading";
import type {
  CategoryColor,
  CategoryCreate,
  CategoryIcon,
  CategoryResponse,
} from "../../../../packages/schemas/category";

const BASE_URL = "/categories";

type Category = CategoryResponse;

type CategoryForm = CategoryCreate;

export function useCategory() {
  const { showAlert } = useAlert();
  const { authFetch } = useAuth();
  const { isFetching, startFetching, stopFetching } = useLoading();

  // 一覧
  const [categories, setCategories] = useState<Category[]>([]);

  // フォーム（新規・編集共通）
  const [form, setForm] = useState<CategoryForm>({
    name: "",
    color: "gray",
    icon: "tag",
  });

  // 編集対象
  const [editingId, setEditingId] = useState<Category["id"] | null>(null);

  // ========================
  // 一覧取得
  // ========================

  const fetchCategories = async () => {
    startFetching();

    try {
      const res = await authFetch<Category[]>(BASE_URL, { method: "GET" });

      setCategories(res);
    } finally {
      stopFetching();
    }
  };

  // ========================
  // フォーム変更
  // ========================

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "color") {
      setForm((prev) => ({ ...prev, color: value as CategoryColor }));
      return;
    }

    if (name === "icon") {
      setForm((prev) => ({ ...prev, icon: value as CategoryIcon }));
      return;
    }

    if (name === "name") {
      setForm((prev) => ({ ...prev, name: value }));
    }
  };

  // ========================
  // 作成 / 更新
  // ========================

  const handleSubmit = async () => {
    if (editingId) {
      // 更新

      await authFetch(`${BASE_URL}/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });

      showAlert("UPDATE_SUCCESS");
    } else {
      // 作成

      await authFetch(BASE_URL, {
        method: "POST",
        body: JSON.stringify(form),
      });

      showAlert("CREATE_SUCCESS");
    }

    // フォームリセット
    setForm({ name: "", color: "gray", icon: "tag" });
    setEditingId(null);

    // 親画面と共有しているカテゴリー一覧を、API取得完了後に更新する。
    await fetchCategories();
  };

  // ========================
  // 編集開始
  // ========================

  const handleEditClick = (category: Category) => {
    setEditingId(category.id);

    setForm({
      name: category.name,
      color: category.color,
      icon: category.icon,
    });
  };

  // ========================
  // 編集キャンセル
  // ========================

  const handleCancelEdit = () => {
    setEditingId(null);

    setForm({
      name: "",
      color: "gray",
      icon: "tag",
    });
  };

  // ========================
  // 削除
  // ========================

  const handleDelete = async (category: Category) => {
    setEditingId(category.id);

    await authFetch(`${BASE_URL}/${category.id}`, { method: "DELETE" });

    // 即時UI反映
    // setCategories((prev) => prev.filter((c) => String(c.id) !== String(id)));
    await fetchCategories();
    showAlert("DELETE_SUCCESS");
  };

  // ========================
  // 初期ロード
  // ========================

  useEffect(() => {
    fetchCategories();
  }, []);

  return {
    // state
    categories,
    form,
    editingId,
    isFetching,
    // actions
    fetchCategories,
    handleChange,
    handleSubmit,
    handleEditClick,
    handleCancelEdit,
    handleDelete,
  };
}
