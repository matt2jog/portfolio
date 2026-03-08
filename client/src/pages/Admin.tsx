import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import Footer from "@/components/Footer";
import AdminBioPanel from "@/components/admin/AdminBioPanel";
import AdminProjectsPanel from "@/components/admin/AdminProjectsPanel";
import AdminSkillsPanel from "@/components/admin/AdminSkillsPanel";

type AdminTab = "bio" | "projects" | "skills";

const tabs: { id: AdminTab; label: string }[] = [
  { id: "bio", label: "Bio" },
  { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills" },
];

export default function Admin() {
  const { data: me } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const isAdmin = (me as any)?.role === "admin";
  const [activeTab, setActiveTab] = useState<AdminTab>("bio");

  const activePanel = useMemo(() => {
    if (activeTab === "projects") return <AdminProjectsPanel />;
    if (activeTab === "skills") return <AdminSkillsPanel />;
    return <AdminBioPanel />;
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

  return (
    <div className="min-h-screen bg-black text-white px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
        <button
          onClick={() => apiRequest("POST", "/api/auth/logout").then(() => window.location.reload())}
          className="px-4 py-2 border border-white/20 text-white hover:border-white/60"
        >
          Log out
        </button>
      </div>

      <nav className="border border-white/10 p-2 bg-black/40 sticky top-2 z-10">
        <div className="grid grid-cols-3 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm sm:text-base border ${activeTab === tab.id ? "border-white/60 bg-white/10" : "border-white/20 hover:border-white/40"}`}
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
