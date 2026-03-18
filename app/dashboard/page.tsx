"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import Scene from "../editor/Scene";
import JournalsNav from "../editor/components/JournalsNav";
import { Leaf, Sparkles, BookOpen, AlertTriangle, Wrench, CheckCircle, PlayCircle, PauseCircle, Upload, Maximize2, Minimize2, LogOut } from "lucide-react";
import UploadModal from "../editor/components/UploadModal";
import { useLoominStore } from "../editor/store";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// --- SMART PARSER: EXTRACTS VARIABLES FROM NATURAL TEXT ---
function extractVariablesFromText(text: string) {
  const out: any = {};
  
  // FIRST: Capture standard "Var = Val" format (most reliable for explicit params)
  // This ensures Scene_Mode = 2 is captured correctly
  // Also handles units like "100 kg" or "50 m/s"
  const standardRegex = /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:kg|lbs?|m\/s|mph|degrees?|%)?/g;
  let m;
  while ((m = standardRegex.exec(text)) !== null) {
     out[m[1]] = Number(m[2]);
  }
  
  // SECOND: Natural language patterns (only if not already captured)
  const patterns = [
    { key: 'Wind_Speed', regex: /(?:wind\s*speed|velocity)[:\s]+(\d+)/i },
    { key: 'Blade_Count', regex: /(?:blade\s*count|number\s*of\s*blades)[:\s]+(\d+)/i },
    { key: 'Blade_Pitch', regex: /(?:blade\s*pitch|pitch\s*angle)[:\s]+(\d+)/i },
    { key: 'Yaw', regex: /(?:yaw|direction)[:\s]+(\d+)/i },
  ];

  patterns.forEach(({ key, regex }) => {
    if (out[key] === undefined) { // Only if not already captured
      const match = text.match(regex);
      if (match && match[1]) {
        out[key] = Number(match[1]);
      }
    }
  });

  return out;
}

// --- FLASHCARD ENGINE ---
function FlashcardMode({ initialCards, onClose }: { initialCards: any[], onClose: () => void }) {
  const [deck, setDeck] = useState(initialCards);
  const [learningQueue, setLearningQueue] = useState<any[]>([]); 
  const [masteredCount, setMasteredCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [viewState, setViewState] = useState<'STUDYING' | 'SUMMARY' | 'VICTORY'>('STUDYING');

  if (!deck || deck.length === 0) return null;
  const current = deck[index];

  const handleSwipe = (mastered: boolean) => {
    setIsFlipped(false);
    if (mastered) setMasteredCount(prev => prev + 1);
    else setLearningQueue(prev => [...prev, current]);

    setTimeout(() => {
        if (index < deck.length - 1) setIndex(prev => prev + 1);
        else finishRound(mastered);
    }, 200);
  };

  const finishRound = (lastMastered: boolean) => {
     const finalQueue = lastMastered ? learningQueue : [...learningQueue, current];
     if (finalQueue.length === 0) setViewState('VICTORY');
     else setViewState('SUMMARY');
  };

  const restartRound = () => {
      setDeck(learningQueue);
      setLearningQueue([]);
      setIndex(0);
      setViewState('STUDYING');
  };

  const restartFull = () => {
      setDeck(initialCards);
      setLearningQueue([]);
      setMasteredCount(0);
      setIndex(0);
      setViewState('STUDYING');
  };

  if (viewState === 'VICTORY') {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md">
            <div className="text-center p-8 bg-slate-900 border border-emerald-500 rounded-2xl shadow-2xl">
                <h2 className="text-4xl font-bold text-emerald-400 mb-4">Deck Mastered!</h2>
                <div className="flex gap-4 justify-center">
                    <button onClick={restartFull} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-white transition-all">Restart</button>
                    <button onClick={onClose} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white transition-all">Return to Notes</button>
                </div>
            </div>
        </div>
      );
  }

  if (viewState === 'SUMMARY') {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md">
            <div className="text-center p-8 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-6">Round Complete</h2>
                <p className="mb-4 text-slate-400">Mastered: {masteredCount} | Learning: {learningQueue.length}</p>
                <button onClick={restartRound} className="w-full py-3 bg-white text-black hover:bg-gray-200 rounded-lg font-bold mb-3 transition-all">Keep Learning ({learningQueue.length})</button>
                <button onClick={onClose} className="w-full py-3 text-slate-400 hover:text-white transition-all">Exit</button>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-xl px-4">
        <div 
          onClick={() => setIsFlipped(!isFlipped)}
          className="relative w-full h-80 cursor-pointer group perspective"
          style={{ perspective: "1000px" }}
        >
           <div className={`relative w-full h-full duration-500 transition-transform ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
              <div className="absolute inset-0 bg-slate-900 border-2 border-slate-700 rounded-2xl flex items-center justify-center p-8 text-center" style={{ backfaceVisibility: "hidden" }}>
                 <h3 className="text-2xl font-bold text-white">{current?.front}</h3>
                 <p className="absolute bottom-4 text-xs text-slate-500 uppercase tracking-widest">Tap to Flip</p>
              </div>
              <div className="absolute inset-0 bg-emerald-950 border-2 border-emerald-500/50 rounded-2xl flex items-center justify-center p-8 text-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                 <h3 className="text-xl font-medium text-emerald-100">{current?.back}</h3>
              </div>
           </div>
        </div>
        <div className="flex gap-4 mt-8 justify-center">
           <button onClick={() => handleSwipe(false)} className="px-8 py-4 rounded-full bg-slate-800 text-slate-300 font-bold w-1/2 hover:bg-red-900/20 hover:text-red-200 transition-all border border-transparent hover:border-red-500/30">Still Learning</button>
           <button onClick={() => handleSwipe(true)} className="px-8 py-4 rounded-full bg-emerald-600 text-white font-bold w-1/2 hover:bg-emerald-500 transition-all shadow-lg hover:shadow-emerald-500/20">Mastered</button>
        </div>
        <button onClick={onClose} className="mt-8 text-slate-500 hover:text-white block mx-auto transition-colors">Exit Study Mode</button>
      </div>
    </div>
  );
}

// --- UTILS ---
function debounce(fn: any, wait = 1000) {
  let t: any;
  return (...args: any) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}


// --- MAIN PAGE ---
export default function DashboardPage() {
  const updateFromStorage = useLoominStore((s: any) => s.updateFromStorage);
  const journals = useLoominStore((s: any) => s.journals);
  const activeId = useLoominStore((s: any) => s.activeId);
  const setEditorValue = useLoominStore((s: any) => s.setEditorValue);
  const setVars = useLoominStore((s: any) => s.setVars);

  const [navOpen, setNavOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // AI & Sim State
  const [simStatus, setSimStatus] = useState("OPTIMAL");
  const [simMessage, setSimMessage] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [explanation, setExplanation] = useState("");
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [isAskOpen, setIsAskOpen] = useState(false);
  const [askPrompt, setAskPrompt] = useState("");
  const [isSimEnabled, setIsSimEnabled] = useState(true);
  
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [cardCount, setCardCount] = useState(5);

  // Video State - now synced per journal
  const [isVideoAnalyzing, setIsVideoAnalyzing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const setVideo = useLoominStore((s: any) => s.setVideo);

  const active = useMemo(() => journals.find((j: any) => j.id === activeId) || journals[0], [journals, activeId]);
  const editorValue = active?.editorValue ?? "";
  const vars = active?.vars ?? {};
  const videoSrc = active?.videoSrc ?? null;

  const debouncedRef = useRef<any>(null);

  useEffect(() => {
    updateFromStorage();
  }, [updateFromStorage]);

  // --- BRAIN: Simulation Engine ---
  const runSimulation = async (code: string) => {
    if (!isSimEnabled || !code || code.length < 5) return;
    try {
        const res = await fetch("/api/extract", { method: "POST", body: JSON.stringify({ notes: code }) });
        const data = await res.json();
        const sim = data.simulation || {};
        const extraction = data.extraction || {};
        
        setSimStatus(sim.status || "OPTIMAL");
        setSimMessage(sim.message || "");
        setRecommendation(sim.recommendation || "");
        setExplanation(sim.aiExplanation || "");

        // --- SMART PARSER INTEGRATION ---
        // Extract variables from natural text OR standard variables
        const newVars = extractVariablesFromText(code);
        
        // Auto-Switch Scene based on detected topic
        // ONLY if Scene_Mode wasn't explicitly set by the user
        // Scene_Mode >= 2 means user wants a specific generic visualization
        const userSetSceneMode = newVars.Scene_Mode !== undefined && newVars.Scene_Mode >= 2;
        
        if (!userSetSceneMode) {
            if (extraction.topic === 'robot_arm') {
                newVars.Scene_Mode = 1;
            } else if (extraction.topic === 'wind_turbine') {
                newVars.Scene_Mode = 0;
            } else if (extraction.topic === 'motherboard' || extraction.topic === 'circuit' || 
                       extraction.topic === 'mechanical' || extraction.topic === 'solar' || 
                       extraction.topic === 'engine' || extraction.topic === 'generic') {
                newVars.Scene_Mode = 2;
            }
        }

        // Apply Extracted Vars to Partner's Store
        setVars(newVars);

    } catch (e) { console.error("Sim error", e); }
  };

  const onEditorChange = useMemo(() => {
    const handler = (value: string | undefined) => {
      const v = value ?? "";
      // Instant Visual Update (Smart Parse)
      const parsedVars = extractVariablesFromText(v);
      setEditorValue(v);
      setVars(parsedVars);
      // Run Sim
      runSimulation(v);
    };
    debouncedRef.current = debounce(handler, 1000); 
    return (value: string | undefined) => {
        const v = value ?? "";
        setEditorValue(v); 
        setVars(extractVariablesFromText(v)); // Immediate visual update
        debouncedRef.current?.(v);
    };
  }, [setEditorValue, setVars, isSimEnabled]);

  // --- SMART AUTO-FIX ---
  // Updates existing parameters IN-PLACE with inline comments showing what changed
  const handleAutoFix = () => {
    setIsAutoFixing(true);
    let updatedCode = editorValue;
    const changes: string[] = [];
    
    // Parse recommendation for specific fixes (handle decimals)
    const windMatch = recommendation.match(/wind_speed.*?(\d+(?:\.\d+)?)/i);
    const bladeMatch = recommendation.match(/blade_count.*?(\d+)/i);
    const payloadMatch = recommendation.match(/payload.*?(\d+(?:\.\d+)?)/i);
    
    // FALLBACK: If we detect a robot arm failure but no payload in recommendation,
    // calculate safe payload directly (max torque 600 Nm, assume arm_length = 1m)
    const isRobotArmFailure = simMessage.toLowerCase().includes('torque') || 
                               simMessage.toLowerCase().includes('gear') ||
                               simMessage.toLowerCase().includes('shoulder');
    
    // Check if there's a payload in the code that needs fixing
    const currentPayloadMatch = editorValue.match(/[Pp]ayload\s*=\s*(\d+(?:\.\d+)?)/);
    const currentPayload = currentPayloadMatch ? parseFloat(currentPayloadMatch[1]) : 0;
    
    // Helper: Replace parameter in various formats with inline change comment
    const replaceParam = (
      code: string, 
      pattern: RegExp, 
      newVal: string, 
      paramName: string
    ): { code: string; oldVal: string | null } => {
      const match = code.match(pattern);
      if (match) {
        const oldVal = match[1];
        // Replace the entire match with the new value
        const modified = code.replace(pattern, `${paramName} = ${newVal}  // fixed from ${oldVal}`);
        return { code: modified, oldVal };
      }
      return { code, oldVal: null };
    };
    
    // Fix wind speed - match various formats
    if (windMatch) {
      const newVal = windMatch[1];
      const result = replaceParam(updatedCode, /[Ww]ind[_\s]*[Ss]peed\s*=\s*(\d+(?:\.\d+)?)\s*(?:mph|m\/s|kmh)?/, newVal, 'Wind_Speed');
      if (result.oldVal) {
        updatedCode = result.code;
        changes.push(`Wind_Speed: ${result.oldVal} -> ${newVal}`);
      }
    }
    
    // Fix blade count - match various formats
    if (bladeMatch) {
      const newVal = bladeMatch[1];
      const result = replaceParam(updatedCode, /[Bb]lade[_\s]*[Cc]ount\s*=\s*(\d+)/, newVal, 'Blade_Count');
      if (result.oldVal) {
        updatedCode = result.code;
        changes.push(`Blade_Count: ${result.oldVal} -> ${newVal}`);
      }
    }
    
    // Fix payload - DIRECT approach for robot arm failures
    if (isRobotArmFailure) {
      // Calculate safe payload: max torque 600 Nm / (arm_length * 9.8)
      // Default arm_length = 1m, so max safe payload ≈ 61 kg, use 60 for safety margin
      let safePayload = "60";
      
      // Try to get specific value from recommendation
      if (payloadMatch) {
        safePayload = Math.round(parseFloat(payloadMatch[1])).toString();
      }
      
      // Find payload in code using multiple patterns
      const lines = updatedCode.split('\n');
      const newLines = lines.map(line => {
        // Match various payload formats: "payload = 100", "payload = 100 kg", "Payload = 100"
        const payloadLineMatch = line.match(/^(\s*)([Pp]ayload)\s*=\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)?(.*)$/);
        if (payloadLineMatch) {
          const [, indent, varName, oldVal] = payloadLineMatch;
          changes.push(`Payload: ${oldVal} -> ${safePayload} kg`);
          return `${indent}${varName} = ${safePayload}  // fixed from ${oldVal}`;
        }
        return line;
      });
      updatedCode = newLines.join('\n');
    }
    
    // Only add summary if we made changes
    if (changes.length > 0) {
      const fixSummary = `// AUTO-FIX: ${changes.join(' | ')}
// Reason: ${simMessage.substring(0, 80)}${simMessage.length > 80 ? '...' : ''}

`;
      updatedCode = fixSummary + updatedCode;
    }
    
    setEditorValue(updatedCode);
    setVars(extractVariablesFromText(updatedCode));
    runSimulation(updatedCode);
    
    setTimeout(() => setIsAutoFixing(false), 800);
  };

  const handleAskLoomin = async () => {
    const promptHeader = `\n// ??? ASK LOOMIN: ${askPrompt}\n// -------------------------\n`;
    try {
        const res = await fetch('/api/ask', { method: 'POST', body: JSON.stringify({ prompt: askPrompt, context: editorValue }) });
        const data = await res.json();
        const newCode = promptHeader + data.result + "\n\n" + editorValue;
        
        setEditorValue(newCode);
        setVars(extractVariablesFromText(newCode));
        setIsAskOpen(false); 
        setAskPrompt("");
        runSimulation(newCode);
    } catch(e) {}
  };

  // --- VIDEO ANALYSIS ---
  const handleVideoUpload = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
          const url = URL.createObjectURL(file);
          setVideo(url); // Store in journal state
          setIsVideoAnalyzing(true);
          
          try {
              // Call the analyze_document API for real analysis
              const formData = new FormData();
              formData.append('file', file);
              formData.append('fileName', file.name);
              formData.append('fileType', 'video');

              const response = await fetch('/api/analyze_document', {
                  method: 'POST',
                  body: formData,
              });

              const result = await response.json();
              setIsVideoAnalyzing(false);

              if (result.generatedNotes) {
                  setEditorValue(result.generatedNotes);
                  setVars(result.suggestedVars || {});
                  runSimulation(result.generatedNotes);
              }
          } catch (err) {
              console.error('Video analysis error:', err);
              setIsVideoAnalyzing(false);
              // Fallback to basic analysis
              const analysisNote = `## Video Analysis: ${file.name}

### Overview
Video uploaded for analysis. Add notes below to configure the simulation.

---

### Simulation Parameters
Wind_Speed = 25
Blade_Count = 3
Scene_Mode = 0
`;
              setEditorValue(analysisNote);
              setVars({ Wind_Speed: 25, Blade_Count: 3, Scene_Mode: 0 });
              runSimulation(analysisNote);
          }
      }
  };

  const generateDeck = async () => {
    setDeckLoading(true);
    const res = await fetch('/api/flashcards', { method: 'POST', body: JSON.stringify({ notes: editorValue, count: cardCount }) });
    const data = await res.json();
    setFlashcards(data.cards || []);
    setDeckLoading(false);
    setIsStudyMode(true);
  };

  // Handle document upload completion
  const handleUploadComplete = (result: any) => {
    if (!result) return;
    
    // Set the generated notes in the editor
    if (result.generatedNotes) {
      setEditorValue(result.generatedNotes);
      setVars(result.suggestedVars || {});
      runSimulation(result.generatedNotes);
    }
    
    // Set video if uploaded - stored per journal
    if (result.videoUrl) {
      setVideo(result.videoUrl);
    }
  };

  // Create new journal with upload prompt
  const createJournalWithUpload = useLoominStore((s: any) => s.createJournal);
  const handleNewJournal = () => {
    createJournalWithUpload(`Journal ${journals.length + 1}`);
    setShowUploadModal(true);
  };

  return (
    <div className="h-[100vh] overflow-hidden bg-[#070A0F] text-white selection:bg-white/20 font-sans">
      <style>{`
        .loomin-scroll{scrollbar-gutter:stable}
        .loomin-scroll::-webkit-scrollbar{width:10px}
        .loomin-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.04);border-radius:999px}
        .loomin-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border:2px solid rgba(0,0,0,0);background-clip:padding-box;border-radius:999px}
        .loomin-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.20);border:2px solid rgba(0,0,0,0);background-clip:padding-box}
      `}</style>

      {isStudyMode && <FlashcardMode initialCards={flashcards} onClose={() => setIsStudyMode(false)} />}
      
      <UploadModal 
        isOpen={showUploadModal} 
        onClose={() => setShowUploadModal(false)} 
        onComplete={handleUploadComplete}
      />

      <div className="pointer-events-none fixed inset-0 opacity-[0.65]" style={{ background: "radial-gradient(1200px 600px at 70% 20%, rgba(99,102,241,0.22), transparent 55%), radial-gradient(900px 520px at 20% 80%, rgba(16,185,129,0.16), transparent 58%)" }} />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-[0.08]" />

      <div className="relative mx-auto h-full max-w-[1800px] px-4 py-4 grid grid-cols-[200px,1fr] gap-3">
        {/* LEFT SIDEBAR - Journals */}
        <JournalsNav open={navOpen} onToggle={() => setNavOpen((v) => !v)} onNewJournal={handleNewJournal} />

        {/* MAIN CONTENT AREA */}
        <div className="min-h-0 grid grid-rows-[auto,1fr] gap-3">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md flex items-center justify-center">
                <div className="h-4 w-4 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300 opacity-95" />
              </div>
              <div className="leading-tight">
                <div className="text-sm tracking-[0.18em] uppercase text-white/55">Loomin</div>
                <div className="text-[15px] font-semibold text-white/92">{active?.name ?? "Journal"}</div>
              </div>
            </div>

            {/* CONTROLS */}
            <div className="flex items-center gap-2">
                <button onClick={() => setIsAskOpen(!isAskOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-lg text-sm text-indigo-200 transition-all">
                    <Sparkles className="w-3.5 h-3.5" />
                    Ask AI
                </button>
                
                <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
                    <button onClick={generateDeck} disabled={deckLoading} className="flex items-center gap-2 px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded text-xs transition-all border border-transparent hover:border-emerald-500/30">
                        <BookOpen className="w-3 h-3" />
                        {deckLoading ? "..." : "Study"}
                    </button>
                </div>

                <button onClick={() => setIsSimEnabled(!isSimEnabled)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${isSimEnabled ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-300' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                    {isSimEnabled ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                    <span className="text-xs font-bold">{isSimEnabled ? "LIVE" : "PAUSED"}</span>
                </button>

                {/* Logout Button */}
                <a href="/api/auth/logout" className="flex items-center gap-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-sm text-red-200 transition-all">
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
                </a>
            </div>

            {/* Status Indicator */}
            <div className="hidden md:flex items-center gap-2 rounded-2xl bg-white/6 ring-1 ring-white/12 px-3 py-2 backdrop-blur-md">
              <div className={`h-2 w-2 rounded-full shadow-[0_0_18px_rgba(52,211,153,0.55)] transition-colors ${simStatus === 'CRITICAL_FAILURE' ? 'bg-red-500 animate-pulse' : 'bg-emerald-400/90'}`} />
              <div className={`text-xs ${simStatus === 'CRITICAL_FAILURE' ? 'text-red-300' : 'text-white/65'}`}>{simStatus === 'CRITICAL_FAILURE' ? 'Error Detected' : 'System Ready'}</div>
            </div>
          </header>

          <div className="min-h-0 grid grid-cols-12 gap-3">
            
            {/* LEFT COLUMN - Editor (larger) */}
            <motion.section 
               animate={{ gridColumn: isSimEnabled ? "span 7" : "span 12" }} 
               className={`min-h-0 flex flex-col gap-3 ${isSimEnabled ? 'col-span-7' : 'col-span-12'}`}
            >
              
              <AnimatePresence>
                  {isAskOpen && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden">
                        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-2 flex gap-2">
                            <input autoFocus className="flex-1 bg-transparent border-none outline-none text-sm px-2 placeholder:text-indigo-300/30 text-white" placeholder="Ex: Optimize for high wind..." value={askPrompt} onChange={(e)=>setAskPrompt(e.target.value)} onKeyDown={(e)=>e.key==='Enter' && handleAskLoomin()} />
                            <button onClick={handleAskLoomin} className="px-3 py-1 bg-indigo-500 hover:bg-indigo-400 rounded text-xs font-bold transition-colors">Go</button>
                        </div>
                    </motion.div>
                  )}
              </AnimatePresence>

              {/* VIDEO ANALYZER */}
              <div className={`rounded-3xl bg-white/[0.055] ring-1 ring-white/12 backdrop-blur-xl overflow-hidden flex flex-col transition-all duration-300 ${isFullscreen ? 'fixed inset-4 z-[100]' : 'h-[28%] min-h-[140px]'}`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-semibold text-white/90">Video / Media</div>
                  <div className="flex gap-3 items-center">
                      <label className="cursor-pointer text-xs flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
                          <Upload className="w-3.5 h-3.5" />
                          Upload
                          <input type="file" accept="video/*,.mp4,.webm,.mov" className="hidden" onChange={handleVideoUpload} />
                      </label>
                      <button 
                        onClick={() => setIsFullscreen(!isFullscreen)} 
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                      >
                          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 p-3 relative">
                  {isVideoAnalyzing && (
                      <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center rounded-2xl">
                          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                          <p className="text-sm text-indigo-300 animate-pulse">Analyzing Video Content...</p>
                          <p className="text-xs text-white/40 mt-1">Generating lecture notes & simulation</p>
                      </div>
                  )}
                  <div className="relative h-full rounded-2xl overflow-hidden bg-black ring-1 ring-white/10">
                    {videoSrc ? (
                        <video 
                          ref={videoRef}
                          className={`w-full h-full ${isFullscreen ? 'object-contain' : 'object-cover'}`} 
                          controls 
                          playsInline 
                          src={videoSrc}
                          style={{ maxHeight: isFullscreen ? 'calc(100vh - 120px)' : '100%' }}
                        />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-white/30 gap-2">
                          <Upload className="w-8 h-8 text-white/20" />
                          <p className="text-sm">Drop a video or click Upload</p>
                          <p className="text-xs text-white/20">Supports MP4, WebM, MOV</p>
                        </div>
                    )}
                  </div>
                </div>
              </div>

              {/* EDITOR */}
              <div className="flex-1 min-h-0 rounded-3xl bg-white/[0.055] ring-1 ring-white/12 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden grid grid-rows-[auto,1fr]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-semibold text-white/90">Editor</div>
                  <div className="text-xs text-white/55">Live Config</div>
                </div>
                <div className="min-h-0 p-2 relative">
                    <div className="h-full overflow-hidden rounded-2xl ring-1 ring-white/10 bg-[#0B1020]/70">
                    <Monaco
                        theme="vs-dark"
                        language="markdown"
                        value={editorValue}
                        onChange={onEditorChange}
                        options={{ 
                          minimap: { enabled: false }, 
                          fontSize: 13, 
                          lineHeight: 20, 
                          padding: { top: 14, bottom: 14 }, 
                          smoothScrolling: true,
                          wordWrap: "on",
                          wrappingIndent: "same",
                          lineNumbers: "on"
                        }}
                    />
                    </div>
                </div>
              </div>
            </motion.section>

            {/* RIGHT COLUMN (3D SANDBOX) */}
            <AnimatePresence>
                {isSimEnabled && (
                    <motion.section 
                        initial={{ opacity: 0, x: 20 }} 
                        animate={{ opacity: 1, x: 0, gridColumn: "span 5" }} 
                        exit={{ opacity: 0, x: 20, gridColumn: "span 0" }}
                        className="min-h-0 col-span-5 relative h-full rounded-3xl bg-white/[0.055] ring-1 ring-white/12 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_90px_rgba(0,0,0,0.55)] overflow-hidden grid grid-rows-[auto,1fr]"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-semibold text-white/90">3D Sandbox</div>
                          </div>
                          <div className="text-xs text-white/55">Interactive</div>
                        </div>

                        <div className="relative min-h-0">
                          <Scene />
                          
                          <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-2xl bg-white/10 ring-1 ring-white/15 px-3 py-2 backdrop-blur-xl z-10">
                            <Leaf className="h-4 w-4 text-emerald-300/90" />
                            <div className="text-xs font-semibold text-white/85">Sustainability</div>
                          </div>

                          <AnimatePresence>
                            {simStatus === 'CRITICAL_FAILURE' && (
                                <motion.div initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.9}} className="absolute top-16 left-8 z-50 w-80">
                                    <div className="p-6 rounded-xl border bg-red-950/80 border-red-500/50 backdrop-blur-xl shadow-2xl">
                                        <div className="flex items-center gap-2 mb-3">
                                            <AlertTriangle className="w-5 h-5 text-red-400" />
                                            <p className="text-lg font-mono font-bold text-red-400">CRITICAL_FAILURE</p>
                                        </div>
                                        <p className="text-xs text-red-100/80 mb-4 leading-relaxed">{explanation}</p>
                                        <button onClick={handleAutoFix} disabled={isAutoFixing} className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-lg">
                                            <Wrench className="w-3.5 h-3.5" />
                                            {isAutoFixing ? "FIXING..." : "AUTO-FIX CODE"}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                          </AnimatePresence>

                          <AnimatePresence>
                            {simStatus === 'OPTIMAL' && (
                                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute top-16 left-8 z-40 pointer-events-none">
                                    <div className="px-4 py-2 rounded-xl border bg-emerald-950/40 border-emerald-500/30 backdrop-blur-md">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            <p className="text-sm font-mono font-bold text-emerald-400">OPTIMAL</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
