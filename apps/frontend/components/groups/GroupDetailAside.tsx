import { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

import { useCalendar } from "#frontend/context/CalendarContext";
import JoinCodeDialog from "./JoinCodeDialog";
import GroupMemberList from "./GroupMemberList";
import { useGroupDetail } from "./useGroupManagement";

export default function GroupDetailAside() {
  const {
    selectedCalendar,
    setSelectedCalendar,
    setAsideMode,
    createdJoinCode,
    setCreatedJoinCode,
  } = useCalendar();
  const groupId =
    selectedCalendar.kind === "group" ? selectedCalendar.groupId : "";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [kickUserId, setKickUserId] = useState<string | null>(null);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const {
    detailQuery,
    leaveMutation,
    kickMutation,
    deleteMutation,
    regenerateInvitationMutation,
    handleMutationError,
  } = useGroupDetail(groupId);

  if (!groupId || detailQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CircularProgress aria-label="グループを読み込み中" />
      </div>
    );
  }
  const detail = detailQuery.data;
  if (!detail) return null;

  const returnToPersonalCalendar = () => {
    setSelectedCalendar({ kind: "personal" });
    setAsideMode(null);
  };
  const openInvitation = () => {
    if (createdJoinCode?.groupId === groupId) {
      setInvitationOpen(true);
      return;
    }
    setRegenerateOpen(true);
  };
  const regenerateInvitation = async () => {
    try {
      const invitation = await regenerateInvitationMutation.mutateAsync();
      setCreatedJoinCode({ groupId, joinCode: invitation.joinCode });
      setRegenerateOpen(false);
      setInvitationOpen(true);
    } catch {
      // エラー通知はhookで統一する。
    }
  };
  const kick = async () => {
    if (!kickUserId) return;
    try {
      await kickMutation.mutateAsync(kickUserId);
      setKickUserId(null);
    } catch (error) {
      handleMutationError(error);
    }
  };
  const leave = async () => {
    try {
      await leaveMutation.mutateAsync();
      returnToPersonalCalendar();
    } catch (error) {
      handleMutationError(error);
    }
  };
  const deleteGroup = async () => {
    try {
      await deleteMutation.mutateAsync();
      returnToPersonalCalendar();
    } catch (error) {
      handleMutationError(error);
    }
  };
  const isOwner = detail.group.currentUserRole === "owner";
  const kickTarget = detail.members.find(
    (member) => member.userId === kickUserId,
  );

  return (
    <>
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-[#4a90e2]">
          {detail.group.memberCount}人のグループ
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[#111827]">
          {detail.group.name}
        </h2>
        <h3 className="mt-6 text-lg font-bold text-[#111827]">メンバー</h3>
        <div className="mt-3">
          <GroupMemberList
            members={detail.members}
            isOwner={isOwner}
            onKick={setKickUserId}
            isKicking={kickMutation.isPending}
          />
        </div>

        {isOwner && (
          <Button className="!mt-5" variant="outlined" onClick={openInvitation}>
            メンバーを招待
          </Button>
        )}

        <div className="mt-6 flex flex-col gap-3">
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

      <JoinCodeDialog
        joinCode={
          invitationOpen && createdJoinCode?.groupId === groupId
            ? createdJoinCode.joinCode
            : null
        }
        onClose={() => setInvitationOpen(false)}
        onRegenerate={() => {
          setInvitationOpen(false);
          setRegenerateOpen(true);
        }}
      />

      <Dialog open={regenerateOpen} onClose={() => setRegenerateOpen(false)}>
        <DialogTitle>新しい招待リンクを発行しますか？</DialogTitle>
        <DialogContent>
          以前の招待リンクと参加コードは使えなくなります。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenerateOpen(false)}>キャンセル</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={regenerateInvitation}
            disabled={regenerateInvitationMutation.isPending}
          >
            発行する
          </Button>
        </DialogActions>
      </Dialog>

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

      <Dialog open={kickUserId !== null} onClose={() => setKickUserId(null)}>
        <DialogTitle>メンバーを追放しますか？</DialogTitle>
        <DialogContent>
          {kickTarget?.name ?? "このメンバー"}
          はこのグループへ再参加できなくなります。
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setKickUserId(null)}>
            キャンセル
          </Button>
          <Button
            color="error"
            onClick={kick}
            disabled={kickMutation.isPending}
          >
            追放する
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
    </>
  );
}
