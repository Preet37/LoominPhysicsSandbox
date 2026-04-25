"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Layers, HelpCircle, ChevronLeft, ChevronRight,
  RotateCcw, Loader2, CheckCircle, XCircle, Sparkles,
  Volume2, VolumeX, Trophy, AlertTriangle, BookOpen,
} from "lucide-react";

// ── Shared utility ────────────────────────────────────────────────────────────

function useVoice() {
  const [speaking, setSpeaking] = useState(false);
  const speak = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.pitch = 1;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);
  const stop = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  return { speak, stop, speaking };
}

// ── Flashcard mode ────────────────────────────────────────────────────────────

function FlashCard({ card, index, total, onNext, onPrev, voiceEnabled }) {
  const [flipped, setFlipped] = useState(false);
  const { speak, stop, speaking } = useVoice();

  useEffect(() => { setFlipped(false); }, [index]);

  const handleFlip = () => {
    setFlipped((v) => !v);
    if (voiceEnabled) {
      if (!flipped) speak(card.back);
      else speak(card.front);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress */}
      <div className="flex items-center gap-2 w-full">
        <span className="text-[11px] text-white/35">{index + 1} / {total}</span>
        <div className="flex-1 h-1 rounded-full bg-white/8">
          <div className="h-1 rounded-full bg-indigo-500/60 transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </div>

      {/* Card */}
      <div
        className="relative w-full cursor-pointer select-none"
        style={{ perspective: 1200, minHeight: 200 }}
        onClick={handleFlip}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.45, type: "spring", stiffness: 260, damping: 28 }}
          style={{ transformStyle: "preserve-3d", position: "relative", width: "100%", minHeight: 200 }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-6 flex flex-col items-center justify-center text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Question</div>
            <p className="text-[15px] font-semibold text-white/90 leading-relaxed">{card.front}</p>
            <div className="mt-4 text-[10px] text-white/25 flex items-center gap-1.5">
              <RotateCcw className="h-3 w-3" />
              Tap to reveal answer
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl border border-indigo-500/25 bg-indigo-950/40 px-6 py-6 flex flex-col items-center justify-center text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div className="text-[10px] uppercase tracking-widest text-indigo-300/50 mb-3">Answer</div>
            <p className="text-[14px] text-white/85 leading-relaxed">{card.back}</p>
            <div className="mt-4 text-[10px] text-white/25">Tap to see question again</div>
          </div>
        </motion.div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 w-full">
        <button
          onClick={onPrev}
          disabled={index === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-[12px] text-white/60 disabled:opacity-30 hover:bg-white/10 transition flex-1 justify-center"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        {voiceEnabled && (
          <button
            onClick={() => speaking ? stop() : speak(flipped ? card.back : card.front)}
            className="h-9 w-9 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center flex-shrink-0 hover:bg-indigo-500/25 transition"
          >
            {speaking ? <VolumeX className="h-4 w-4 text-indigo-400" /> : <Volume2 className="h-4 w-4 text-indigo-400" />}
          </button>
        )}
        <button
          onClick={onNext}
          disabled={index === total - 1}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-[12px] text-white/60 disabled:opacity-30 hover:bg-white/10 transition flex-1 justify-center"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FlashcardsMode({ cards, loading, onGenerate, topic, voiceEnabled }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [cards]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mb-3" />
        <p className="text-sm text-white/50">Generating flashcards…</p>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/35 mb-2">No flashcards yet</p>
        <p className="text-xs text-white/20 mb-6 max-w-[220px]">
          Generate flashcards from your current physics notes. The AI will create Q&A cards covering key concepts.
        </p>
        <button
          onClick={onGenerate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 text-[12px] text-indigo-300 font-semibold transition"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate Flashcards
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FlashCard
        card={cards[idx]}
        index={idx}
        total={cards.length}
        onNext={() => setIdx((i) => Math.min(i + 1, cards.length - 1))}
        onPrev={() => setIdx((i) => Math.max(i - 1, 0))}
        voiceEnabled={voiceEnabled}
      />
      <button
        onClick={onGenerate}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/8 text-[11px] text-white/40 hover:text-white/60 transition"
      >
        <RotateCcw className="h-3 w-3" />
        Regenerate cards
      </button>
    </div>
  );
}

// ── Quiz mode ─────────────────────────────────────────────────────────────────

const DIFF_COLOR = { easy: "text-emerald-400", medium: "text-amber-400", hard: "text-red-400" };

function QuizQuestion({ q, index, total, onAnswer, answered, voiceEnabled }) {
  const { speak } = useVoice();
  const [selected, setSelected] = useState(null);
  const letters = ["A", "B", "C", "D"];

  useEffect(() => { setSelected(null); }, [index]);

  const pick = (i) => {
    if (selected !== null) return;
    setSelected(i);
    onAnswer(i === q.correctIndex);
    if (voiceEnabled) {
      const correct = i === q.correctIndex;
      speak(correct ? "Correct! " + q.explanation : "Not quite. " + q.explanation);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/35">Question {index + 1} of {total}</span>
        <div className="flex items-center gap-2">
          {q.difficulty && (
            <span className={`text-[10px] font-medium ${DIFF_COLOR[q.difficulty] || "text-white/35"}`}>
              {q.difficulty}
            </span>
          )}
          {q.concept && (
            <span className="text-[10px] text-white/25 max-w-[120px] truncate">{q.concept}</span>
          )}
        </div>
      </div>

      {/* Question text */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
        <p className="text-[14px] text-white/90 leading-relaxed font-medium">{q.question}</p>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          let style = "border-white/10 bg-white/[0.025] text-white/75 hover:border-white/20 hover:bg-white/[0.04]";
          if (selected !== null) {
            if (i === q.correctIndex) style = "border-emerald-500/50 bg-emerald-950/30 text-emerald-300";
            else if (i === selected && i !== q.correctIndex) style = "border-red-500/50 bg-red-950/30 text-red-300";
            else style = "border-white/5 bg-transparent text-white/30";
          }
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={selected !== null}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-[13px] text-left transition ${style} disabled:cursor-default`}
            >
              <span className="font-mono text-[11px] w-5 h-5 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                {letters[i]}
              </span>
              <span className="flex-1">{opt}</span>
              {selected !== null && i === q.correctIndex && <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
              {selected !== null && i === selected && i !== q.correctIndex && <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Explanation (shown after answer) */}
      <AnimatePresence>
        {selected !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border px-4 py-3 ${
              selected === q.correctIndex
                ? "border-emerald-500/25 bg-emerald-950/20"
                : "border-amber-500/25 bg-amber-950/15"
            }`}
          >
            <div className="flex items-start gap-2">
              <BookOpen className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${selected === q.correctIndex ? "text-emerald-400" : "text-amber-400"}`} />
              <p className="text-[12px] leading-relaxed text-white/70">{q.explanation}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuizScore({ score, total, onRestart }) {
  const pct = Math.round((score / total) * 100);
  const label = pct >= 80 ? "Excellent!" : pct >= 60 ? "Good job!" : "Keep practising";
  const color = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center py-8 space-y-4"
    >
      <Trophy className={`h-12 w-12 ${color}`} />
      <div>
        <p className={`text-3xl font-bold ${color}`}>{pct}%</p>
        <p className="text-[13px] text-white/50 mt-1">{score} / {total} correct</p>
        <p className="text-sm text-white/35 mt-0.5">{label}</p>
      </div>
      {pct < 80 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 px-4 py-3 max-w-[280px]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/60 text-left">
              Review the concepts marked wrong and try the quiz again to reinforce learning.
            </p>
          </div>
        </div>
      )}
      <button
        onClick={onRestart}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 text-[12px] text-indigo-300 font-semibold transition"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </button>
    </motion.div>
  );
}

function QuizMode({ questions, loading, onGenerate, topic, voiceEnabled }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setIdx(0);
    setAnswers([]);
    setDone(false);
  }, [questions]);

  const handleAnswer = useCallback((correct) => {
    const next = [...answers, correct];
    setAnswers(next);
    if (next.length === questions.length) {
      setTimeout(() => setDone(true), 1200);
    } else {
      setTimeout(() => setIdx((i) => i + 1), 1800);
    }
  }, [answers, questions.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-violet-400 animate-spin mb-3" />
        <p className="text-sm text-white/50">Generating quiz questions…</p>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <HelpCircle className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/35 mb-2">No quiz yet</p>
        <p className="text-xs text-white/20 mb-6 max-w-[220px]">
          Generate a multiple-choice quiz from your notes. Questions are calibrated to your current physics topic.
        </p>
        <button
          onClick={onGenerate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/20 ring-1 ring-violet-500/30 hover:bg-violet-500/30 text-[12px] text-violet-300 font-semibold transition"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate Quiz
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <QuizScore
        score={answers.filter(Boolean).length}
        total={questions.length}
        onRestart={() => { setIdx(0); setAnswers([]); setDone(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <QuizQuestion
        q={questions[idx]}
        index={idx}
        total={questions.length}
        onAnswer={handleAnswer}
        answered={answers.length > idx}
        voiceEnabled={voiceEnabled}
      />
      {/* Minimap */}
      <div className="flex gap-1 flex-wrap">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition ${
              i < answers.length
                ? answers[i] ? "bg-emerald-400" : "bg-red-400"
                : i === idx ? "bg-indigo-400" : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Learn Panel ──────────────────────────────────────────────────────────

const COUNTS = [5, 8, 10];

export default function LearnPanel({ editorValue, topic, artifactsGenerating }) {
  const [mode, setMode] = useState("flashcards"); // "flashcards" | "quiz"
  const [cards, setCards] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [cardCount, setCardCount] = useState(8);
  const [quizCount, setQuizCount] = useState(5);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    setVoiceSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  const generateCards = useCallback(async () => {
    if (!editorValue?.trim() && !topic) return;
    setLoadingCards(true);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editorValue?.slice(0, 3000) || "", count: cardCount }),
      });
      const data = await res.json();
      setCards(data.cards || []);
    } catch (e) {
      console.warn("[flashcards]", e);
    } finally {
      setLoadingCards(false);
    }
  }, [editorValue, topic, cardCount]);

  const generateQuiz = useCallback(async () => {
    if (!editorValue?.trim() && !topic) return;
    setLoadingQuiz(true);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editorValue?.slice(0, 3000) || "", topic, count: quizCount }),
      });
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (e) {
      console.warn("[quiz]", e);
    } finally {
      setLoadingQuiz(false);
    }
  }, [editorValue, topic, quizCount]);

  const hasContent = editorValue?.length > 100;

  return (
    <div className="h-full min-h-0 overflow-y-scroll loomin-scroll px-3 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-violet-400" />
          <span className="text-[13px] font-semibold text-white/80">Learn</span>
          {topic && <span className="text-[10px] text-white/30 truncate max-w-[100px]">{topic}</span>}
        </div>
        {voiceSupported && (
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            title={voiceEnabled ? "Disable voice" : "Enable voice narration"}
            className={`h-7 w-7 rounded-lg flex items-center justify-center ring-1 transition ${
              voiceEnabled ? "bg-violet-500/20 ring-violet-500/30 text-violet-400" : "bg-white/5 ring-white/10 text-white/30"
            }`}
          >
            {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/5 ring-1 ring-white/10">
        <button
          onClick={() => setMode("flashcards")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
            mode === "flashcards" ? "bg-indigo-600/40 ring-1 ring-indigo-500/50 text-indigo-200" : "text-white/40 hover:text-white/60"
          }`}
        >
          <Layers className="h-3 w-3" />
          Flashcards
        </button>
        <button
          onClick={() => setMode("quiz")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
            mode === "quiz" ? "bg-violet-600/40 ring-1 ring-violet-500/50 text-violet-200" : "text-white/40 hover:text-white/60"
          }`}
        >
          <HelpCircle className="h-3 w-3" />
          Quiz
        </button>
      </div>

      {/* Count selector */}
      {!hasContent && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/60">Generate physics notes first — then come back to create flashcards and quizzes from them.</p>
          </div>
        </div>
      )}

      {hasContent && mode === "flashcards" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/35">Number of cards</span>
            <div className="flex gap-1">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCardCount(c)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition ${cardCount === c ? "bg-indigo-500/30 ring-1 ring-indigo-500/40 text-indigo-300" : "bg-white/5 ring-1 ring-white/10 text-white/40 hover:text-white/60"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <FlashcardsMode
            cards={cards}
            loading={loadingCards}
            onGenerate={generateCards}
            topic={topic}
            voiceEnabled={voiceEnabled}
          />
        </>
      )}

      {hasContent && mode === "quiz" && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/35">Number of questions</span>
            <div className="flex gap-1">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setQuizCount(c)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition ${quizCount === c ? "bg-violet-500/30 ring-1 ring-violet-500/40 text-violet-300" : "bg-white/5 ring-1 ring-white/10 text-white/40 hover:text-white/60"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <QuizMode
            questions={questions}
            loading={loadingQuiz}
            onGenerate={generateQuiz}
            topic={topic}
            voiceEnabled={voiceEnabled}
          />
        </>
      )}
    </div>
  );
}
