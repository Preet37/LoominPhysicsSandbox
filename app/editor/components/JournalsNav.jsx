"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useLoominStore } from "../store";

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

export default function JournalsNav({ open, onToggle, onNewJournal }) {
  const updateFromStorage = useLoominStore((s) => s.updateFromStorage);
  const journals = useLoominStore((s) => s.journals);
  const activeId = useLoominStore((s) => s.activeId);
  const createJournal = useLoominStore((s) => s.createJournal);
  const renameJournal = useLoominStore((s) => s.renameJournal);
  const deleteJournal = useLoominStore((s) => s.deleteJournal);
  const setActive = useLoominStore((s) => s.setActive);
  
  // Use the onNewJournal prop if provided, otherwise fall back to default createJournal
  const handleNewJournal = onNewJournal || (() => createJournal?.(`Journal ${journals.length + 1}`));

  const [q, setQ] = useState("");

  useEffect(() => {
    updateFromStorage?.();
  }, [updateFromStorage]);

  const active = useMemo(() => journals.find((j) => j.id === activeId) || journals[0], [journals, activeId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return journals;
    return journals.filter((j) => (j?.name || "").toLowerCase().includes(query));
  }, [journals, q]);

  return (
    <div className="w-full h-full rounded-3xl bg-white/[0.045] ring-1 ring-white/12 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col">
      <div className="px-3 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="flex-1 rounded-2xl bg-white/6 ring-1 ring-white/10 hover:bg-white/8 transition px-3 py-2 flex items-center justify-between"
            type="button"
          >
            <div className="min-w-0 flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-white/8 ring-1 ring-white/10 flex items-center justify-center">
                <div className="h-3.5 w-3.5 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300 opacity-95" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] tracking-[0.18em] uppercase text-white/45">Journal</div>
                <div className="text-[13px] font-semibold text-white/88 truncate">{active?.name ?? "Journal"}</div>
              </div>
            </div>

            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="text-white/65"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </button>

          <button
            onClick={handleNewJournal}
            className="h-[44px] w-[44px] rounded-2xl bg-white/8 ring-1 ring-white/12 hover:bg-white/12 active:bg-white/10 transition flex items-center justify-center"
            type="button"
            aria-label="New journal"
            title="New journal"
          >
            <Plus className="h-4 w-4 text-white/80" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="dropdown"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-white/10 flex-1 flex flex-col min-h-0"
            style={{ overflow: "hidden" }}
          >
            <motion.div layout className="px-3 py-3 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2 rounded-2xl bg-white/6 ring-1 ring-white/10 px-3 py-2">
                <Search className="h-4 w-4 text-white/55" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search journals…"
                  className="w-full bg-transparent text-[13px] text-white/80 placeholder:text-white/35 outline-none"
                />
              </div>
            </motion.div>

            <motion.div layout className="px-2 py-2 flex-1 overflow-auto loomin-scroll">
              <div className="space-y-1">
                {filtered.map((j) => (
                  <JournalRow
                    key={j.id}
                    journal={j}
                    active={j.id === activeId}
                    canDelete={(journals?.length || 0) > 1}
                    onSelect={() => setActive?.(j.id)}
                    onRename={(name) => renameJournal?.(j.id, name)}
                    onDelete={() => deleteJournal?.(j.id)}
                  />
                ))}
                {!filtered.length ? <div className="px-3 py-10 text-center text-xs text-white/45">No journals match that search.</div> : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function JournalRow({ journal, active, canDelete, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(journal?.name ?? "");

  useEffect(() => setName(journal?.name ?? ""), [journal?.name]);

  const handleSave = () => {
    const trimmed = name.trim() || "Untitled";
    onRename(trimmed);
    setEditing(false);
  };

  // Use a div when editing to prevent button behavior issues
  return (
    <motion.div
      layout
      onClick={() => !editing && onSelect()}
      className={cx(
        "w-full text-left group rounded-2xl ring-1 transition overflow-hidden cursor-pointer",
        active ? "bg-white/10 ring-white/18" : "bg-white/5 ring-white/10 hover:bg-white/8"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
                if (e.key === "Escape") {
                  setName(journal?.name ?? "");
                  setEditing(false);
                }
              }}
              onBlur={handleSave}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-[13px] text-white/90 outline-none border-b border-indigo-500/50 pb-0.5"
              autoFocus
            />
          ) : (
            <div className="text-[13px] text-white/88 truncate">{journal?.name ?? "Untitled"}</div>
          )}
        </div>

        {editing ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            className="h-8 w-8 rounded-xl bg-emerald-600/20 ring-1 ring-emerald-500/30 hover:bg-emerald-600/40 transition flex items-center justify-center"
            type="button"
            aria-label="Save"
          >
            <Check className="h-4 w-4 text-emerald-400" />
          </button>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="h-8 w-8 rounded-xl bg-white/0 ring-1 ring-white/0 group-hover:bg-white/8 group-hover:ring-white/12 transition flex items-center justify-center"
              type="button"
              aria-label="Rename"
            >
              <Pencil className="h-4 w-4 text-white/70" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={!canDelete}
              className={cx(
                "h-8 w-8 rounded-xl ring-1 transition flex items-center justify-center",
                canDelete
                  ? "bg-white/0 ring-white/0 group-hover:bg-white/8 group-hover:ring-white/12 hover:bg-rose-500/10 hover:ring-rose-400/20"
                  : "bg-white/0 ring-white/0 opacity-30 cursor-not-allowed"
              )}
              type="button"
              aria-label="Delete"
              title={canDelete ? "Delete" : "Keep at least 1 journal"}
            >
              <Trash2 className="h-4 w-4 text-white/70" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
