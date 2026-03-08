import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { getQueryFn } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import Tree from "@/pages/Tree";
import Activity from "@/pages/Activity";
import Portfolio from "@/pages/Portfolio";
import About from "@/pages/About";
import { attachLogRocketIp, identifyLogRocketUser, trackLogRocketRoute } from "./lib/logrocket";

function LogRocketBridge() {
  const [location] = useLocation();
  const { data: me } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    trackLogRocketRoute(location, window.location.search);
  }, [location]);

  useEffect(() => {
    const emit = () => {
      trackLogRocketRoute(window.location.pathname, window.location.search);
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      const result = originalPushState.apply(this, args as any);
      window.dispatchEvent(new Event("app:urlchange"));
      return result;
    };

    window.history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args as any);
      window.dispatchEvent(new Event("app:urlchange"));
      return result;
    };

    window.addEventListener("popstate", emit);
    window.addEventListener("app:urlchange", emit);
    emit();

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", emit);
      window.removeEventListener("app:urlchange", emit);
    };
  }, []);

  useEffect(() => {
    identifyLogRocketUser((me as any) ?? null);
  }, [me]);

  useEffect(() => {
    attachLogRocketIp();
  }, []);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tree" component={Tree} />
      <Route path="/activity" component={Activity} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/about" component={About} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LogRocketBridge />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
