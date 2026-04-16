"use client";

import { create } from "zustand";

const DEFAULT_EDITOR = `## New Project
Waiting for input...
Upload a video or describe your system to begin.
`;

const DEFAULT_VARS = { Scene_Mode: -1 }; // -1 means "Show Nothing"

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function normalizeJournal(j) {
  return {
    id: j?.id || uid(),
    name: j?.name || "Untitled Journal",
    editorValue: j?.editorValue || DEFAULT_EDITOR,
    vars: j?.vars || DEFAULT_VARS,
    videoSrc: j?.videoSrc || null,
    generatedModel: j?.generatedModel || null,
    generatedTopic: j?.generatedTopic || null,
    simConfig: j?.simConfig || null,
    // AI-generated R3F component code for unknown/custom sim types
    sceneCode: j?.sceneCode || null,
    // User feedback on whether the dynamic 3D model matched the topic (for learning + regen prompts)
    accuracyLog: Array.isArray(j?.accuracyLog) ? j.accuracyLog : [],
    lastVisualAccuracy: j?.lastVisualAccuracy ?? null, // "accurate" | "inaccurate" | null
    // Persist the topic label and quality model choice per-journal so switching
    // journals restores the exact simulation that was generated, not a fresh state
    topic: j?.topic || "",
    quality: j?.quality || "thinking",
  };
}

function loadFromLS() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem("loomin.journals.v1"));
  } catch { return null; }
}

function saveToLS(state) {
  if (typeof window === "undefined") return;
  const payload = { journals: state.journals, activeId: state.activeId };
  window.localStorage.setItem("loomin.journals.v1", JSON.stringify(payload));
}

const seedJournals = [normalizeJournal({ id: "default", name: "Welcome", editorValue: DEFAULT_EDITOR, vars: DEFAULT_VARS })];

export const useLoominStore = create((set, get) => ({
  journals: seedJournals,
  activeId: "default",
  hasUpdated: false,

  updateFromStorage: () => {
    const saved = loadFromLS();
    if (!saved?.journals?.length) {
      set({ hasUpdated: true });
      return;
    }
    set({ journals: saved.journals, activeId: saved.activeId, hasUpdated: true });
  },

  createJournal: (name = "New Project") => {
    const j = normalizeJournal({ 
        id: uid(), 
        name, 
        editorValue: DEFAULT_EDITOR, 
        vars: { Scene_Mode: -1 }, // Start with NO SIMULATION
        videoSrc: null 
    });
    set((s) => ({ journals: [j, ...s.journals], activeId: j.id }));
    saveToLS(get());
  },

  renameJournal: (id, name) => {
    set((s) => ({ journals: s.journals.map((j) => (j.id === id ? { ...j, name: name || "Untitled" } : j)) }));
    saveToLS(get());
  },

  setEditorValue: (value) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, editorValue: value } : j),
    }));
    saveToLS(get());
  },

  setVars: (varsPatch) => {
    const { activeId } = get();
    set((s) => ({
      // Replace vars entirely so stale params from old simulations don't linger
      journals: s.journals.map((j) => j.id === activeId ? { ...j, vars: varsPatch } : j),
    }));
    saveToLS(get());
  },

  // Merge a single param key-value without discarding the rest of vars.
  // Used by the slider panel so a drag/click update is reflected immediately
  // in the 3-D scene and physics checker without waiting for a text parse cycle.
  mergeVar: (key, value) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) =>
        j.id === activeId ? { ...j, vars: { ...j.vars, [key]: value } } : j
      ),
    }));
    saveToLS(get());
  },

  setVideo: (url) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, videoSrc: url } : j),
    }));
    saveToLS(get());
  },

  // Save generated 3D model to prevent regeneration
  setGeneratedModel: (model, topic) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, generatedModel: model, generatedTopic: topic } : j),
    }));
    saveToLS(get());
  },

  clearGeneratedModel: () => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, generatedModel: null, generatedTopic: null } : j),
    }));
    saveToLS(get());
  },

  setSimConfig: (config) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, simConfig: config } : j),
    }));
    saveToLS(get());
  },

  setSceneCode: (code) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, sceneCode: code } : j),
    }));
    saveToLS(get());
  },

  /**
   * Record whether the current sandbox visual matched the topic (green/red).
   * Appends to journal + global list so /api/generate-scene can learn what fails.
   */
  recordVisualAccuracy: (accurate, topic, simType) => {
    const { activeId, journals } = get();
    const entry = {
      accurate: !!accurate,
      ts: Date.now(),
      topic: String(topic || "").slice(0, 200),
      simType: simType || "",
    };
    set((s) => ({
      journals: s.journals.map((j) =>
        j.id === activeId
          ? {
              ...j,
              accuracyLog: [...(j.accuracyLog || []), entry].slice(-80),
              lastVisualAccuracy: accurate ? "accurate" : "inaccurate",
            }
          : j
      ),
    }));
    saveToLS(get());
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("loomin.accuracy.global.v1");
      const g = raw ? JSON.parse(raw) : [];
      g.push(entry);
      window.localStorage.setItem("loomin.accuracy.global.v1", JSON.stringify(g.slice(-120)));
    } catch { /* ignore */ }
  },

  setTopic: (topic) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, topic } : j),
    }));
    saveToLS(get());
  },

  setQuality: (quality) => {
    const { activeId } = get();
    set((s) => ({
      journals: s.journals.map((j) => j.id === activeId ? { ...j, quality } : j),
    }));
    saveToLS(get());
  },

  setActive: (id) => { set({ activeId: id }); saveToLS(get()); },
  
  deleteJournal: (id) => {
      const { journals } = get();
      if(journals.length <= 1) return;
      const next = journals.filter(j => j.id !== id);
      set({ journals: next, activeId: next[0].id });
      saveToLS(get());
  }
}));