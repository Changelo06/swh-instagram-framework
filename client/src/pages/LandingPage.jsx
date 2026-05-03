import { lazy, Suspense, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import Footer from "../components/Footer.jsx";
import SettingsDrawer from "../components/SettingsDrawer.jsx";
import { useApiHealth } from "../components/ApiStatus.jsx";

import Hero from "../sections/Hero.jsx";
import ProofBar from "../sections/ProofBar.jsx";
import ProblemFraming from "../sections/ProblemFraming.jsx";
import HowItWorks from "../sections/HowItWorks.jsx";
import SixLayers from "../sections/SixLayers.jsx";
import SampleReportPreview from "../sections/SampleReportPreview.jsx";
import VoiceManifesto from "../sections/VoiceManifesto.jsx";
import Outcomes from "../sections/Outcomes.jsx";
import Testimonials from "../sections/Testimonials.jsx";
import Faq from "../sections/Faq.jsx";
import FinalCta from "../sections/FinalCta.jsx";

const SampleReportModal = lazy(() =>
  import("../components/SampleReportModal.jsx")
);

export default function LandingPage() {
  const navigate = useNavigate();
  const health = useApiHealth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scriptCount, setScriptCount] = useState(3);
  const [sampleOpen, setSampleOpen] = useState(false);

  const goToApp = useCallback(() => navigate("/app"), [navigate]);
  const openSample = useCallback(() => setSampleOpen(true), []);
  const closeSample = useCallback(() => setSampleOpen(false), []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        variant="landing"
        onOpenSettings={() => setSettingsOpen(true)}
        healthState={health.state}
        onScrollToAnalyze={goToApp}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        scriptCount={scriptCount}
        setScriptCount={setScriptCount}
        health={health}
      />

      <main className="flex-1">
        <Hero onScrollToAnalyze={goToApp} onOpenSample={openSample} />
        <ProofBar />
        <ProblemFraming />
        <HowItWorks />
        <SixLayers />
        <SampleReportPreview onOpenSample={openSample} />
        <VoiceManifesto />
        <Outcomes />
        <Testimonials />
        <Faq />
        <FinalCta onScrollToAnalyze={goToApp} />
      </main>

      <Footer />

      {sampleOpen && (
        <Suspense fallback={null}>
          <SampleReportModal onClose={closeSample} />
        </Suspense>
      )}
    </div>
  );
}
