type GroupEventCardProps = {
  timeText: string;
  memberCount: number;
};

export default function GroupEventCard({
  timeText,
  memberCount,
}: GroupEventCardProps) {
  return (
    <div
      aria-label={`予定あり、${timeText}、${memberCount}人`}
      className="h-full overflow-hidden rounded-lg border border-[#bfdbfe] border-l-4 border-l-[#2563eb] bg-[#eff6ff] px-2 py-1 text-left text-[#1e3a8a] shadow-sm"
    >
      <p className="text-xs font-semibold">{timeText}</p>
      <p className="mt-0.5 truncate text-xs font-bold">予定あり</p>
      <p className="mt-0.5 text-[11px]">{memberCount}人</p>
    </div>
  );
}
