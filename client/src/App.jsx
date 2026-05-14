import { Routes, Route, Navigate } from "react-router-dom";
import AnalyticsShell from "./tactical/shell/AnalyticsShell.jsx";
import DashboardView from "./tactical/views/DashboardView.jsx";
import DatasetView from "./tactical/views/DatasetView.jsx";
import AnalyzeView from "./tactical/views/AnalyzeView.jsx";
import ScriptsView from "./tactical/views/ScriptsView.jsx";
import RunsView from "./tactical/views/RunsView.jsx";

// Apify lives in the Settings drawer now. The /apify and /app/apify paths
// redirect home so old bookmarks don't 404.

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AnalyticsShell />}>
        <Route index element={<DashboardView />} />
        <Route path="dataset" element={<DatasetView />} />
        <Route path="analyze" element={<AnalyzeView />} />
        <Route path="scripts" element={<ScriptsView />} />
        <Route path="runs" element={<RunsView />} />
      </Route>
      {/* Legacy /app/* deep-links continue to work. */}
      <Route path="/app" element={<Navigate to="/" replace />} />
      <Route path="/app/dataset" element={<Navigate to="/dataset" replace />} />
      <Route path="/app/analyze" element={<Navigate to="/analyze" replace />} />
      <Route path="/app/scripts" element={<Navigate to="/scripts" replace />} />
      <Route path="/apify" element={<Navigate to="/" replace />} />
      <Route path="/app/apify" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
