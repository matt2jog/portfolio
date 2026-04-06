import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Send, Bot, User, ChevronDown, Loader2, GripVertical } from "lucide-react";
import ChatMarkdown from "./ChatMarkdown";

interface AiModel {
  id: string;
  label: string;
  modelId: string;
  provider: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProjectChatProps {
  project: {
    id: string;
    title: string;
    description: string;
    tech: string[];
  };
  onClose: () => void;
}

export default function ProjectChat({ project, onClose }: ProjectChatProps) {
  const { data: models = [] } = useQuery<AiModel[]>({
    queryKey: ["/api/public/ai-models"],
  });

  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Resizable width (desktop only)
  const DEFAULT_WIDTH = 528; // 440 * 1.2
  const MIN_WIDTH = 360;
  const MAX_WIDTH = 800;
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDragStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [panelWidth]);

  // Auto-select first model
  useEffect(() => {
    if (models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].modelId);
    }
  }, [models, selectedModelId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectedModel = models.find((m) => m.modelId === selectedModelId);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedModelId || isStreaming) return;

    setError(null);
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          modelId: selectedModelId,
          messages: nextMessages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || err.details || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            }
          } catch {
            // skip malformed SSE chunks
          }
        }
      }

      // If nothing streamed, set a fallback
      if (!assistantContent) {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.content === "") {
            updated[updated.length - 1] = {
              role: "assistant",
              content: "(No response received)",
            };
          }
          return updated;
        });
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      // Remove empty assistant message if we added one
      setMessages((prev) => {
        if (prev[prev.length - 1]?.role === "assistant" && prev[prev.length - 1]?.content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, selectedModelId, isStreaming, messages, project.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Chat panel */}
      <div
        className="fixed bottom-4 right-4 top-4 z-50 flex flex-col rounded-xl border border-white/10 bg-[#0a0b0f] shadow-2xl overflow-hidden"
        style={{ width: `min(${panelWidth}px, calc(100vw - 2rem))` }}
      >
        {/* Drag handle (left edge) — desktop only */}
        <div
          onPointerDown={onDragStart}
          className="hidden md:flex absolute left-0 top-0 bottom-0 w-3 cursor-col-resize items-center justify-center z-10 hover:bg-white/5 transition-colors group"
        >
          <GripVertical className="h-5 w-5 text-white/10 group-hover:text-white/30 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="h-4 w-4 text-primary flex-none" />
            <span className="text-sm font-medium text-white truncate">
              Portfolio Agent
            </span>
            <span className="ml-1.5 flex-none rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-inset ring-primary/30">
              EARLY BETA
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen((o) => !o)}
                className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-400 hover:border-primary/40 hover:text-gray-200 transition-colors"
              >
                <span className="max-w-[100px] truncate">
                  {selectedModel?.label || "Model"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {modelDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setModelDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded border border-white/10 bg-[#12131a] py-1 shadow-xl">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${m.modelId === selectedModelId
                          ? "text-primary bg-primary/10"
                          : "text-gray-300 hover:bg-white/5"
                          }`}
                        onClick={() => {
                          setSelectedModelId(m.modelId);
                          setModelDropdownOpen(false);
                        }}
                      >
                        <span className="font-medium">{m.label}</span>
                        <span className="ml-2 text-gray-500">{m.provider}</span>
                      </button>
                    ))}
                    {models.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        No models available
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <Bot className="h-8 w-8 text-primary/40" />
              <div>
                <p className="text-sm text-gray-400">
                  Ask me anything about <span className="text-primary">{project.title}</span>
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {project.tech.join(" / ")}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex-none mt-0.5">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${msg.role === "user"
                  ? "bg-primary/20 text-white"
                  : "bg-white/5 text-gray-200"
                  }`}
              >
                {msg.content ? (
                  <ChatMarkdown content={msg.content} />
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking...
                  </span>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex-none mt-0.5">
                  <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this project..."
              disabled={isStreaming || models.length === 0}
              rows={1}
              className="flex-1 resize-none rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
              style={{ maxHeight: "120px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming || models.length === 0}
              className="flex-none rounded bg-primary/20 p-2 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-gray-600 font-mono">
            {selectedModel
              ? `${selectedModel.provider} / ${selectedModel.label}`
              : "no model selected"}
            {" "}&middot; responses may be inaccurate
          </p>
        </div>
      </div>
    </>
  );
}
