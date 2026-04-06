import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { getQueryFn } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConsentBanner } from "@/components/ConsentBanner";
import { getStoredConsent, isGlobalOptOutEnabled } from "@/lib/consent";
import { detectJurisdiction } from "@/lib/geoip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import katex from "katex";
import "katex/dist/katex.min.css";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import Tree from "@/pages/Tree";
import Activity from "@/pages/Activity";
import Portfolio from "@/pages/Portfolio";
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

function dispatchConsentResolved() {
  window.dispatchEvent(new Event("consent-resolved"));
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
        dispatchConsentResolved();
        return;
      }

      const shouldShow = !hasConsent && !isLegalPage;

      setShowBanner(shouldShow);
      setIsLoaded(true);

      // If no banner needed, consent is already settled
      if (!shouldShow) {
        dispatchConsentResolved();
      }
    })();
  }, [location]);

  if (!isLoaded) return null;

  return (
    <ConsentBanner
      isOpen={showBanner}
      onClose={() => {
        setShowBanner(false);
        dispatchConsentResolved();
      }}
      jurisdiction={jurisdiction}
    />
  );
}

function renderKatexBody(src: string): string {
  try {
    return src
      .replace(/\$\$([^$]+)\$\$/g, (_, math) =>
        katex.renderToString(math, { displayMode: true, throwOnError: false })
      )
      .replace(/\$([^$\n]+)\$/g, (_, math) =>
        katex.renderToString(math, { displayMode: false, throwOnError: false })
      );
  } catch {
    return src;
  }
}

function UrlTailoringInterceptor() {
  const [open, setOpen] = useState(false);
  const [dialogData, setDialogData] = useState<{ title: string; body: string } | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("m");
    if (!m) return;

    function attemptFetch() {
      if (fetchedRef.current) return;
      fetchedRef.current = true;
      fetch(`/api/public/url-tailoring/${encodeURIComponent(m!)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.title && data?.body) {
            setDialogData({ title: data.title, body: data.body });
            setOpen(true);
          }
        })
        .catch(() => {});
    }

    // If consent is already settled, show after a short delay so the page renders first
    const alreadySettled = getStoredConsent() !== null || isGlobalOptOutEnabled();
    if (alreadySettled) {
      const t = setTimeout(attemptFetch, 400);
      return () => clearTimeout(t);
    }

    // Otherwise wait for consent banner to resolve
    window.addEventListener("consent-resolved", attemptFetch, { once: true });
    return () => window.removeEventListener("consent-resolved", attemptFetch);
  }, []);

  if (!dialogData) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-black border border-white/20 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{dialogData.title}</DialogTitle>
        </DialogHeader>
        <div
          className="text-sm text-white/80 leading-relaxed mt-2 katex-body"
          dangerouslySetInnerHTML={{ __html: renderKatexBody(dialogData.body) }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tree" component={Tree} />
      <Route path="/activity" component={Activity} />
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
        <UrlTailoringInterceptor />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
