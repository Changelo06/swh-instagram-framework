import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import AnalyticsShell from "./tactical/shell/AnalyticsShell.jsx";
import DashboardView from "./tactical/views/DashboardView.jsx";
import DatasetView from "./tactical/views/DatasetView.jsx";
import AnalyzeView from "./tactical/views/AnalyzeView.jsx";
import ScriptsView from "./tactical/views/ScriptsView.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AnalyticsShell />}>
        <Route index element={<DashboardView />} />
        <Route path="dataset" element={<DatasetView />} />
        <Route path="analyze" element={<AnalyzeView />} />
        <Route path="scripts" element={<ScriptsView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
