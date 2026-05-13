import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import SettingsDrawer from "./SettingsDrawer.jsx";
import { useApiHealth } from "../../components/ApiStatus.jsx";
import { CsvProvider, useCsv } from "../state/CsvContext.jsx";
import ResetConfirmModal from "../widgets/ResetConfirmModal.jsx";
import VaultGate from "../views/VaultGate.jsx";
import { hasBridge, vaultStatus } from "../../lib/chiqo.js";

const THEME_STORAGE_KEY = "tac-theme";

// Vault gate (Phase 2.4). Replaces the previous /api/me + LoginView
// auth flow. Sequence on every boot:
//
//   1. Ask the main process whether a vault exists and is unlocked
//      (chiqo.vault.status() via the preload bridge)
//   2. If no vault → render VaultGate's onboarding flow
//   3. If vault exists but locked → render VaultGate's unlock screen
//   4. If unlocked → render the actual shell (CsvProvider + ShellInner)
//
// We don't poll. The vault state only changes through VaultGate's own
// flows, which call onUnlocked() back into here when they succeed.
export default function AnalyticsShell() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  // Optimistic first-render check: ask the main process directly, and
  // skip mounting VaultGate at all if we're already unlocked (avoids a
  // brief flash of the lock screen when the user navigates around the
  // app while a session is live).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasBridge()) {
        // No Electron bridge — VaultGate will render the BridgeMissing
        // notice instead of trying to onboard / unlock.
        if (!cancelled) setChecked(true);
        return;
      }
      try {
        const s = await vaultStatus();
        if (cancelled) return;
        if (s.exists && !s.locked) setVaultUnlocked(true);
      } catch {
        // fall through — VaultGate will surface the failure
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked) {
    // Bridge probe is in flight. Render a featureless placeholder so
    // we don't briefly show VaultGate before the optimistic check
    // resolves.
    return (
      <div
        className="tac-root"
        style={{
          minHeight: "100dvh",
          background: "var(--tac-bg)",
        }}
      />
    );
  }

  if (!vaultUnlocked) {
    return <VaultGate onUnlocked={() => setVaultUnlocked(true)} />;
  }

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
