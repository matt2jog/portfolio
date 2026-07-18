import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { AdminAcceptanceModal } from "@/components/AdminAcceptanceModal";
import Footer from "@/components/Footer";
import AdminProjectPresentationPanel from "@/components/admin/AdminProjectPresentationPanel";
import AdminSkillsPanel from "@/components/admin/AdminSkillsPanel";
import AdminPersonalizationPanel from "@/components/admin/AdminPersonalizationPanel";

type AdminTab = "personalization" | "project-presentation" | "skill-presentation";

const tabs: { id: AdminTab; label: string }[] = [
  { id: "personalization", label: "Welcome messages" },
  { id: "project-presentation", label: "Project presentation" },
  { id: "skill-presentation", label: "Skill presentation" },
];

export default function Admin() {
  const { data: me } = useQuery<{ role?: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const isAdmin = me?.role === "admin";
  const [activeTab, setActiveTab] = useState<AdminTab>("personalization");

  // Check if admin needs to accept policies
  useEffect(() => {
    if (isAdmin && !policyAccepted) {
      const checkAcceptance = async () => {
        try {
          const res = await fetch("/api/admin/policy/check-acceptance");
          if (!res.ok) {
            setShowAcceptanceModal(true);
          } else {
            const data = await res.json();
            if (data.accepted) {
              setPolicyAccepted(true);
            } else {
              setShowAcceptanceModal(true);
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error("Failed to check acceptance:", err);
          }
          setShowAcceptanceModal(true);
        }
      };
      checkAcceptance();
    }
  }, [isAdmin, policyAccepted]);

  const handleAcceptPolicies = async () => {
    setIsAccepting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/policy/accept", {});
      await res.json();
      setPolicyAccepted(true);
      setShowAcceptanceModal(false);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Failed to accept policies:", err);
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const activePanel = useMemo(() => {
    if (activeTab === "project-presentation") return <AdminProjectPresentationPanel />;
    if (activeTab === "skill-presentation") return <AdminSkillsPanel />;
    return <AdminPersonalizationPanel />;
  }, [activeTab]);

  if (!me) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Admin Access</h1>
          <a
            href="/auth/google"
            className="inline-flex items-center px-4 py-2 border border-white/20 text-white hover:border-white/60"
          >
            Sign in with Google
          </a>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-white/70">You are not authorized to view this dashboard.</p>
        </div>
      </div>
    );
  }

  if (isAdmin && !policyAccepted) {
    return (
      <div>
        <AdminAcceptanceModal
          isOpen={showAcceptanceModal}
          onAccept={handleAcceptPolicies}
          isLoading={isAccepting}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
        <button
          onClick={() => apiRequest("POST", "/api/auth/logout").then(async (response) => {
            const body = await response.json() as { logout_url?: string };
            window.location.assign(body.logout_url || "/");
          })}
          className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
        >
          Log out
        </button>
      </div>

      <p className="max-w-[65ch] text-sm leading-6 text-white/70">
        Canonical career content is managed in Admin Dashboard. This page owns only Portfolio presentation.
      </p>

      <nav data-testid="admin-tabs" aria-label="Portfolio administration" className="border border-white/10 p-2 bg-black/40 sticky top-2 z-10">
        <div className="grid gap-2 sm:grid-cols-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`admin-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`px-3 py-2 text-sm border ${activeTab === tab.id ? "border-white/60 bg-white/10" : "border-white/20 hover:border-white/40"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {activePanel}

      <Footer />
    </div>
  );
}
