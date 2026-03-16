"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, Zap, Brain } from "lucide-react";

export default function AskAIDrawer({ open, onClose, simConfig, currentParams }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const inputRef = useRef();
  const bottomRef = useRef();

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setLoading(true);

    const userMsg = { role: "user", content: q };
    setHistory((h) => [...h, userMsg]);

    try {
      const res = await fetch("/api/physics-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          simConfig,
          currentParams,
          conversationHistory: history.slice(-6),
        }),
      });
      const data = await res.json();
      const answer = data.answer || "Sorry, I couldn't get an answer.";
      setHistory((h) => [...h, { role: "assistant", content: answer }]);
    } catch {
      setHistory((h) => [...h, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[380px] flex flex-col bg-[#0d1117] border-l border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white/90">Ask Loomin AI</div>
                  <div className="text-[10px] text-white/40 flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5 text-amber-400" />
                    Fast model · context-aware
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
              >
                <X className="h-4 w-4 text-white/60" />
              </button>
            </div>

            {/* Sim context pill */}
            {simConfig && (
              <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 ring-1 ring-white/10 w-fit">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[11px] text-white/60">
                    {simConfig.displayName || simConfig.simType}
                  </span>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 loomin-scroll">
              {history.length === 0 && (
                <div className="text-center py-10">
                  <Brain className="h-8 w-8 text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/30">Ask anything about the physics or simulation</p>
                  <div className="mt-4 space-y-2">
                    {[
                      "Why does wind speed affect efficiency?",
                      "What happens at critical failure?",
                      "Suggest optimal parameters",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setQuestion(s); inputRef.current?.focus(); }}
                        className="block w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 ring-1 ring-white/10 text-[12px] text-white/60 hover:text-white/80 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {history.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600/30 ring-1 ring-indigo-500/30 text-white/90 rounded-br-sm"
                        : "bg-white/6 ring-1 ring-white/10 text-white/80 rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/6 ring-1 ring-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                    <span className="text-xs text-white/50">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-white/10 p-4">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask()}
                  placeholder="Ask a physics question…"
                  className="flex-1 bg-white/6 ring-1 ring-white/12 focus:ring-indigo-500/50 rounded-xl px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/35 outline-none transition"
                  disabled={loading}
                />
                <button
                  onClick={ask}
                  disabled={loading || !question.trim()}
                  className="h-10 w-10 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/40 hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center flex-shrink-0"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 text-indigo-400" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
