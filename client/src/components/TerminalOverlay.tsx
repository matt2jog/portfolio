import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { Terminal } from "lucide-react";

type Log = {
  id: number;
  timestamp: string;
  source: "SYS" | "USR" | "NET" | "LOG";
  message: string;
  isTelemetry?: boolean;
};

export function TerminalOverlay() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [logsEnabled, setLogsEnabled] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Stale closure protection
  const logsEnabledRef = useRef(logsEnabled);
  const historyRef = useRef(history);
  
  useEffect(() => {
    logsEnabledRef.current = logsEnabled;
    historyRef.current = history;
  }, [logsEnabled, history]);

  const placeholders = [
    'type "help" for list of all commands',
    'ls',
    'pwd',
    'cd projects',
    'cd bio',
    'cd contact',
    'clear',
    'disable logs'
  ];

  // Placeholder Animation
  useEffect(() => {
    let currentIdx = 0;
    let charIdx = 0;
    let isDeleting = false;
    let timeout: NodeJS.Timeout;

    const animatePlaceholder = () => {
      const currentText = placeholders[currentIdx];
      
      if (isDeleting) {
        setPlaceholder(currentText.substring(0, charIdx - 1));
        charIdx--;
      } else {
        setPlaceholder(currentText.substring(0, charIdx + 1));
        charIdx++;
      }

      let speed = isDeleting ? 50 : 100;

      if (!isDeleting && charIdx === currentText.length) {
        speed = 2000; // Wait at end
        isDeleting = true;
      } else if (isDeleting && charIdx === 0) {
        isDeleting = false;
        currentIdx = (currentIdx + 1) % placeholders.length;
        speed = 500;
      }

      timeout = setTimeout(animatePlaceholder, speed);
    };

    animatePlaceholder();
    return () => clearTimeout(timeout);
  }, []);

  const addLog = (source: "SYS" | "USR" | "NET" | "LOG", message: string, isTelemetryOverride?: boolean) => {
    const isLog = source === "LOG" || isTelemetryOverride;
    // Always check the ref to avoid stale state in async/event callbacks
    if (isLog && !logsEnabledRef.current) return;
    
    setLogs((prev) => {
      const newLogs = [
        ...prev,
        {
          id: Date.now() + Math.random(),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          source,
          message,
          isTelemetry: isTelemetryOverride || source === "LOG"
        },
      ];
      return newLogs;
    });
  };

  const logEntries = logs.filter(l => l.isTelemetry);
  const systemEntries = logs.filter(l => !l.isTelemetry);

  useEffect(() => {
    const handleScroll = () => {
      // Significantly reduced frequency to prevent feedback loops and scroll-lock
      if (logsEnabledRef.current && Math.random() > 0.995) {
        addLog("LOG", `Viewport Scroll: Y=${Math.round(window.scrollY)}`);
      }
    };

    const handleCustomLog = (e: any) => {
      if (logsEnabledRef.current) addLog("LOG", e.detail.message);
    };

    let idleTimer: NodeJS.Timeout;
    let lastMousePos = { x: 0, y: 0 };
    let lastLoggedPos = { x: -1, y: -1 };

    const handleIdle = (e: MouseEvent) => {
      lastMousePos = { x: e.clientX, y: e.clientY };
      clearTimeout(idleTimer);
      
      idleTimer = setTimeout(() => {
        if (!logsEnabledRef.current) return;
        if (lastMousePos.x === lastLoggedPos.x && lastMousePos.y === lastLoggedPos.y) return;

        const sections = ['projects', 'about', 'contact'];
        let currentSection = "";
        for (const id of sections) {
          const el = document.getElementById(id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) {
              currentSection = id;
              break;
            }
          }
        }
        const context = currentSection ? `viewing [${currentSection}]` : "reading content";
        addLog("LOG", `Interest detection: viewer likely ${context}, interest logged...`);
        lastLoggedPos = { ...lastMousePos };
      }, 6000); // 6 seconds idle
    };

    const handleCopyHighlight = () => {
      if (!logsEnabledRef.current) return;
      const selection = window.getSelection()?.toString();
      if (selection && selection.trim().length > 5) {
        addLog("LOG", `Text highlighted: logged possible interest in "${selection.trim().substring(0, 20)}${selection.trim().length > 20 ? '...' : ''}"`);
      }
    };

    const handleCopyAction = () => {
      if (!logsEnabledRef.current) return;
      const selection = window.getSelection()?.toString();
      if (selection) {
        addLog("LOG", `Text copied: logged possible interest in "${selection.trim().substring(0, 20)}${selection.trim().length > 20 ? '...' : ''}"`);
      }
    };

    const runBootSequence = (ip: string) => {
      const bootSequence = [
        { source: "NET", message: `New user [ip=${ip}] connected...` },
        { source: "SYS", message: "Initializing Portfolio Kernel v2.0..." },
        { source: "SYS", message: "System ready. Awaiting input." },
      ] as const;

      let delay = 0;
      bootSequence.forEach((log) => {
        delay += 800 + Math.random() * 1000;
        setTimeout(() => {
          addLog(log.source, log.message);
        }, delay);
      });
    };

    const resolveIp = async () => {
      try {
        const res = await fetch("/api/public/ip", { credentials: "include" });
        if (!res.ok) throw new Error("ip lookup failed");
        const data = await res.json();
        const ip = data?.ip || "unknown";
        setIpAddress(ip);
        runBootSequence(ip);
      } catch {
        runBootSequence("unknown");
      }
    };

    resolveIp();

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("terminal-log", handleCustomLog);
    window.addEventListener("mousemove", handleIdle);
    window.addEventListener("mouseup", handleCopyHighlight);
    window.addEventListener("copy", handleCopyAction);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("terminal-log", handleCustomLog);
      window.removeEventListener("mousemove", handleIdle);
      window.removeEventListener("mouseup", handleCopyHighlight);
      window.removeEventListener("copy", handleCopyAction);
      clearTimeout(idleTimer);
    };
  }, []);

  const [splitRatio, setSplitRatio] = useState(50); // percentage for top pane
  const telemetryContainerRef = useRef<HTMLDivElement>(null);
  const systemContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (containerRef: React.RefObject<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    // Use a small delay to ensure DOM update
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 0);
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(telemetryContainerRef);
    }
  }, [logEntries.length, isOpen]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(systemContainerRef);
    }
  }, [systemEntries.length, isOpen]);
  const isDragging = useRef(false);

  const startDragging = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    document.addEventListener("mousemove", handleDragging as any);
    document.addEventListener("mouseup", stopDragging);
    document.addEventListener("touchmove", handleDragging as any);
    document.addEventListener("touchend", stopDragging);
  };

  const stopDragging = () => {
    isDragging.current = false;
    document.removeEventListener("mousemove", handleDragging as any);
    document.removeEventListener("mouseup", stopDragging);
    document.removeEventListener("touchmove", handleDragging as any);
    document.removeEventListener("touchend", stopDragging);
  };

  const handleDragging = (e: MouseEvent | TouchEvent) => {
    if (!isDragging.current) return;
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const terminalElement = document.getElementById("terminal-container");
    if (!terminalElement) return;

    const rect = terminalElement.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const percentage = (relativeY / rect.height) * 100;
    
    // Constraints
    if (percentage > 20 && percentage < 80) {
      setSplitRatio(percentage);
    }
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = inputValue.trim().toLowerCase();
    if (!cmd) return;

    addLog("USR", `> ${inputValue}`);

    const updateHistory = (sectionId: string) => {
      setHistory(prev => {
        const last = prev[prev.length - 1];
        if (last === sectionId) return prev;
        return [...prev, sectionId];
      });
    };

    switch (cmd) {
      case "help":
        addLog("SYS", "AVAILABLE COMMANDS:\nhelp - Display this manual\nls - List directory contents\npwd - Print working navigation stack\nclear - Purge system kernel display\ndisable logs - Suspend telemetry logging\nenable logs - Resume telemetry logging\necho [text] - Output text to terminal\ncd [section] - Navigate to target\ncd .. - Return to previous section\nsudo -s - root user logon for admin panel");
        break;
      case "ls":
        addLog("SYS", "projects/  bio/  contact/");
        break;
      case "pwd":
        const path = history.length > 0 ? `root/${history.join("/")}` : "root/";
        addLog("SYS", path);
        break;
      case "clear":
        setLogs([]);
        break;
      case "disable logs":
        setLogsEnabled(false);
        addLog("SYS", "Telemetry logging suspended. System monitoring continues in silent mode.");
        break;
      case "enable logs":
        setLogsEnabled(true);
        addLog("SYS", "Telemetry logging resumed. External node activity being recorded.");
        break;
      case "cd ..":
        if (history.length > 0) {
          const newHistory = [...history];
          newHistory.pop();
          const target = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
          
          if (target) {
            const element = document.getElementById(target);
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
              addLog("NET", `Returning to ./${target}...`);
            } else {
              addLog("SYS", `Error: Target ./${target} not found.`);
            }
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
            addLog("NET", "Returning to ./...");
          }
          setHistory(newHistory);
        } else {
          addLog("SYS", "Error: Already at root/.");
        }
        break;
      case "cd projects":
        document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" });
        addLog("NET", "Navigating to ./projects...");
        updateHistory("projects");
        break;
      case "cd bio":
      case "cd about":
        document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
        addLog("NET", "Navigating to ./bio...");
        updateHistory("about");
        break;
      case "cd contact":
        document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
        addLog("NET", "Navigating to ./contact...");
        updateHistory("contact");
        break;
      case "sudo -s":
        window.location.href = "/admin";
        break;
      default:
        if (cmd.startsWith("echo ")) {
          addLog("SYS", inputValue.substring(5));
          break;
        }
        addLog("SYS", `Error: Command "${cmd}" not found. Type "help" for list.`);
    }

    setInputValue("");
  };

  return (
    <div className="fixed bottom-0 right-4 z-50 w-full max-w-[340px] font-mono text-xs hidden md:block">
      <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden shadow-2xl">
        <div 
          className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setTimeout(() => inputRef.current?.focus(), 100);
          }}
        >
          <div className="flex items-center gap-2 text-primary">
            <Terminal size={14} />
            <span className="uppercase tracking-wider font-bold text-[10px]">System Terminal</span>
          </div>
          <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              id="terminal-container"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "50vh", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-col overflow-hidden"
            >
              {/* Upper Half: Telemetry */}
              <div 
                ref={telemetryContainerRef}
                className="overflow-y-auto flex flex-col relative scrollbar-custom pb-3"
                style={{ height: `${splitRatio}%` }}
              >
                <div className="text-[9px] uppercase text-white/20 px-3 mb-2 font-bold tracking-widest flex items-center gap-2 sticky top-0 bg-black py-2 z-10 border-b border-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                   <div className="w-1 h-1 bg-white/20 rounded-full" />
                   Telemetry_Log
                </div>
                <div className="space-y-1 px-3">
                  {logEntries.map((log) => (
                    <div 
                      key={log.id}
                      className="flex gap-2 text-[9px] mb-0.5"
                    >
                      <span className="text-white/20 shrink-0">[{log.timestamp}]</span>
                      <span className="font-bold text-primary shrink-0">LOG</span>
                      <span className="text-white/40 font-medium break-words leading-tight">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resizer Handle */}
              <div 
                className="h-1 bg-white/5 hover:bg-primary/50 cursor-ns-resize transition-colors flex items-center justify-center group shrink-0"
                onMouseDown={startDragging}
                onTouchStart={startDragging}
              >
                <div className="w-8 h-px bg-white/20 group-hover:bg-primary/50" />
              </div>

              {/* Lower Half: System Output & Input */}
              <div 
                className="flex flex-col relative"
                style={{ height: `${100 - splitRatio}%` }}
              >
                <div className="text-[9px] uppercase text-white/20 px-3 mb-2 font-bold tracking-widest flex items-center gap-2 sticky top-0 bg-black py-2 z-10 border-b border-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.5)] shrink-0">
                   <div className="w-1 h-1 bg-white/20 rounded-full" />
                   System_Kernel
                </div>
                
                <div 
                  ref={systemContainerRef}
                  className="flex-1 overflow-y-auto scrollbar-custom px-3 py-1"
                >
                  <div className="space-y-1.5 mb-3">
                    {systemEntries.map((log) => (
                      <div 
                        key={log.id}
                        className="flex gap-2 text-[10px] mb-1"
                      >
                        <span className="text-white/30 shrink-0">[{log.timestamp}]</span>
                        <span className={`font-bold shrink-0 ${
                          log.source === "SYS" ? "text-blue-900" : 
                          log.source === "NET" ? "text-green-400" : "text-yellow-400"
                        }`}>
                          {log.source}
                        </span>
                        <span className="text-white/70 font-medium break-words leading-tight whitespace-pre-wrap flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <form 
                  onSubmit={handleCommand} 
                  className="flex items-center gap-2 border-t border-white/5 bg-black py-2 z-20 px-3 shrink-0"
                >
                  <span className="text-primary font-bold shrink-0">{'>'}</span>
                  <div className="relative flex-1 flex items-center">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => {
                        setIsFocused(false);
                        if (!inputValue.trim()) setInputValue("");
                      }}
                      onChange={(e) => setInputValue(e.target.value)}
                      className="absolute inset-0 w-full bg-transparent border-none outline-none text-transparent p-0 m-0 focus:ring-0 z-10 caret-transparent"
                    />
                    <div className="flex items-center pointer-events-none w-full">
                      <span className="text-white whitespace-pre">{inputValue}</span>
                      {!isFocused && !inputValue.trim() && (
                        <span className="text-white/20 italic whitespace-nowrap overflow-hidden">
                          {placeholder}
                        </span>
                      )}
                      <motion.div
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-2 h-4 bg-primary ml-0.5"
                      />
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
