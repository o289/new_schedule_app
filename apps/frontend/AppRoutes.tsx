import { Routes, Route } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import { CalendarProvider } from "./context/CalendarContext";
import EntrancePage from "./pages/EntrancePage";
import Dashboard from "./pages/Dashboard";
import EditUserPage from "./components/user/EditUserPage";
import GroupInvitationPage from "./pages/GroupInvitationPage";

export default function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<EntrancePage />} />
        <Route path="/join" element={<GroupInvitationPage />} />

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
        </Route>
      </Routes>
    </>
  );
}
