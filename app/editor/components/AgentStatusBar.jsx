"use client";

import { motion, AnimatePresence } from "framer-motion";

const AGENTS = [
  { id: "research",  label: "Research Agent",  icon: "🔍", color: "from-violet-600/30 to-violet-500/10", ring: "ring-violet-500/40", dot: "bg-violet-400" },
  { id: "design",    label: "Design Agent",    icon: "🧪", color: "from-indigo-600/30 to-indigo-500/10",  ring: "ring-indigo-500/40",  dot: "bg-indigo-400" },
  { id: "validator", label: "Validator Agent", icon: "✅", color: "from-emerald-600/30 to-emerald-500/10", ring: "ring-emerald-500/40", dot: "bg-emerald-400" },
];

function AgentPill({ agent, state }) {
  // state: "idle" | "running" | "done" | "error"
  const isDone    = state?.status === "done";
  const isRunning = state?.status === "running";
  const isError   = state?.status === "error";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ring-1 transition-all duration-300
        ${isRunning ? `bg-gradient-to-r ${agent.color} ${agent.ring} shadow-lg` : ""}
        ${isDone    ? "bg-white/5 ring-white/10" : ""}
        ${!isDone && !isRunning ? "bg-white/3 ring-white/8 opacity-50" : ""}
      `}
    >
      <div className="relative flex-shrink-0">
        <span className="text-sm">{agent.icon}</span>
        {isRunning && (
          <motion.div
            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${agent.dot}`}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
        )}
        {isDone && (
          <span className="absolute -top-0.5 -right-0.5 text-[9px]">
            {isError ? "❌" : "✓"}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-white/80 truncate">{agent.label}</div>
        {state?.msg && (
          <div className="text-[9px] text-white/45 truncate max-w-[140px]">{state.msg}</div>
        )}
      </div>

      {isDone && state?.toolCalls > 0 && (
        <div className="ml-auto text-[9px] text-white/35 font-mono flex-shrink-0">
          {state.toolCalls} calls
        </div>
      )}
    </div>
  );
}

export default function AgentStatusBar({ agentStates, visible, totalToolCalls, ragUsed }) {
  if (!visible) return null;

  const allDone = AGENTS.every((a) => agentStates[a.id]?.status === "done");

  return (
    <AnimatePresence>
      <motion.div
        key="agent-bar"
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.25 }}
        className="flex-shrink-0 border-b border-white/8 bg-[#080d14]/80 backdrop-blur-sm px-3 py-2"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pipeline label */}
          <div className="flex items-center gap-1.5 mr-1">
            <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              Multi-Agent
            </div>
          </div>

          {/* Agent pills */}
          {AGENTS.map((agent, i) => (
            <div key={agent.id} className="flex items-center gap-1.5">
              <AgentPill agent={agent} state={agentStates[agent.id]} />
              {i < AGENTS.length - 1 && (
                <div className="text-white/20 text-xs flex-shrink-0">→</div>
              )}
            </div>
          ))}

          {/* Summary badges when done */}
          {allDone && (
            <motion.div
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              className="ml-auto flex items-center gap-2"
            >
              {ragUsed && (
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 ring-1 ring-violet-500/30 text-[9px] text-violet-300 font-medium">
                  RAG
                </span>
              )}
              {totalToolCalls > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 ring-1 ring-amber-500/30 text-[9px] text-amber-300 font-medium">
                  {totalToolCalls} tool calls
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-[9px] text-emerald-300 font-medium">
                ✓ Verified
              </span>
            </motion.div>
          )}
        </div>

        {/* Active agent message */}
        {!allDone && (() => {
          const running = AGENTS.find((a) => agentStates[a.id]?.status === "running");
          return running ? (
            <div className="mt-1 text-[10px] text-white/40 pl-1 flex items-center gap-1.5">
              <motion.div
                className="w-1 h-1 rounded-full bg-white/40"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 0.7, repeat: Infinity }}
              />
              {agentStates[running.id]?.msg}
            </div>
          ) : null;
        })()}
      </motion.div>
    </AnimatePresence>
  );
}
