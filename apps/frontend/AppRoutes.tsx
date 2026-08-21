import { Routes, Route } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import { CalendarProvider } from "./context/CalendarContext";
import EntrancePage from "./pages/EntrancePage";
import Dashboard from "./pages/Dashboard";
import EditUserPage from "./components/user/EditUserPage";
import GroupDetailPage from "./components/groups/GroupDetailPage";
import GroupCalendarPage from "./pages/GroupCalendarPage";
import GroupListPage from "./pages/GroupListPage";

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<EntrancePage />} />

        <Route element={<RequireAuth />}>
          <Route
            path="/dashboard"
            element={
              <CalendarProvider>
                <Dashboard />
              </CalendarProvider>
            }
          />
          <Route path="/setting" element={<EditUserPage />} />
          <Route path="/groups" element={<GroupListPage />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route
            path="/groups/:groupId/calendar"
            element={<GroupCalendarPage />}
          />
        </Route>
      </Routes>
    </>
  );
}
