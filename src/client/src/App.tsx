import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getQueryFn } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConsentBanner } from "@/components/ConsentBanner";
import { FirstVisitIntro, shouldShowFirstVisitIntro } from "@/components/FirstVisitIntro";
import { getStoredConsent, isGlobalOptOutEnabled } from "@/lib/consent";
import { detectJurisdiction } from "@/lib/geoip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import Tree from "@/pages/Tree";
import Activity from "@/pages/Activity";
import Portfolio from "@/pages/Portfolio";
import ProjectChatPage from "@/pages/ProjectChatPage";
import About from "@/pages/About";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Tracking from "@/pages/Tracking";
import { attachLogRocketIp, identifyLogRocketUser, trackLogRocketRoute, emitLogRocketUuidEvent } from "@/lib/logrocket";
import { initBrowserTracking, storeTrEn } from "@/lib/tracking";

function LogRocketBridge() {
  const [location] = useLocation();
  const [consentGranted, setConsentGranted] = useState(false);
  const { data: me } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    const handleConsentChange = () => {
      setConsentGranted(true);
    };
    window.addEventListener("consent-granted", handleConsentChange);
    return () => window.removeEventListener("consent-granted", handleConsentChange);
  }, []);

  useEffect(() => {
    trackLogRocketRoute(location);
  }, [location, consentGranted]);

  useEffect(() => {
    const emit = () => trackLogRocketRoute(window.location.pathname);
    window.addEventListener("popstate", emit);
    window.addEventListener("hashchange", emit);
    return () => {
      window.removeEventListener("popstate", emit);
      window.removeEventListener("hashchange", emit);
    };
  }, [consentGranted, location]);

  useEffect(() => {
    identifyLogRocketUser((me as any) ?? null);
  }, [me, consentGranted]);

  useEffect(() => {
    attachLogRocketIp();
  }, [consentGranted]);

  return null;
}

// Initializes browser-side UUID tracking (DB + LogRocket) after consent is established.
function TrackingBridge() {
  const [consentGranted, setConsentGranted] = useState(() => {
    const c = getStoredConsent();
    return c !== null && c.user_action !== "reject_all";
  });

  useEffect(() => {
    const handle = () => setConsentGranted(true);
    window.addEventListener("consent-granted", handle);
    return () => window.removeEventListener("consent-granted", handle);
  }, []);

  useEffect(() => {
    if (!consentGranted) return;
    initBrowserTracking();
    emitLogRocketUuidEvent();
  }, [consentGranted]);

  return null;
}

// Detects tr_en= on any page, stores (if consented), then strips param and reloads.
function TrEnProcessor() {
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trEn = params.get("tr_en");
    if (!trEn) return;

    params.delete("tr_en");
    const newSearch = params.toString();
    const cleanUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash;

    // storeTrEn is a no-op if user hasn't consented
    storeTrEn(trEn).finally(() => {
      window.location.replace(cleanUrl);
    });
  }, [location]);

  return null;
}

function ConsentManager({ disabled = false }: { disabled?: boolean }) {
  const [showBanner, setShowBanner] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    if (disabled) {
      setShowBanner(false);
      return;
    }

    (async () => {
      const jurisdiction = await detectJurisdiction();
      setJurisdiction(jurisdiction);

      const hasConsent = getStoredConsent() !== null;
      const globalOptOut = isGlobalOptOutEnabled();

      const isLegalPage = ["/privacy", "/terms", "/tracking"].includes(location);

      if (globalOptOut) {
        setShowBanner(false);
        setIsLoaded(true);
        return;
      }

      const shouldShow = !hasConsent && !isLegalPage;
      setShowBanner(shouldShow);
      setIsLoaded(true);
    })();
  }, [disabled, location]);

  if (!isLoaded) return null;

  return (
    <ConsentBanner
      isOpen={showBanner}
      onClose={() => setShowBanner(false)}
      jurisdiction={jurisdiction}
    />
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tree" component={Tree} />
      <Route path="/activity" component={Activity} />
      <Route path="/portfolio/:projectId/chat" component={ProjectChatPage} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/about" component={About} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/tracking" component={Tracking} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const [showIntro, setShowIntro] = useState(() => location === "/" && shouldShowFirstVisitIntro());
  const consentDisabled = showIntro && location === "/";

  useEffect(() => {
    if (location === "/" && shouldShowFirstVisitIntro()) {
      setShowIntro(true);
    } else {
      setShowIntro(false);
    }
  }, [location]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TrEnProcessor />
        <ConsentManager disabled={consentDisabled} />
        <LogRocketBridge />
        <TrackingBridge />
        <Toaster />
        <Router />
        {showIntro && location === "/" && (
          <FirstVisitIntro onComplete={() => setShowIntro(false)} />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
