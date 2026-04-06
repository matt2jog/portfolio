import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Send, Bot, User, ChevronDown, Loader2, GripVertical, Maximize2, Minimize2 } from "lucide-react";
import ChatMarkdown from "./ChatMarkdown";

function TypingIndicator() {
  return (
    <span className="inline-flex h-4 items-end gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
    </span>
  );
}

interface ToolCallEntry {
  name: string;
  args: Record<string, unknown>;
}

function formatFullArgs(args: Record<string, unknown>): string {
  const lines = Object.entries(args).map(([k, v]) => {
    const val = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
    return `  ${k}: ${val}`;
  });
  return `{\n${lines.join(",\n")}\n}`;
}

function ToolCallRow({ call }: { call: ToolCallEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasArgs = Object.keys(call.args).length > 0;

  return (
    <div className="animate-in fade-in duration-200">
      <button
        onClick={() => hasArgs && setExpanded((e) => !e)}
        className={`flex w-full items-center gap-1.5 text-left font-mono text-[11px] transition-opacity ${hasArgs ? "cursor-pointer hover:opacity-75" : "cursor-default"}`}
      >
        <ChevronDown
          className={`h-3 w-3 flex-none text-gray-600 transition-transform duration-150 ${expanded ? "" : "-rotate-90"} ${!hasArgs ? "invisible" : ""}`}
        />
        <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60">CALL</span>
        <span className="text-gray-200">{call.name}</span>
        {!expanded && (
          <span className="ml-0.5 text-gray-600">{hasArgs ? "{ ... }" : "{}"}</span>
        )}
      </button>
      {expanded && hasArgs && (
        <pre className="mt-1 ml-[18px] whitespace-pre border-l border-white/10 pl-2.5 font-mono text-[10px] leading-relaxed text-gray-400">
          {formatFullArgs(call.args)}
        </pre>
      )}
    </div>
  );
}

function AgentThinking({ calls }: { calls: ToolCallEntry[] }) {
  return (
    <div className="flex justify-start gap-2.5">
      <div className="mt-0.5 flex-none">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
      <div className="max-w-[80%] space-y-1.5 rounded-lg bg-white/5 px-3 py-2.5">
        {calls.map((call, i) => (
          <ToolCallRow key={i} call={call} />
        ))}
        <div className="pt-0.5">
          <TypingIndicator />
        </div>
      </div>
    </div>
  );
}

interface AiModel {
  id: string;
  label: string;
  modelId: string;
  provider: string;
}

interface PromptSuggestionsResponse {
  hash: string;
  suggestions: Array<{
    label: string;
    prompt: string;
  }>;
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
  const [isThinking, setIsThinking] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptCarouselRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const welcomeSentRef = useRef(false);

  const MIN_WIDTH = 360;
  const DEFAULT_WIDTH = typeof window !== "undefined"
    ? Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.5))
    : 528;
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const consumeChatStream = useCallback(async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ) => {
    const decoder = new TextDecoder();
    let assistantContent = "";
    let hasAddedAssistantMsg = false;
    let buffer = "";
    let currentEventType = "message";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line === "") {
          currentEventType = "message";
          continue;
        }
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
          continue;
        }
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        if (currentEventType === "tool_call") {
          try {
            const parsed = JSON.parse(data);
            setToolCalls((prev) => [...prev, { name: parsed.name, args: parsed.args ?? {} }]);
            setIsThinking(true);
          } catch {
            // Skip malformed tool call events.
          }
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (!delta) continue;

          if (!hasAddedAssistantMsg) {
            setIsThinking(false);
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
            hasAddedAssistantMsg = true;
          }

          assistantContent += delta;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
            return updated;
          });
        } catch {
          // Skip malformed SSE chunks.
        }
      }
    }

    if (!assistantContent && hasAddedAssistantMsg) {
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.content === "") {
          updated[updated.length - 1] = { role: "assistant", content: "(No response received)" };
        }
        return updated;
      });
    }

    return { assistantContent, hasAddedAssistantMsg };
  }, []);

  const onDragStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: panelWidth };

    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const maxW = window.innerWidth - 32;
      const next = Math.min(maxW, Math.max(MIN_WIDTH, dragRef.current.startW + delta));
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

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].modelId);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolCalls]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const selectedModel = models.find((m) => m.modelId === selectedModelId);
  const { data: promptSuggestionsData } = useQuery<PromptSuggestionsResponse>({
    queryKey: ["/api/public/chat-prompt-suggestions", project.id, selectedModelId],
    enabled: Boolean(selectedModelId),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId: project.id,
        modelId: selectedModelId,
      });
      const res = await fetch(`/api/public/chat-prompt-suggestions?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load prompt suggestions" }));
        throw new Error(err.error || err.details || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });
  const promptSuggestions = promptSuggestionsData?.suggestions ?? [];
  const carouselSuggestions = useMemo(
    () => promptSuggestions.length > 0 ? [...promptSuggestions, ...promptSuggestions, ...promptSuggestions] : [],
    [promptSuggestions],
  );

  useEffect(() => {
    const el = promptCarouselRef.current;
    if (!el || promptSuggestions.length <= 1) return;

    let frameId = 0;
    let lastTs = 0;
    const speedPxPerMs = 0.02975;
    let singleSetWidth = 0;

    const tick = (ts: number) => {
      if (singleSetWidth <= 0) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      if (lastTs !== 0) {
        el.scrollLeft += (ts - lastTs) * speedPxPerMs;
        if (el.scrollLeft >= singleSetWidth * 2) {
          el.scrollLeft -= singleSetWidth;
        } else if (el.scrollLeft <= 0) {
          el.scrollLeft += singleSetWidth;
        }
      }
      lastTs = ts;
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(() => {
      singleSetWidth = el.scrollWidth / 3;
      if (singleSetWidth > 0) {
        el.scrollLeft = singleSetWidth;
      }
      frameId = window.requestAnimationFrame(tick);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      lastTs = 0;
    };
  }, [promptSuggestions]);

  const sendMessage = useCallback(async (contentOverride?: string) => {
    const trimmed = (contentOverride ?? input).trim();
    if (!trimmed || !selectedModelId || isStreaming) return;

    setError(null);
    setToolCalls([]);
    setIsThinking(false);

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

      await consumeChatStream(reader);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setMessages((prev) => {
        if (prev[prev.length - 1]?.role === "assistant" && prev[prev.length - 1]?.content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      abortRef.current = null;
    }
  }, [consumeChatStream, input, isStreaming, messages, project.id, selectedModelId]);

  const fetchWelcome = useCallback(async () => {
    if (!selectedModelId || welcomeSentRef.current || messages.length > 0) return;

    setIsStreaming(true);
    setIsThinking(false);
    setToolCalls([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          modelId: selectedModelId,
          messages: [{ role: "user", content: "__welcome__" }],
          welcome: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) return;

      const reader = res.body?.getReader();
      if (!reader) return;

      const { assistantContent } = await consumeChatStream(reader);
      if (assistantContent) {
        welcomeSentRef.current = true;
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      welcomeSentRef.current = false;
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      setToolCalls([]);
      abortRef.current = null;
    }
  }, [consumeChatStream, messages.length, project.id, selectedModelId]);

  useEffect(() => {
    if (selectedModelId && !welcomeSentRef.current && messages.length === 0) {
      fetchWelcome();
    }
  }, [fetchWelcome, messages.length, selectedModelId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`fixed bottom-4 right-4 top-4 z-50 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0b0f] shadow-2xl transition-[width,left] duration-200 ${isFullscreen ? "left-4" : ""}`}
        style={isFullscreen ? undefined : { width: `min(${panelWidth}px, calc(100vw - 2rem))` }}
      >
        {!isFullscreen && (
          <div
            onPointerDown={onDragStart}
            className="group absolute bottom-0 left-0 top-0 z-10 hidden w-3 cursor-col-resize items-center justify-center transition-colors hover:bg-white/5 md:flex"
          >
            <GripVertical className="h-5 w-5 text-white/10 transition-colors group-hover:text-white/30" />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 flex-none text-primary" />
            <span className="truncate text-sm font-medium text-white">Portfolio Agent</span>
            <span className="ml-1.5 flex-none rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-inset ring-primary/30">
              EARLY BETA
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen((f) => !f)}
              className="hidden rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white md:flex"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen((o) => !o)}
                className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:border-primary/40 hover:text-gray-200"
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
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded border border-white/10 bg-[#12131a] py-1 shadow-xl">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${m.modelId === selectedModelId
                          ? "bg-primary/10 text-primary"
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
              className="rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 min-h-0">
          {messages.length === 0 && !isStreaming && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Bot className="h-8 w-8 text-primary/40" />
              <div>
                <p className="text-sm text-gray-400">
                  Ask me anything about <span className="text-primary">{project.title}</span>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {project.tech.join(" / ")}
                </p>
              </div>
            </div>
          )}

          {messages.length === 0 && isStreaming && !isThinking && (
            <div className="flex justify-start gap-2.5">
              <div className="mt-0.5 flex-none">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <div className="max-w-[80%] rounded-lg bg-white/5 px-3 py-2">
                <TypingIndicator />
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="mt-0.5 flex-none">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
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
                  <TypingIndicator />
                )}
              </div>
              {msg.role === "user" && (
                <div className="mt-0.5 flex-none">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {isThinking && <AgentThinking calls={toolCalls} />}

          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-white/10 px-3 py-3">
          {promptSuggestions.length > 0 && (
            <div className="mb-3">
              <div className="hidden flex-wrap gap-2 md:flex">
                {promptSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => void sendMessage(suggestion.prompt)}
                    disabled={isStreaming || models.length === 0}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-xs leading-none text-gray-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="block whitespace-nowrap">{suggestion.label}</span>
                  </button>
                ))}
              </div>
              <div
                ref={promptCarouselRef}
                className="-mx-3 overflow-x-auto px-3 pb-1 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex min-w-max gap-2">
                  {carouselSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.label}-${index}`}
                      type="button"
                      onClick={() => void sendMessage(suggestion.prompt)}
                      disabled={isStreaming || models.length === 0}
                      className="shrink-0 snap-start whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-xs leading-none text-gray-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="block">{suggestion.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this project..."
              disabled={isStreaming || models.length === 0}
              rows={1}
              className="flex-1 resize-none rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-primary/50 disabled:opacity-50"
              style={{ maxHeight: "120px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isStreaming || models.length === 0}
              className="flex-none rounded bg-primary/20 p-2 text-primary transition-colors hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 font-mono text-[10px] text-gray-600">
            {selectedModel
              ? `${selectedModel.provider} / ${selectedModel.label}`
              : "no model selected"}
            {" "}
            &middot; responses may be inaccurate
          </p>
        </div>
      </div>
    </>
  );
}
