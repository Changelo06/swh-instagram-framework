import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import SettingsDrawer from "./SettingsDrawer.jsx";
import { useApiHealth } from "../../components/ApiStatus.jsx";
import { CsvProvider, useCsv } from "../state/CsvContext.jsx";
import ResetConfirmModal from "../widgets/ResetConfirmModal.jsx";

const THEME_STORAGE_KEY = "tac-theme";

export default function AnalyticsShell() {
  return (
    <CsvProvider>
      <ShellInner />
    </CsvProvider>
  );
}

function ShellInner() {
  const health = useApiHealth();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scriptCount, setScriptCount] = useState(3);
  const [search, setSearch] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem(THEME_STORAGE_KEY) === "light"
      ? "light"
      : "dark";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const { reset } = useCsv();
  const sidebarWidth = collapsed ? 56 : 200;

  return (
    <div
      className={`tac-root${theme === "light" ? " tac-theme-light" : ""}`}
      style={{
        position: "relative",
        minHeight: "100dvh",
        paddingLeft: sidebarWidth,
        paddingTop: 44,
        transition: "padding-left 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          left: sidebarWidth,
          right: 0,
          height: 44,
          zIndex: 30,
          transition: "left 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <Topbar
          healthState={health.state}
          onReset={() => setResetConfirm(true)}
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      <main
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "calc(100dvh - 44px)",
        }}
      >
        <Outlet
          context={{
            search,
            setSearch,
            health,
            scriptCount,
            setScriptCount,
          }}
        />
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        health={health}
        theme={theme}
        onThemeChange={setTheme}
      />

      <ResetConfirmModal
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        onConfirm={reset}
      />
    </div>
  );
}
