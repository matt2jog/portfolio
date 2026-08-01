import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { AdminAcceptanceModal } from "@/components/AdminAcceptanceModal";
import Footer from "@/components/Footer";
import AdminPersonalizationPanel from "@/components/admin/AdminPersonalizationPanel";

export default function Admin() {
  const { data: me } = useQuery<{ role?: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const isAdmin = me?.role === "admin";

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
        } catch {
          if (import.meta.env.DEV) {
            console.error("Policy acceptance check failed");
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
    } catch {
      if (import.meta.env.DEV) {
        console.error("Policy acceptance update failed");
      }
    } finally {
      setIsAccepting(false);
    }
  };

  if (!me) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Admin Access</h1>
          <a
            href="/auth/login"
            className="inline-flex items-center px-4 py-2 border border-white/20 text-white hover:border-white/60"
          >
            Sign in
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
        <h1 className="text-2xl sm:text-3xl font-bold">Portfolio settings</h1>
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
        Career data is read-only in Portfolio. Manage projects, experience, education, biography, and skills in{" "}
        <a className="text-white underline underline-offset-4" href="https://admin.2jog.dev">
          Admin Dashboard
        </a>
        . This page manages only Portfolio welcome messages.
      </p>

      <AdminPersonalizationPanel />

      <Footer />
    </div>
  );
}
