import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ScheduleCalendarPage from "../components/schedules/ScheduleCalendarPage";
import { useCalendar } from "../context/CalendarContext";

export default function Dashboard() {
  const { setAsideMode, setSelectedCalendar } = useCalendar();
  const location = useLocation();
  const navigate = useNavigate();
  const selectedGroupId = (
    location.state as { selectedGroupId?: unknown } | null
  )?.selectedGroupId;

  useEffect(() => {
    if (typeof selectedGroupId !== "string") return;

    setSelectedCalendar({ kind: "group", groupId: selectedGroupId });
    setAsideMode("group-detail");
    navigate("/dashboard", { replace: true, state: null });
  }, [navigate, selectedGroupId, setAsideMode, setSelectedCalendar]);

  return <ScheduleCalendarPage />;
}
