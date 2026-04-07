import ProjectChat from "@/components/ProjectChat";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";

interface ProjectRecord {
  id: string;
  title: string;
  description: string;
  tech: string[];
}

export default function ProjectChatPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/portfolio/:projectId/chat");
  const projectId = params?.projectId ?? "";

  const { data: project, isLoading, error } = useQuery<ProjectRecord>({
    queryKey: ["/api/public/projects", projectId],
    enabled: Boolean(projectId),
  });

  const handleClose = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const rotation = searchParams.get('rotation');
    if (rotation !== null) {
      setLocation(`/portfolio?rotation=${rotation}`);
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/portfolio");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f] px-6 text-sm text-gray-400">
        Loading project chat...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0b0f] px-6 text-center">
        <p className="text-lg font-medium text-white">Project chat unavailable</p>
        <p className="mt-2 text-sm text-gray-500">
          The requested project could not be loaded.
        </p>
        <button
          type="button"
          onClick={() => setLocation("/portfolio")}
          className="mt-6 rounded border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:border-primary/40 hover:text-white"
        >
          Back to Portfolio
        </button>
      </div>
    );
  }

  return (
    <ProjectChat
      project={project}
      onClose={handleClose}
      standalone
    />
  );
}
