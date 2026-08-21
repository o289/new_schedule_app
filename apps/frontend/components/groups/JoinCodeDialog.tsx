import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

type JoinCodeDialogProps = {
  joinCode: string | null;
  onClose: () => void;
};

export default function JoinCodeDialog({
  joinCode,
  onClose,
}: JoinCodeDialogProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [joinCode]);

  const copy = async () => {
    if (!joinCode) return;
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
  };

  return (
    <Dialog open={joinCode !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>参加コード</DialogTitle>
      <DialogContent>
        <p className="mt-2 text-sm text-[#4b5563]">
          この画面を閉じると、参加コードは再表示・再発行できません。
        </p>
        <p className="mt-5 break-all rounded-xl bg-[#f3f4f6] px-4 py-3 font-mono text-lg font-bold text-[#111827]">
          {joinCode}
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={copy} disabled={!joinCode}>
          {copied ? "コピーしました" : "コピー"}
        </Button>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
