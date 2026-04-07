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
import { attachLogRocketIp, identifyLogRocketUser, trackLogRocketRoute } from "@/lib/logrocket";

function LogRocketBridge() {
  const [location] = useLocation();
  const [consentGranted, setConsentGranted] = useState(false);
  const { data: me } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Listen for consent changes via ConsentManager callback
  useEffect(() => {
    const handleConsentChange = () => {
      setConsentGranted(true);
    };
    window.addEventListener("consent-granted", handleConsentChange);
    return () => window.removeEventListener("consent-granted", handleConsentChange);
  }, []);

  useEffect(() => {
    trackLogRocketRoute(location, window.location.search);
  }, [location, consentGranted]);

  useEffect(() => {
    const emit = () => trackLogRocketRoute(window.location.pathname, window.location.search);
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

function ConsentManager() {
  const [showBanner, setShowBanner] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    (async () => {
      const jurisdiction = await detectJurisdiction();
      setJurisdiction(jurisdiction);

      const hasConsent = getStoredConsent() !== null;
      const globalOptOut = isGlobalOptOutEnabled();

      // Don't show banner on legal doc pages
      const isLegalPage = ["/privacy", "/terms", "/tracking"].includes(location);

      // Respect browser-level privacy controls.
      if (globalOptOut) {
        setShowBanner(false);
        setIsLoaded(true);
        return;
      }

      const shouldShow = !hasConsent && !isLegalPage;
      
      setShowBanner(shouldShow);
      setIsLoaded(true);
    })();
  }, [location]);



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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConsentManager />
        <LogRocketBridge />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
