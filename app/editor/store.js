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
      journals: s.journals.map((j) => j.id === activeId ? { ...j, vars: { ...j.vars, ...varsPatch } } : j),
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
  
  setActive: (id) => { set({ activeId: id }); saveToLS(get()); },
  
  deleteJournal: (id) => {
      const { journals } = get();
      if(journals.length <= 1) return;
      const next = journals.filter(j => j.id !== id);
      set({ journals: next, activeId: next[0].id });
      saveToLS(get());
  }
}));