import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AnalyticsShell from "./tactical/shell/AnalyticsShell.jsx";
import DashboardView from "./tactical/views/DashboardView.jsx";

// Heavy views are split off the initial bundle (Phase 5). Dashboard
// stays eager so the first paint after unlock is instant; the other
// routes load on first navigation. Each split shaves a chunk off the
// main bundle, which previously bundled all of Recharts + react-
// markdown + remark/rehype into the boot path.
const DatasetView = lazy(() => import("./tactical/views/DatasetView.jsx"));
const AnalyzeView = lazy(() => import("./tactical/views/AnalyzeView.jsx"));
const ScriptsView = lazy(() => import("./tactical/views/ScriptsView.jsx"));
const RunsView = lazy(() => import("./tactical/views/RunsView.jsx"));
const AccountView = lazy(() => import("./tactical/views/AccountView.jsx"));

// Apify lives in the Settings drawer now. The /apify and /app/apify paths
// redirect home so old bookmarks don't 404.

// Tiny placeholder while a lazy-loaded route is fetching. Deliberately
// featureless — the chunks are small enough that anything fancier just
// adds flicker.
function RoutePlaceholder() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--tac-bg)" }} />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AnalyticsShell />}>
        <Route index element={<DashboardView />} />
        <Route
          path="dataset"
          element={
            <Suspense fallback={<RoutePlaceholder />}>
              <DatasetView />
            </Suspense>
          }
        />
        <Route
          path="analyze"
          element={
            <Suspense fallback={<RoutePlaceholder />}>
              <AnalyzeView />
            </Suspense>
          }
        />
        <Route
          path="scripts"
          element={
            <Suspense fallback={<RoutePlaceholder />}>
              <ScriptsView />
            </Suspense>
          }
        />
        <Route
          path="runs"
          element={
            <Suspense fallback={<RoutePlaceholder />}>
              <RunsView />
            </Suspense>
          }
        />
        <Route
          path="account"
          element={
            <Suspense fallback={<RoutePlaceholder />}>
              <AccountView />
            </Suspense>
          }
        />
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
