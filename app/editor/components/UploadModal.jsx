"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileVideo, FileText, X, Loader2, Sparkles, CheckCircle } from "lucide-react";

export default function UploadModal({ isOpen, onClose, onComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const isVideo = selectedFile.type.includes('video');
      const fileType = isVideo ? 'video' : 
                       selectedFile.type.includes('pdf') ? 'PDF' : 
                       selectedFile.type.includes('image') ? 'image' : 'document';

      // For videos, only send metadata (files can be too large for serverless)
      // For smaller files, send the actual file
      let response;
      
      if (isVideo || selectedFile.size > 4 * 1024 * 1024) {
        // Send only metadata for large files
        response = await fetch('/api/analyze_document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileType: fileType,
            metadataOnly: true
          }),
        });
      } else {
        // Send full file for smaller documents
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('fileName', selectedFile.name);
        formData.append('fileType', fileType);
        response = await fetch('/api/analyze_document', {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const result = await response.json();
      setAnalysisResult(result);
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Failed to analyze document. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInputChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleComplete = () => {
    if (analysisResult) {
      // Create video URL if it's a video file
      let videoUrl = null;
      if (file && file.type.includes('video')) {
        videoUrl = URL.createObjectURL(file);
      }
      
      onComplete({
        ...analysisResult,
        videoUrl,
        file
      });
    }
    handleReset();
    onClose();
  };

  const handleSkip = () => {
    onComplete(null);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setFile(null);
    setAnalysisResult(null);
    setError(null);
    setIsAnalyzing(false);
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-12 h-12 text-white/30" />;
    if (file.type.includes('video')) return <FileVideo className="w-12 h-12 text-indigo-400" />;
    return <FileText className="w-12 h-12 text-emerald-400" />;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && handleSkip()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-xl mx-4 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
              <h2 className="text-lg font-semibold text-white">New Study Session</h2>
              <p className="text-sm text-white/50">Upload a lecture, PDF, or document to get started</p>
            </div>
            <button
              onClick={handleSkip}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/50" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {!analysisResult ? (
              /* Upload Area */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                className={`
                  relative cursor-pointer rounded-2xl border-2 border-dashed p-12
                  flex flex-col items-center justify-center gap-4 transition-all
                  ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}
                  ${isAnalyzing ? 'pointer-events-none' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,.pdf,.doc,.docx,.txt,.ppt,.pptx"
                  onChange={handleInputChange}
                  className="hidden"
                />

                {isAnalyzing ? (
                  <>
                    <div className="relative">
                      <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
                      <Sparkles className="w-5 h-5 text-yellow-400 absolute -top-1 -right-1 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-medium">Analyzing {file?.name}</p>
                      <p className="text-white/50 text-sm mt-1">Extracting key concepts and generating summary...</p>
                    </div>
                  </>
                ) : (
                  <>
                    {getFileIcon()}
                    <div className="text-center">
                      <p className="text-white font-medium">
                        {file ? file.name : 'Drop your file here'}
                      </p>
                      <p className="text-white/50 text-sm mt-1">
                        Supports: Videos, PDFs, Documents, Presentations
                      </p>
                    </div>
                  </>
                )}

                {error && (
                  <p className="text-red-400 text-sm mt-2">{error}</p>
                )}
              </div>
            ) : (
              /* Analysis Results */
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-emerald-300 font-medium">Analysis Complete</p>
                    <p className="text-emerald-200/70 text-sm">{analysisResult.fileName}</p>
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-2">
                    Detected Topic
                  </h3>
                  <p className="text-white font-semibold">
                    {analysisResult.detectedTopic === 'wind_turbine' ? '🌬️ Wind Turbine / Renewable Energy' :
                     analysisResult.detectedTopic === 'robot_arm' ? '🤖 Robotic Arm / Automation' :
                     analysisResult.detectedTopic === 'electronics' ? '⚡ Electronics / Circuits' :
                     '📚 General Engineering'}
                  </p>
                </div>

                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-2">
                    Key Concepts
                  </h3>
                  <ul className="space-y-1">
                    {analysisResult.keyPoints?.map((point, i) => (
                      <li key={i} className="text-white/80 text-sm flex items-start gap-2">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-indigo-950/30 border border-indigo-500/20 rounded-xl">
                  <h3 className="text-sm font-medium text-indigo-300/70 uppercase tracking-wider mb-2">
                    Ready to Simulate
                  </h3>
                  <p className="text-indigo-200/80 text-sm">
                    {Object.keys(analysisResult.suggestedVars || {}).filter(k => k !== 'Scene_Mode').length} parameters configured for interactive simulation
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-white/50 hover:text-white transition-colors"
            >
              Skip for now
            </button>

            {analysisResult ? (
              <button
                onClick={handleComplete}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/25"
              >
                Start Learning
              </button>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl transition-all border border-white/10 disabled:opacity-50"
              >
                Browse Files
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
