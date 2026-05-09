import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import SettingsDrawer from "./SettingsDrawer.jsx";
import { useApiHealth } from "../../components/ApiStatus.jsx";
import { CsvProvider, useCsv } from "../state/CsvContext.jsx";
import ResetConfirmModal from "../widgets/ResetConfirmModal.jsx";
import LoginView from "../views/LoginView.jsx";

const THEME_STORAGE_KEY = "tac-theme";

// Auth gate. Until /api/me confirms a session, the rest of the shell stays
// unmounted so the CsvProvider doesn't fire any /api/* requests prematurely.
// On 401 we show LoginView; on success the form calls back into here and we
// re-fetch /api/me to confirm + transition.
export default function AnalyticsShell() {
  const [authState, setAuthState] = useState("checking"); // "checking" | "in" | "out"
  const [user, setUser] = useState(null);

  const refreshSession = async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setUser(data.user || null);
        setAuthState("in");
      } else {
        setUser(null);
        setAuthState("out");
      }
    } catch {
      setUser(null);
      setAuthState("out");
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  if (authState === "checking") {
    // Tiny placeholder so the page isn't blank while /api/me resolves.
    return (
      <div
        className="tac-root"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          color: "var(--tac-mute)",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  if (authState === "out") {
    return <LoginView onSignedIn={refreshSession} />;
  }

  return (
    <CsvProvider>
      <ShellInner currentUser={user} />
    </CsvProvider>
  );
}

// eslint-disable-next-line no-unused-vars
function ShellInner({ currentUser }) {
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
  const sidebarWidth = collapsed ? 56 : 216;

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
