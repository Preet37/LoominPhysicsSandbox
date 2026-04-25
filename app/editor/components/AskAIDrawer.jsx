"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, Zap, Brain, Plus, Sparkles, GraduationCap, MessageSquare, RotateCcw, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

// ── Web Speech hook ───────────────────────────────────────────────────────────

function useSpeechInput(onResult) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const supported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!supported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || "";
      if (transcript) onResult(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [supported, onResult]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return { start, stop, listening, supported };
}

function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const speak = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.slice(0, 800));
    utt.rate = 0.95;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);
  const stop = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);
  return { speak, stop, speaking };
}
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ── Markdown components for chat messages ────────────────────────────────────

const MSG_MD = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-1.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-1.5">{children}</ol>,
  li: ({ children }) => <li className="text-[12px] leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  code: ({ inline, children }) =>
    inline
      ? <code className="px-1 py-0.5 rounded bg-white/15 text-cyan-300 text-[11px]">{children}</code>
      : <code className="block bg-black/30 rounded-lg px-2.5 py-2 text-[11px] font-mono my-1.5 overflow-x-auto">{children}</code>,
  pre: ({ children }) => <>{children}</>,
};

function normalizeMath(text = "") {
  return text
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, e) => `\n$$\n${e.trim()}\n$$\n`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, e) => `$${e.trim()}$`);
}

// ── Teaching mode context ─────────────────────────────────────────────────────

const TEACHING_TOPICS = [
  "Why does this parameter cause a critical failure?",
  "Can you help me understand the key equation here?",
  "What would happen if I double this value?",
  "Help me derive this from first principles",
];

const ANSWER_TOPICS = (simConfig) =>
  simConfig
    ? [
        `Why does ${simConfig.displayName || simConfig.simType} work?`,
        "What happens at critical failure?",
        "What parameter values are most interesting to test?",
        "Explain the main physics constraint",
      ]
    : [
        "Why does wind speed affect turbine efficiency?",
        "Explain Newton's cradle in terms of momentum",
        "What is the Tsiolkovsky rocket equation?",
        "How does damping affect oscillations?",
      ];

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, mode, onGenerateNotes, simConfig }) {
  const isUser = msg.role === "user";
  const isTeaching = mode === "teach" && !isUser;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Teaching mode avatar */}
      {isTeaching && (
        <div className="w-6 h-6 rounded-full bg-violet-500/20 ring-1 ring-violet-500/30 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
          <GraduationCap className="h-3.5 w-3.5 text-violet-400" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
          isUser
            ? "bg-indigo-600/30 ring-1 ring-indigo-500/30 text-white rounded-br-sm"
            : isTeaching
            ? "bg-violet-950/50 ring-1 ring-violet-500/20 text-white/85 rounded-bl-sm"
            : "bg-white/6 ring-1 ring-white/10 text-white/85 rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <span>{msg.content}</span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={MSG_MD}
          >
            {normalizeMath(msg.content)}
          </ReactMarkdown>
        )}
        {/* Re-generate link on AI messages */}
        {!isUser && onGenerateNotes && simConfig && (
          <button
            onClick={() => onGenerateNotes(simConfig.displayName || simConfig.simType)}
            className="mt-2 flex items-center gap-1 text-[10px] text-indigo-400/60 hover:text-indigo-400 transition"
          >
            <Sparkles className="h-2.5 w-2.5" />
            Regenerate simulation notes
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export default function AskAIDrawer({ open, onClose, simConfig, currentParams, editorValue, onGenerateNotes }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("answer"); // "answer" | "teach"
  const [chats, setChats] = useState([{ id: 0, name: "Chat 1", history: [] }]);
  const [activeChatId, setActiveChatId] = useState(0);
  const [showChatList, setShowChatList] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const inputRef = useRef();
  const bottomRef = useRef();
  const { speak, stop: stopTTS, speaking } = useTTS();

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const history = activeChat?.history || [];

  const onVoiceResult = useCallback((transcript) => {
    setQuestion((q) => q ? q + " " + transcript : transcript);
    inputRef.current?.focus();
  }, []);
  const { start: startListening, stop: stopListening, listening, supported: voiceSupported } = useSpeechInput(onVoiceResult);

  const updateHistory = useCallback((id, newHistory) => {
    setChats((prev) => prev.map((c) => c.id === id ? { ...c, history: newHistory } : c));
  }, []);

  const newChat = () => {
    const id = Date.now();
    setChats((prev) => [...prev, { id, name: `Chat ${prev.length + 1}`, history: [] }]);
    setActiveChatId(id);
    setShowChatList(false);
  };

  const clearChat = () => {
    updateHistory(activeChatId, []);
  };

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setLoading(true);

    const userMsg = { role: "user", content: q };
    const newHistory = [...history, userMsg];
    updateHistory(activeChatId, newHistory);

    try {
      const res = await fetch("/api/socratic-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          simConfig,
          currentParams,
          conversationHistory: history.slice(-8),
          mode,
          notes: editorValue?.slice(0, 1200) || "",
        }),
      });
      const data = await res.json();
      const answer = data.answer || "Sorry, I couldn't get a response.";
      updateHistory(activeChatId, [...newHistory, { role: "assistant", content: answer }]);
      if (ttsEnabled) speak(answer.replace(/\$\$?[\s\S]*?\$\$?/g, "").replace(/[#*`]/g, "").trim());
    } catch {
      updateHistory(activeChatId, [...newHistory, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [question, loading, history, activeChatId, simConfig, currentParams, mode, editorValue, updateHistory, ttsEnabled, speak]);

  const suggestedTopics = mode === "teach" ? TEACHING_TOPICS : ANSWER_TOPICS(simConfig);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />

          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[420px] flex flex-col bg-[#0d1117] border-l border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ring-1 ${
                  mode === "teach" ? "bg-violet-500/20 ring-violet-500/30" : "bg-indigo-500/20 ring-indigo-500/30"
                }`}>
                  {mode === "teach" ? <GraduationCap className="h-4 w-4 text-violet-400" /> : <Brain className="h-4 w-4 text-indigo-400" />}
                </div>
                <div>
                  <button
                    onClick={() => setShowChatList((v) => !v)}
                    className="text-sm font-semibold text-white/90 hover:text-white transition text-left"
                  >
                    {mode === "teach" ? "Socratic Tutor" : "Loomin AI"}
                  </button>
                  <div className={`text-[10px] flex items-center gap-1 ${mode === "teach" ? "text-violet-300/60" : "text-white/40"}`}>
                    {mode === "teach"
                      ? <><GraduationCap className="h-2.5 w-2.5 text-violet-400" /> Teaching through questions</>
                      : <><Zap className="h-2.5 w-2.5 text-amber-400" /> Direct answers · context-aware</>
                    }
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {typeof window !== "undefined" && "speechSynthesis" in window && (
                  <button
                    onClick={() => { setTtsEnabled((v) => !v); if (speaking) stopTTS(); }}
                    title={ttsEnabled ? "Disable voice readback" : "Enable AI voice readback"}
                    className={`h-8 w-8 rounded-lg transition flex items-center justify-center ${ttsEnabled ? "bg-violet-500/20 ring-1 ring-violet-500/30" : "bg-white/5 hover:bg-white/10"}`}
                  >
                    {ttsEnabled ? <Volume2 className="h-3.5 w-3.5 text-violet-400" /> : <VolumeX className="h-3.5 w-3.5 text-white/40" />}
                  </button>
                )}
                <button onClick={clearChat} title="Clear chat" className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 transition flex items-center justify-center">
                  <RotateCcw className="h-3.5 w-3.5 text-white/60" />
                </button>
                <button onClick={newChat} title="New chat" className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 transition flex items-center justify-center">
                  <Plus className="h-4 w-4 text-white/60" />
                </button>
                <button onClick={onClose} className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 transition flex items-center justify-center">
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/8">
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/5 ring-1 ring-white/10">
                <button
                  onClick={() => setMode("answer")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                    mode === "answer" ? "bg-indigo-600/40 ring-1 ring-indigo-500/50 text-indigo-200" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  Answer Mode
                </button>
                <button
                  onClick={() => setMode("teach")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                    mode === "teach" ? "bg-violet-600/40 ring-1 ring-violet-500/50 text-violet-200" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  <GraduationCap className="h-3 w-3" />
                  Teach Me
                </button>
              </div>
              {mode === "teach" && (
                <p className="text-[10px] text-violet-300/50 mt-1.5 text-center">
                  AI asks questions to build your understanding — no spoilers!
                </p>
              )}
            </div>

            {/* Chat list dropdown */}
            <AnimatePresence>
              {showChatList && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-white/10 overflow-hidden flex-shrink-0"
                >
                  <div className="p-2 space-y-1 max-h-32 overflow-y-auto">
                    {chats.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setActiveChatId(c.id); setShowChatList(false); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition ${
                          c.id === activeChatId ? "bg-indigo-600/30 text-indigo-200" : "text-white/60 hover:bg-white/6 hover:text-white/80"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sim context pill */}
            {simConfig && (
              <div className="px-4 py-2 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 ring-1 ring-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[11px] text-white/60">{simConfig.displayName || simConfig.simType}</span>
                </div>
                {onGenerateNotes && (
                  <button
                    onClick={() => onGenerateNotes(simConfig.displayName || simConfig.simType)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 transition text-[11px] text-indigo-300 font-medium"
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate notes
                  </button>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
              {history.length === 0 && (
                <div className="text-center py-6">
                  {mode === "teach" ? (
                    <>
                      <GraduationCap className="h-8 w-8 text-violet-400/30 mx-auto mb-3" />
                      <p className="text-[13px] text-white/40 mb-1">Socratic Teaching Mode</p>
                      <p className="text-[11px] text-white/25 mb-5">I'll guide you to understanding through questions, not lectures.</p>
                    </>
                  ) : (
                    <>
                      <Brain className="h-8 w-8 text-white/20 mx-auto mb-3" />
                      <p className="text-sm text-white/30 mb-4">Ask anything about the physics or simulation</p>
                    </>
                  )}
                  <div className="space-y-1.5">
                    {suggestedTopics.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setQuestion(s); inputRef.current?.focus(); }}
                        className="block w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-white/8 ring-1 ring-white/10 text-[11px] text-white/55 hover:text-white/75 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {history.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  mode={mode}
                  onGenerateNotes={onGenerateNotes}
                  simConfig={simConfig}
                />
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className={`ring-1 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2 ${
                    mode === "teach" ? "bg-violet-950/40 ring-violet-500/20" : "bg-white/6 ring-white/10"
                  }`}>
                    <Loader2 className={`h-3.5 w-3.5 animate-spin ${mode === "teach" ? "text-violet-400" : "text-indigo-400"}`} />
                    <span className="text-xs text-white/50">{mode === "teach" ? "Preparing a question…" : "Thinking…"}</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-white/10 p-4">
              {/* Voice listening indicator */}
              {listening && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-xl bg-red-950/30 ring-1 ring-red-500/25">
                  <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-[11px] text-red-300/70">Listening… speak now</span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
                  }}
                  placeholder={listening ? "Listening…" : mode === "teach" ? "What concept would you like to explore?" : "Ask a physics question…"}
                  disabled={loading}
                  rows={1}
                  className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none transition disabled:opacity-50 resize-none"
                  style={{
                    background: mode === "teach" ? "rgba(139,92,246,0.08)" : "rgba(255,255,255,0.07)",
                    border: `1px solid ${mode === "teach" ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.12)"}`,
                    color: "rgba(255,255,255,0.92)",
                    caretColor: "white",
                    maxHeight: 120,
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                {/* Voice input button */}
                {voiceSupported && (
                  <button
                    onClick={() => listening ? stopListening() : startListening()}
                    title={listening ? "Stop listening" : "Voice input"}
                    className={`h-10 w-10 rounded-xl ring-1 transition flex items-center justify-center flex-shrink-0 ${
                      listening
                        ? "bg-red-500/25 ring-red-500/40 animate-pulse"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {listening
                      ? <MicOff className="h-4 w-4 text-red-400" />
                      : <Mic className="h-4 w-4 text-white/40" />
                    }
                  </button>
                )}
                <button
                  onClick={ask}
                  disabled={loading || !question.trim()}
                  className={`h-10 w-10 rounded-xl ring-1 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center flex-shrink-0 ${
                    mode === "teach"
                      ? "bg-violet-500/20 ring-violet-500/40 hover:bg-violet-500/30"
                      : "bg-indigo-500/20 ring-indigo-500/40 hover:bg-indigo-500/30"
                  }`}
                >
                  {loading
                    ? <Loader2 className="h-4 w-4 text-white/60 animate-spin" />
                    : <Send className={`h-4 w-4 ${mode === "teach" ? "text-violet-400" : "text-indigo-400"}`} />
                  }
                </button>
              </div>
              <p className="text-[9px] text-white/20 mt-1.5 text-center">
                {voiceSupported ? "Mic for voice · Enter to send" : mode === "teach" ? "Shift+Enter for new line · Enter to send" : "Enter to send"}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
