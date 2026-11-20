import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

export default function CalendarBackButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-medium text-[#5f6b7a] hover:text-[#111827]"
    >
      <ArrowBackRoundedIcon fontSize="small" />
      カレンダーに戻る
    </button>
  );
}
