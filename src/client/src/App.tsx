import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  FirstVisitIntro,
  shouldShowFirstVisitIntro,
  INTRO_FORCE_SHOW_KEY,
  INTRO_WELCOME_SLUG_KEY,
} from "@/components/FirstVisitIntro";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Tree from "@/pages/Tree";
import Activity from "@/pages/Activity";
import Portfolio from "@/pages/Portfolio";
import ProjectChatPage from "@/pages/ProjectChatPage";
import About from "@/pages/About";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";

// Discards the retired campaign parameter without retaining it or sending it elsewhere.
function CampaignQueryCleaner() {
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

    window.history.replaceState(window.history.state, "", cleanUrl);
  }, [location]);

  return null;
}

// Detects ?welcome=<slug>, stores the slug and a force-show flag in localStorage,
// then strips the param and reloads so the intro plays even if the TTL is active.
function WelcomeProcessor() {
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const welcomeSlug = params.get("welcome");
    if (!welcomeSlug) return;

    params.delete("welcome");
    const newSearch = params.toString();
    const cleanUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash;

    window.localStorage.setItem(INTRO_WELCOME_SLUG_KEY, welcomeSlug);
    window.localStorage.setItem(INTRO_FORCE_SHOW_KEY, "1");
    window.location.replace(cleanUrl);
  }, [location]);

  return null;
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const [showIntro, setShowIntro] = useState(() => location === "/" && shouldShowFirstVisitIntro());
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (location === "/" && shouldShowFirstVisitIntro()) {
      setShowIntro(true);
    } else {
      setShowIntro(false);
    }
  }, [location]);

  // Fetch the personalized welcome message for the intro animation, if a slug is stored.
  useEffect(() => {
    const slug = typeof window !== "undefined"
      ? window.localStorage.getItem(INTRO_WELCOME_SLUG_KEY)
      : null;
    if (!slug) return;

    fetch(`/api/public/welcome-message?welcome=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.message) setWelcomeMessage(data.message);
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CampaignQueryCleaner />
        <WelcomeProcessor />
        <Toaster />
        <Router />
        {showIntro && location === "/" && (
          <FirstVisitIntro
            onComplete={() => setShowIntro(false)}
            welcomeMessage={welcomeMessage}
          />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
