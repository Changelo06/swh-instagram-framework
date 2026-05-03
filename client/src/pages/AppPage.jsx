import { useCallback, useState } from "react";
import Header from "../components/Header.jsx";
import SettingsDrawer from "../components/SettingsDrawer.jsx";
import { useApiHealth } from "../components/ApiStatus.jsx";
import Dashboard from "./Dashboard.jsx";

export default function AppPage() {
  const health = useApiHealth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scriptCount, setScriptCount] = useState(3);
  const [analyzerActive, setAnalyzerActive] = useState("idle");
  const [resetCounter, setResetCounter] = useState(0);

  const handleReset = useCallback(() => {
    setResetCounter((c) => c + 1);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <div className="dash-root flex flex-col">
      <Header
        variant="app"
        canReset={analyzerActive !== "idle"}
        onReset={handleReset}
        onOpenSettings={openSettings}
        healthState={health.state}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={closeSettings}
        scriptCount={scriptCount}
        setScriptCount={setScriptCount}
        health={health}
      />

      <main className="flex-1">
        <Dashboard
          health={health}
          scriptCount={scriptCount}
          resetSignal={resetCounter}
          onStageChange={setAnalyzerActive}
          onOpenSettings={openSettings}
        />
      </main>
    </div>
  );
}
