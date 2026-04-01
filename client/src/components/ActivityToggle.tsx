import { motion } from "framer-motion";
import { Github, Linkedin } from "lucide-react";

interface ActivityToggleProps {
  activeTab: "github" | "linkedin";
  onChange: (tab: "github" | "linkedin") => void;
}

export function ActivityToggle({ activeTab, onChange }: ActivityToggleProps) {
  const tabs = [
    { id: "github", label: "GitHub", icon: Github },
    { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  ] as const;

  return (
    <div className="flex space-x-1 bg-background/60 p-1.5 rounded-full mx-auto w-fit mb-12 shadow-inner border border-border/50 backdrop-blur-sm">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id as "github" | "linkedin")}
            className={`relative flex items-center space-x-2 px-6 py-2.5 text-sm font-medium transition-colors outline-none rounded-full
              ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"}
            `}
          >
            {isActive && (
              <motion.div
                layoutId="active-tab"
                className="absolute inset-0 bg-muted/80 shadow-md border border-border/50 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center space-x-2">
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
