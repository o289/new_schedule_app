import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

import { useAlert } from "#frontend/context/AlertContext";
import { buildInvitationLink, isShareCancellation } from "./invitationLink";

type JoinCodeDialogProps = {
  joinCode: string | null;
  onClose: () => void;
  onRegenerate?: () => void;
};

export default function JoinCodeDialog({
  joinCode,
  onClose,
  onRegenerate,
}: JoinCodeDialogProps) {
  const [copied, setCopied] = useState(false);
  const { showAlert } = useAlert();
  const invitationLink = useMemo(
    () =>
      joinCode ? buildInvitationLink(window.location.origin, joinCode) : null,
    [joinCode],
  );

  useEffect(() => {
    setCopied(false);
  }, [joinCode]);

  const copy = async () => {
    if (!invitationLink) return;
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
    } catch {
      showAlert("SERVER_ERROR");
    }
  };

  const share = async () => {
    if (!invitationLink || !navigator.share) return;
    try {
      await navigator.share({
        title: "グループへの招待",
        text: "スケジュール管理アプリのグループへ招待します。",
        url: invitationLink,
      });
    } catch (error) {
      if (!isShareCancellation(error)) showAlert("SERVER_ERROR");
    }
  };

  return (
    <Dialog open={joinCode !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>メンバーを招待</DialogTitle>
      <DialogContent>
        <p className="mt-2 text-sm text-[#4b5563]">
          招待リンクを共有すると、相手はリンクからグループに参加できます。
        </p>
        <p className="mt-5 break-all rounded-xl bg-[#f3f4f6] px-4 py-3 font-mono text-lg font-bold text-[#111827]">
          {invitationLink}
        </p>
        <details className="mt-4 text-left text-sm text-[#4b5563]">
          <summary className="cursor-pointer font-medium">
            参加コードを共有する場合
          </summary>
          <p className="mt-2 break-all rounded-lg bg-[#f9fafb] px-3 py-2 font-mono font-bold text-[#111827]">
            {joinCode}
          </p>
        </details>
        {onRegenerate && (
          <Button
            className="!mt-5"
            color="warning"
            variant="outlined"
            onClick={onRegenerate}
          >
            新しい招待リンクを発行
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        {typeof navigator.share === "function" && (
          <Button
            variant="contained"
            onClick={share}
            disabled={!invitationLink}
          >
            リンクを共有
          </Button>
        )}
        <Button onClick={copy} disabled={!invitationLink}>
          {copied ? "コピーしました" : "リンクをコピー"}
        </Button>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
