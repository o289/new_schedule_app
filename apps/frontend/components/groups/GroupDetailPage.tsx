import { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import GroupMemberList from "./GroupMemberList";
import { useGroupDetail } from "./useGroupManagement";

export default function GroupDetailPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const {
    detailQuery,
    leaveMutation,
    kickMutation,
    deleteMutation,
    handleMutationError,
  } = useGroupDetail(groupId ?? "");

  if (!groupId || detailQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CircularProgress aria-label="グループを読み込み中" />
      </div>
    );
  }
  const detail = detailQuery.data;
  if (!detail) return null;

  const isOwner = detail.group.currentUserRole === "owner";
  const kick = async (userId: string) => {
    try {
      await kickMutation.mutateAsync(userId);
    } catch (error) {
      handleMutationError(error);
    }
  };
  const leave = async () => {
    try {
      await leaveMutation.mutateAsync();
    } catch (error) {
      handleMutationError(error);
    }
  };
  const deleteGroup = async () => {
    try {
      await deleteMutation.mutateAsync();
    } catch (error) {
      handleMutationError(error);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f9fc] px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={() => navigate("/groups")}
          className="text-sm font-medium text-[#5f6b7a] hover:text-[#111827]"
        >
          ← グループ一覧に戻る
        </button>
        <div className="mt-4 rounded-3xl border border-white bg-white p-6 shadow-[0_18px_50px_rgba(31,73,125,0.12)] sm:p-8">
          <p className="text-sm font-semibold text-[#4a90e2]">
            {detail.group.memberCount}人のグループ
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#111827]">
            {detail.group.name}
          </h1>
          <h2 className="mt-8 text-lg font-bold text-[#111827]">メンバー</h2>
          <div className="mt-3">
            <GroupMemberList
              members={detail.members}
              isOwner={isOwner}
              onKick={kick}
              isKicking={kickMutation.isPending}
            />
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="contained"
              onClick={() => navigate(`/groups/${groupId}/calendar`)}
            >
              カレンダーを見る
            </Button>
            {isOwner ? (
              <Button
                color="error"
                variant="outlined"
                onClick={() => setDeleteOpen(true)}
              >
                グループを削除
              </Button>
            ) : (
              <Button
                color="error"
                variant="outlined"
                onClick={() => setLeaveOpen(true)}
              >
                グループを退出
              </Button>
            )}
          </div>
        </div>
      </section>

      <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)}>
        <DialogTitle>グループを退出しますか？</DialogTitle>
        <DialogContent>
          退出後も、参加コードがあれば再参加できます。
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setLeaveOpen(false)}>
            キャンセル
          </Button>
          <Button
            color="error"
            onClick={leave}
            disabled={leaveMutation.isPending}
          >
            退出する
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>グループを削除しますか？</DialogTitle>
        <DialogContent>
          この操作は取り消せません。個人の予定は削除されません。
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setDeleteOpen(false)}>
            キャンセル
          </Button>
          <Button
            color="error"
            onClick={deleteGroup}
            disabled={deleteMutation.isPending}
          >
            削除する
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
