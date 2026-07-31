import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Bot, ChevronDown, Square } from "lucide-react";
import ChatMarkdown from "./ChatMarkdown";
import { getTrackerUuid } from "@/lib/tracking";

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

function EvaluatorRow({ status }: { status: string }) {
  return (
    <div className="animate-in fade-in duration-200">
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        <ChevronDown className="invisible h-3 w-3 flex-none" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60">{status}</span>
        <span className="text-gray-200">response</span>
        <span className="ml-0.5 text-gray-600">{"{ ... }"}</span>
      </div>
    </div>
  );
}

function AgentThinking({ calls, evaluatorStatus, phase }: { calls: ToolCallEntry[]; evaluatorStatus?: string | null; phase: "thinking" | "refining" | "diagramming" }) {
  const [visitedPhases, setVisitedPhases] = useState<Set<string>>(new Set([phase]));
  
  useEffect(() => {
    setVisitedPhases((prev) => {
      if (prev.has(phase)) return prev;
      const next = new Set(prev);
      next.add(phase);
      return next;
    });
  }, [phase]);

  const hasThinking = calls.length > 0 || visitedPhases.has("thinking");
  // The backend order during stream can be Thinking -> Diagramming -> Refining
  const hasDiagramming = visitedPhases.has("diagramming");
  const hasRefining = visitedPhases.has("refining");

  return (
    <section className="py-2 space-y-5">
      {hasThinking && (
        <div className="animate-in fade-in duration-200">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] italic uppercase tracking-[0.18em] text-primary/70 mb-3">
            {phase === "thinking" ? (
              <span className="relative flex h-2 w-2 flex-none">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
            ) : (
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-primary/40"></span>
            )}
            Thinking...
          </div>
          <div className="space-y-1.5">
            {calls.map((call, i) => (
              <ToolCallRow key={i} call={call} />
            ))}
          </div>
        </div>
      )}

      {hasDiagramming && (
        <div className="animate-in fade-in duration-200">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] italic uppercase tracking-[0.18em] text-primary/70 mb-3">
            {phase === "diagramming" ? (
              <span className="relative flex h-2 w-2 flex-none">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
            ) : (
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-primary/40"></span>
            )}
            Creating Diagrams...
          </div>
          <div className="space-y-1.5">
            {phase === "diagramming" && evaluatorStatus && <EvaluatorRow status={evaluatorStatus} />}
          </div>
        </div>
      )}

      {hasRefining && (
        <div className="animate-in fade-in duration-200">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] italic uppercase tracking-[0.18em] text-primary/70 mb-3">
            {phase === "refining" ? (
              <span className="relative flex h-2 w-2 flex-none">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
            ) : (
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-primary/40"></span>
            )}
            Refining...
          </div>
          <div className="space-y-1.5">
            {phase === "refining" && evaluatorStatus && <EvaluatorRow status={evaluatorStatus} />}
          </div>
        </div>
      )}
    </section>
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

const EMPTY_ASSISTANT_STREAM_FALLBACK = "I hit an internal quality-check issue before finalizing a response. Please try that again.";

interface ProjectChatProps {
  project: {
    id: string;
    title: string;
    description: string;
    tech: string[];
  };
  onClose: () => void;
  standalone?: boolean;
}

function getPromptSuggestionsQueryKey(projectId: string, modelId: string) {
  return ["/api/public/chat-prompt-suggestions", projectId, modelId] as const;
}

export default function ProjectChat({ project, onClose, standalone = false }: ProjectChatProps) {
  const queryClient = useQueryClient();
  const { data: models = [] } = useQuery<AiModel[]>({
    queryKey: ["/api/public/ai-models"],
  });

  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [evaluatorStatus, setEvaluatorStatus] = useState<string | null>(null);
  const [agentPhase, setAgentPhase] = useState<"thinking" | "refining" | "diagramming">("thinking");
  const [error, setError] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(true);
  const [showFloatingClose, setShowFloatingClose] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const welcomeSentRef = useRef(false);

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
            setAgentPhase("thinking");
            setIsThinking(true);
          } catch {}
          continue;
        }

        if (currentEventType === "agent_phase") {
          try {
            const parsed = JSON.parse(data);
            const phase = parsed.phase === "refining" ? "refining" : parsed.phase === "diagramming" ? "diagramming" : "thinking";
            setAgentPhase(phase);
            setIsThinking(true);
          } catch {}
          continue;
        }

        if (currentEventType === "evaluator") {
          try {
            const parsed = JSON.parse(data);
            setAgentPhase((prev) => prev === "diagramming" ? "diagramming" : "refining");
            if (parsed.status) setEvaluatorStatus(parsed.status as string);
          } catch {}
          continue;
        }

        if (currentEventType === "assistant_message") {
          try {
            const parsed = JSON.parse(data);
            const content = typeof parsed.content === "string" ? parsed.content : "";
            if (!content) continue;
            assistantContent += content;
            setIsThinking(false);
            setMessages((prev) => [...prev, { role: "assistant", content }]);
          } catch {}
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
        } catch {}
      }
    }

    if (!assistantContent) {
      assistantContent = EMPTY_ASSISTANT_STREAM_FALLBACK;
      setMessages((prev) => {
        const updated = [...prev];
        if (hasAddedAssistantMsg && updated[updated.length - 1]?.role === "assistant") {
          updated[updated.length - 1] = { role: "assistant", content: EMPTY_ASSISTANT_STREAM_FALLBACK };
          return updated;
        }
        return [...updated, { role: "assistant", content: EMPTY_ASSISTANT_STREAM_FALLBACK }];
      });
    }

    return { assistantContent };
  }, []);

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].modelId);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    if (isAutoScrolling.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, toolCalls, isThinking, isStreaming]);

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

  const fetchPromptSuggestions = useCallback(async (modelId: string) => {
    const params = new URLSearchParams({ projectId: project.id, modelId });
    const res = await fetch(`/api/public/chat-prompt-suggestions?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to load prompt suggestions" }));
      throw new Error(err.error || err.details || `HTTP ${res.status}`);
    }
    return res.json() as Promise<PromptSuggestionsResponse>;
  }, [project.id]);

  const selectedModel = models.find((m) => m.modelId === selectedModelId);
  const { data: promptSuggestionsData } = useQuery<PromptSuggestionsResponse>({
    queryKey: getPromptSuggestionsQueryKey(project.id, selectedModelId),
    enabled: Boolean(selectedModelId),
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    placeholderData: () => selectedModelId ? queryClient.getQueryData<PromptSuggestionsResponse>(getPromptSuggestionsQueryKey(project.id, selectedModelId)) : undefined,
    queryFn: () => fetchPromptSuggestions(selectedModelId),
  });

  useEffect(() => {
    if (models.length === 0) return;
    void Promise.all(models.map((model) => queryClient.prefetchQuery({
      queryKey: getPromptSuggestionsQueryKey(project.id, model.modelId),
      queryFn: () => fetchPromptSuggestions(model.modelId),
      staleTime: 30 * 60 * 1000,
      gcTime: 2 * 60 * 60 * 1000,
    })));
  }, [fetchPromptSuggestions, models, project.id, queryClient]);

  const promptSuggestions = promptSuggestionsData?.suggestions ?? [];
  const carouselSuggestions = useMemo(() => promptSuggestions.length > 0 ? [...promptSuggestions, ...promptSuggestions] : [], [promptSuggestions]);
  const mobileCarouselDuration = useMemo(() => {
    const labelWeight = promptSuggestions.reduce((sum, suggestion) => sum + suggestion.label.length, 0);
    return `${Math.max(14, Math.min(22, labelWeight * 0.45))}s`;
  }, [promptSuggestions]);

  const sendMessage = useCallback(async (contentOverride?: string) => {
    const trimmed = (contentOverride ?? input).trim();
    if (!trimmed || !selectedModelId || isStreaming) return;

    setError(null);
    setToolCalls([]);
    setEvaluatorStatus(null);
    setAgentPhase("thinking");
    setIsThinking(false);

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);
    setAgentPhase("thinking");
    isAutoScrolling.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const trackerUuid = getTrackerUuid();
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          modelId: selectedModelId,
          messages: nextMessages,
          ...(trackerUuid ? { trackerUuid } : {}),
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
      setMessages((prev) => (prev[prev.length - 1]?.role === "assistant" && prev[prev.length - 1]?.content === "") ? prev.slice(0, -1) : prev);
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      setAgentPhase("thinking");
      abortRef.current = null;
    }
  }, [consumeChatStream, input, isStreaming, messages, project.id, selectedModelId]);

  const fetchWelcome = useCallback(async () => {
    if (!selectedModelId || welcomeSentRef.current || messages.length > 0) return;
    setIsStreaming(true);
    setIsThinking(false);
    setToolCalls([]);
    setEvaluatorStatus(null);
    setAgentPhase("thinking");
    isAutoScrolling.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const trackerUuid = getTrackerUuid();
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          modelId: selectedModelId,
          messages: [{ role: "user", content: "__welcome__" }],
          welcome: true,
          ...(trackerUuid ? { trackerUuid } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const reader = res.body?.getReader();
      if (!reader) return;
      const { assistantContent } = await consumeChatStream(reader);
      if (assistantContent) welcomeSentRef.current = true;
    } catch (err: any) {
      if (err.name === "AbortError") return;
      welcomeSentRef.current = false;
    } finally {
      setIsStreaming(false);
      setIsThinking(false);
      setToolCalls([]);
      setEvaluatorStatus(null);
      setAgentPhase("thinking");
      abortRef.current = null;
    }
  }, [consumeChatStream, messages.length, project.id, selectedModelId]);

  useEffect(() => {
    if (selectedModelId && !welcomeSentRef.current && messages.length === 0) fetchWelcome();
  }, [fetchWelcome, messages.length, selectedModelId]);

  const stopStreaming = useCallback(() => {
    setIsThinking(false);
    setToolCalls([]);
    setEvaluatorStatus(null);
    setAgentPhase("thinking");
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <style>{`@keyframes project-chat-prompt-marquee { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(calc(-50% - 0.25rem), 0, 0); } }`}</style>
      {!standalone && <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" onClick={onClose} />}
      <div className={standalone ? "min-h-screen bg-[#0a0b0f] relative" : "fixed inset-0 z-50 md:inset-4 relative"}>
        <div className={standalone ? "flex min-h-screen flex-col bg-[#0a0b0f]" : "flex h-full flex-col overflow-hidden bg-[#0a0b0f] md:rounded-2xl md:border md:border-white/10 md:shadow-2xl"}>
          <button onClick={onClose} className={`fixed bottom-24 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_24px_hsl(var(--primary)/0.6)] transition-all duration-300 md:bottom-28 md:right-8 ${showFloatingClose ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0 pointer-events-none"}`} aria-label="Back to projects"><X className="h-6 w-6 stroke-[2.5]" /></button>
          <div className="fixed top-0 inset-x-0 z-40 flex items-start justify-between gap-3 border-b border-white/10 bg-[#0a0b0f]/95 backdrop-blur px-4 py-4 md:items-center md:px-6">
            <div className="min-w-0 pr-2 md:max-w-[28rem]">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 flex-none text-primary md:h-5 md:w-5" />
                <span className="truncate text-sm font-medium text-white md:text-base">Portfolio Agent</span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-inset ring-primary/30">Early Beta</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 md:text-sm">Ask about {project.title}</p>
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-center md:flex">
              <div className="max-w-[40vw] text-center">
                <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-gray-600">Project</p>
                <p className="truncate text-lg font-medium tracking-tight text-white">{project.title}</p>
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setModelDropdownOpen((o) => !o)} className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:border-primary/40 hover:text-gray-200">
                  <span className="max-w-[100px] truncate">{selectedModel?.label || "Model"}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {modelDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setModelDropdownOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded border border-white/10 bg-[#12131a] py-1 shadow-xl">
                      {models.map((m) => (
                        <button key={m.id} className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${m.modelId === selectedModelId ? "bg-primary/10 text-primary" : "text-gray-300 hover:bg-white/5"}`} onClick={() => { setSelectedModelId(m.modelId); setModelDropdownOpen(false); }}>
                          <span className="font-medium">{m.label}</span>
                          <span className="ml-2 text-gray-500">{m.provider}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={onClose} className="rounded p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close chat"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto mt-[76px]" onScroll={(e) => { const target = e.currentTarget; isAutoScrolling.current = (target.scrollHeight - target.scrollTop - target.clientHeight) < 75; setShowFloatingClose(target.scrollTop > 80); }}>
            <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
              {messages.length === 0 && !isStreaming && (
                <div className="flex min-h-[40vh] flex-col justify-center py-10">
                  <p className="text-sm text-gray-300">Ask me anything about <span className="text-primary">{project.title}</span>.</p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">I can explain the project, walk through architecture, inspect repository context, and connect the work back to its creator.</p>
                  <p className="mt-3 text-xs text-gray-600">{project.tech.join(" / ")}</p>
                </div>
              )}
              {messages.length === 0 && isStreaming && (
                <div className="flex min-h-[40vh] flex-col justify-center py-10">
                  <TypingIndicator />
                </div>
              )}
              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <section key={i} className="py-1">
                    {msg.role === "assistant" ? (
                      <div className="w-full">
                        {i === 0 && <div className="mb-5 md:hidden"><p className="text-[10px] font-mono uppercase tracking-[0.24em] text-gray-600">Project</p><p className="mt-1 text-lg font-medium tracking-tight text-white">{project.title}</p></div>}
                        <div className="text-sm leading-relaxed text-gray-200">{msg.content ? <ChatMarkdown content={msg.content} /> : <TypingIndicator />}</div>
                      </div>
                    ) : (
                      <div className="flex justify-end"><div className="max-w-[min(82%,42rem)] rounded-[1.75rem] bg-primary px-5 py-3.5 text-left text-sm leading-relaxed text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.28)]"><ChatMarkdown content={msg.content} /></div></div>
                    )}
                  </section>
                ))}
                {isThinking && <AgentThinking calls={toolCalls} evaluatorStatus={evaluatorStatus} phase={agentPhase} />}
                {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                  <section className="py-2">
                    <TypingIndicator />
                  </section>
                )}
                {error && <div className="py-5"><div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div></div>}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-40 border-t border-white/10 bg-[#0a0b0f]/95 backdrop-blur px-4 py-4 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              {promptSuggestions.length > 0 && (
                <div className="mb-3">
                  <div className="hidden flex-wrap gap-2 md:flex">
                    {promptSuggestions.map((suggestion) => (
                      <button key={suggestion.label} type="button" onClick={() => void sendMessage(suggestion.prompt)} disabled={isStreaming || models.length === 0} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-xs leading-none text-gray-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><span className="block whitespace-nowrap">{suggestion.label}</span></button>
                    ))}
                  </div>
                  <div className="-mx-4 overflow-hidden px-4 pb-1 md:hidden">
                    <div className="flex min-w-max gap-2 will-change-transform motion-reduce:animate-none" style={{ animationName: promptSuggestions.length > 1 ? "project-chat-prompt-marquee" : undefined, animationDuration: mobileCarouselDuration, animationTimingFunction: "linear", animationIterationCount: "infinite" }}>
                      {carouselSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.label}-${index}`}
                          type="button"
                          onClick={() => void sendMessage(suggestion.prompt)}
                          disabled={isStreaming || models.length === 0}
                          className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-xs leading-none text-gray-300 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="block">{suggestion.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-end rounded border border-white/10 bg-white/5 px-3 py-2 transition-colors focus-within:border-primary/50">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about this project..."
                  disabled={isStreaming || models.length === 0}
                  rows={1}
                  className="scrollbar-hide min-h-10 flex-1 resize-none bg-transparent py-2 pr-3 text-sm leading-5 text-white outline-none placeholder:text-gray-500 disabled:opacity-50"
                  style={{ maxHeight: "120px", scrollbarWidth: "none", msOverflowStyle: "none" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                />
                <button
                  onClick={isStreaming ? stopStreaming : () => void sendMessage()}
                  disabled={isStreaming ? !abortRef.current : !input.trim() || models.length === 0}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center self-end rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${isStreaming
                    ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
                    : "bg-primary/20 text-primary hover:bg-primary/30"
                    }`}
                  aria-label={isStreaming ? "Stop completion" : "Send message"}
                  title={isStreaming ? "Stop completion" : "Send message"}
                >
                  {isStreaming ? (
                    <Square className="h-4 w-4 fill-current" />
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
        </div>
      </div>
    </>
  );
}
