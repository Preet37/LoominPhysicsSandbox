"use client";

import { useState, useRef } from "react";
import { Paperclip, Upload, X, Loader2, FileText, FileVideo, Globe, Trash2, Sparkles, CheckCircle, AlertCircle, Youtube, FilePlus } from "lucide-react";

const ACCEPT = ".pdf,.doc,.docx,.txt,.ppt,.pptx,video/*";

function getFileIcon(type) {
  if (!type) return <FileText className="h-4 w-4 text-white/40" />;
  if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-400" />;
  if (type.includes("video") || type === "youtube") return <FileVideo className="h-4 w-4 text-indigo-400" />;
  if (type === "url") return <Globe className="h-4 w-4 text-cyan-400" />;
  return <FileText className="h-4 w-4 text-emerald-400" />;
}

function SourceCard({ source, onRemove, onGenerateNotes }) {
  return (
    <div className="group rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5 hover:border-white/15 transition">
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 mt-0.5">
          {getFileIcon(source.fileType)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/80 truncate">{source.name}</p>
          <p className="text-[10px] text-white/35 mt-0.5">
            {source.fileType?.toUpperCase()} · {source.date}
            {source.wordCount ? ` · ~${source.wordCount} words` : ""}
          </p>
          {source.detectedTopic && (
            <p className="text-[10px] text-indigo-300/60 mt-0.5">
              Topic: {source.detectedTopic.replace(/_/g, " ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {source.status === "ready" && (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
          )}
          {source.status === "error" && (
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
          )}
          {source.status === "processing" && (
            <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
          )}
          <button
            onClick={() => onRemove(source.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-300 transition"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {source.summary && (
        <p className="text-[11px] text-white/45 mt-2 line-clamp-2 pl-6">{source.summary}</p>
      )}
      {source.status === "ready" && onGenerateNotes && (
        <div className="mt-2 pl-6">
          <button
            onClick={() => onGenerateNotes(source)}
            className="flex items-center gap-1.5 text-[11px] text-indigo-300/70 hover:text-indigo-300 transition"
          >
            <Sparkles className="h-3 w-3" />
            Generate notes from this source
          </button>
        </div>
      )}
    </div>
  );
}

function UrlInput({ onAdd }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const u = url.trim();
    if (!u || loading) return;
    setLoading(true);
    try {
      const isYoutube = u.includes("youtube.com") || u.includes("youtu.be");
      const res = await fetch("/api/analyze_document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u, fileType: isYoutube ? "youtube" : "url" }),
      });
      const data = await res.json();
      if (data.success) {
        onAdd({
          id: Date.now().toString(),
          name: data.title || u.slice(0, 60),
          fileType: isYoutube ? "youtube" : "url",
          url: u,
          status: "ready",
          date: new Date().toLocaleDateString(),
          summary: data.summary?.slice(0, 200),
          detectedTopic: data.detectedTopic,
          generatedNotes: data.generatedNotes,
          wordCount: data.wordCount,
        });
        setUrl("");
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 flex-1 rounded-xl bg-white/5 ring-1 ring-white/10 focus-within:ring-indigo-500/40 px-3 py-2 transition">
        <Globe className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="YouTube URL or webpage…"
          className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
        />
        {url && (
          <button onClick={() => setUrl("")} className="p-0.5 text-white/20 hover:text-white/50">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <button
        onClick={submit}
        disabled={!url.trim() || loading}
        className="px-3 py-2 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 text-[11px] text-indigo-300 font-semibold disabled:opacity-40 transition flex items-center gap-1.5"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus className="h-3.5 w-3.5" />}
        Add
      </button>
    </div>
  );
}

export default function SourcesPanel({ sources = [], onAddSource, onRemoveSource, onGenerateFromSource }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const fileRef = useRef();

  const processFile = async (file) => {
    if (!file) return;
    setUploading(true);
    const tempId = Date.now().toString();

    onAddSource({
      id: tempId,
      name: file.name,
      fileType: file.type.includes("pdf") ? "pdf" : file.type.includes("video") ? "video" : "document",
      status: "processing",
      date: new Date().toLocaleDateString(),
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", file.name);
      formData.append("fileType", file.type.includes("pdf") ? "pdf" : file.type.includes("video") ? "video" : "document");

      const res = await fetch("/api/analyze_document", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        // Replace temp entry with full data
        onRemoveSource(tempId);
        onAddSource({
          id: data.id || Date.now().toString(),
          name: file.name,
          fileType: file.type.includes("pdf") ? "pdf" : file.type.includes("video") ? "video" : "document",
          status: "ready",
          date: new Date().toLocaleDateString(),
          summary: data.summary?.slice(0, 250),
          detectedTopic: data.detectedTopic,
          generatedNotes: data.generatedNotes,
          wordCount: data.wordCount,
          keyPoints: data.keyPoints,
        });
      } else {
        onRemoveSource(tempId);
        onAddSource({
          id: tempId,
          name: file.name,
          fileType: "document",
          status: "error",
          date: new Date().toLocaleDateString(),
        });
      }
    } catch {
      onRemoveSource(tempId);
      onAddSource({
        id: tempId,
        name: file.name,
        fileType: "document",
        status: "error",
        date: new Date().toLocaleDateString(),
      });
    }
    setUploading(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div className="h-full min-h-0 overflow-y-scroll loomin-scroll px-3 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-indigo-400" />
          <span className="text-[13px] font-semibold text-white/80">Sources</span>
          {sources.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/40">{sources.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setUrlMode((v) => !v)}
            className={`p-1.5 rounded-lg transition text-[11px] ${urlMode ? "bg-cyan-500/20 text-cyan-300" : "hover:bg-white/8 text-white/35"}`}
            title="Add URL / YouTube"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-500/25 hover:bg-indigo-500/25 text-[11px] text-indigo-300 disabled:opacity-40 transition"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </button>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => processFile(e.target.files?.[0])} />
      </div>

      {/* URL input */}
      {urlMode && (
        <UrlInput onAdd={(source) => { onAddSource(source); setUrlMode(false); }} />
      )}

      {/* Drop zone */}
      {sources.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition ${
            dragOver ? "border-indigo-500 bg-indigo-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.02]"
          }`}
        >
          <Upload className="h-8 w-8 text-white/20" />
          <div className="text-center">
            <p className="text-[13px] text-white/40">Drop files here</p>
            <p className="text-[11px] text-white/25 mt-1">PDF · DOCX · TXT · MP4 · PPT</p>
          </div>
        </div>
      )}

      {/* Upload zone (compact when sources exist) */}
      {sources.length > 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-xl border border-dashed p-3 flex items-center gap-3 transition cursor-pointer ${
            dragOver ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 hover:border-white/20"
          }`}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4 text-white/25" />
          <p className="text-[11px] text-white/30">Drop another file here, or click to browse</p>
        </div>
      )}

      {/* Source list */}
      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              onRemove={onRemoveSource}
              onGenerateNotes={onGenerateFromSource}
            />
          ))}
        </div>
      )}

      {/* Info */}
      <div className="rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
        <p className="text-[10px] text-white/30 leading-relaxed">
          <strong className="text-white/45">NotebookLM-style grounding:</strong> Uploaded sources ground AI responses in your actual content. The agent uses your documents as the primary reference when generating notes.
          Supports PDF, DOCX, TXT, video files, YouTube links, and web pages.
        </p>
      </div>
    </div>
  );
}
