"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import TypewriterText from "./components/TypewriterText";
import FeatureCard from "./components/FeatureCard";
import TechBadge from "./components/TechBadge";
import { 
  Cpu, 
  Brain, 
  Layers, 
  Zap, 
  BookOpen, 
  Video, 
  Boxes,
  Sparkles,
  Database,
  Code2,
  Palette,
  Box
} from "lucide-react";

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#070A0F] text-white overflow-x-hidden">
      {/* Animated Background */}
      <motion.div 
        style={{ y: backgroundY }}
        className="fixed inset-0 pointer-events-none"
      >
        <div className="absolute inset-0 opacity-[0.65]" style={{ 
          background: "radial-gradient(1200px 600px at 70% 20%, rgba(99,102,241,0.22), transparent 55%), radial-gradient(900px 520px at 20% 80%, rgba(16,185,129,0.16), transparent 58%)" 
        }} />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-[0.08]" />
      </motion.div>

      {/* Floating Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ 
            x: [0, 100, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ 
            x: [0, -80, 0],
            y: [0, 80, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px]"
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#070A0F]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md flex items-center justify-center">
              <div className="h-4 w-4 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300 opacity-95" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Loomin</span>
          </div>
          
          <div className="flex items-center gap-3">
            <a 
              href="/editor"
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
            >
              Launch Sandbox →
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6">
        <motion.div 
          style={{ opacity }}
          className="text-center max-w-4xl mx-auto pt-20"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-white/70">AI-Powered Learning Platform</span>
          </motion.div>

          {/* Main Headline with Typewriter */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <TypewriterText 
              text="Loomin is the future of learning." 
              className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent"
              speed={60}
              delay={300}
            />
          </h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3, duration: 0.8 }}
            className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-12"
          >
            Type any physics topic. Watch AI generate notes, equations, and a live 3D simulation — then push parameters to their limits and see what breaks.
          </motion.p>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 3.5, duration: 0.5 }}
          >
            <a
              href="/editor"
              className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-lg font-semibold transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30"
            >
              <span>Launch Physics Sandbox</span>
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                →
              </motion.span>
              
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 blur-xl opacity-50 group-hover:opacity-70 transition-opacity -z-10" />
            </a>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 4.5 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-2"
            >
              <motion.div className="w-1.5 h-1.5 rounded-full bg-white/50" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Powerful Features for{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                Modern Learners
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              Everything you need to transform your study materials into interactive experiences.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Boxes className="w-6 h-6 text-indigo-400" />}
              title="3D Simulations"
              description="Turn your notes into real-time 3D visualizations. See wind turbines spin, robot arms move, and circuits light up."
              delay={0}
            />
            <FeatureCard
              icon={<Brain className="w-6 h-6 text-emerald-400" />}
              title="AI-Powered Analysis"
              description="Our AI reads your notes and automatically configures simulations with optimal parameters."
              delay={0.1}
            />
            <FeatureCard
              icon={<BookOpen className="w-6 h-6 text-fuchsia-400" />}
              title="Smart Flashcards"
              description="Generate flashcard decks from your notes instantly. Master concepts with spaced repetition."
              delay={0.2}
            />
            <FeatureCard
              icon={<Video className="w-6 h-6 text-amber-400" />}
              title="Video Processing"
              description="Upload lecture videos and let AI extract key concepts, generate notes, and create study materials."
              delay={0.3}
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6 text-cyan-400" />}
              title="Auto-Fix Engine"
              description="Detected an error in your simulation? One click to automatically optimize parameters."
              delay={0.4}
            />
            <FeatureCard
              icon={<Sparkles className="w-6 h-6 text-rose-400" />}
              title="Ask Loomin AI"
              description="Have questions? Ask Loomin anything about your notes and get intelligent, contextual answers."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="relative py-32 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built with{" "}
              <span className="bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
                Modern Technology
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              Powered by cutting-edge tools and frameworks for the best learning experience.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <TechBadge
              icon={<Code2 className="w-5 h-5" />}
              name="Next.js 14"
              description="React Framework"
              delay={0}
            />
            <TechBadge
              icon={<Box className="w-5 h-5" />}
              name="Three.js"
              description="3D Graphics"
              delay={0.05}
            />
            <TechBadge
              icon={<Brain className="w-5 h-5" />}
              name="Groq AI"
              description="Fast Inference"
              delay={0.1}
            />
            <TechBadge
              icon={<Database className="w-5 h-5" />}
              name="Prisma"
              description="Database ORM"
              delay={0.15}
            />
            <TechBadge
              icon={<Palette className="w-5 h-5" />}
              name="Tailwind CSS"
              description="Styling"
              delay={0.2}
            />
            <TechBadge
              icon={<Layers className="w-5 h-5" />}
              name="Framer Motion"
              description="Animations"
              delay={0.25}
            />
            <TechBadge
              icon={<Cpu className="w-5 h-5" />}
              name="React Three Fiber"
              description="React 3D"
              delay={0.3}
            />
            <TechBadge
              icon={<Zap className="w-5 h-5" />}
              name="Zustand"
              description="State Management"
              delay={0.35}
            />
          </div>
        </div>
      </section>

      {/* Preview Section */}
      <section className="relative py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              See It in{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Action
              </span>
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              A glimpse into the Loomin experience.
            </p>
          </motion.div>

          {/* App Preview - Full Dashboard Replica */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#070A0F] shadow-2xl shadow-black/50"
          >
            {/* Mock window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 text-center text-xs text-white/30">Loomin Dashboard - localhost:3000/dashboard</div>
            </div>
            
            {/* Dashboard Content */}
            <div className="relative p-4 min-h-[500px]">
              {/* Background gradients like real dashboard */}
              <div className="pointer-events-none absolute inset-0 opacity-[0.65]" style={{ background: "radial-gradient(800px 400px at 70% 20%, rgba(99,102,241,0.15), transparent 55%), radial-gradient(600px 350px at 20% 80%, rgba(16,185,129,0.12), transparent 58%)" }} />
              
              <div className="relative grid grid-cols-[180px,1fr] gap-3 h-full">
                {/* Journals Sidebar */}
                <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-3 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center">
                      <div className="h-3 w-3 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300" />
                    </div>
                    <span className="text-xs font-semibold text-white/80">Journals</span>
                  </div>
                  <div className="space-y-2">
                    <div className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                      <div className="text-xs font-medium text-emerald-300">Wind Turbine Study</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                      <div className="text-xs text-white/60">Robot Arm Notes</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                      <div className="text-xs text-white/60">Circuit Analysis</div>
                    </div>
                    <div className="mt-4 px-3 py-2 rounded-lg border border-dashed border-white/20 text-center">
                      <div className="text-xs text-white/40">+ New Journal</div>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-12 gap-3">
                  {/* Left Column - Video + Editor */}
                  <div className="col-span-7 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center">
                          <div className="h-3 w-3 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300" />
                        </div>
                        <div>
                          <div className="text-[10px] tracking-widest uppercase text-white/50">Loomin</div>
                          <div className="text-xs font-semibold text-white/90">Wind Turbine Study</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="px-2 py-1 rounded bg-purple-600/20 border border-purple-500/30 text-[10px] text-purple-200">Upload</div>
                        <div className="px-2 py-1 rounded bg-indigo-600/20 border border-indigo-500/30 text-[10px] text-indigo-200">Ask AI</div>
                        <div className="px-2 py-1 rounded bg-emerald-900/50 border border-emerald-500/50 text-[10px] text-emerald-300">LIVE</div>
                      </div>
                    </div>

                    {/* Video Panel */}
                    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 overflow-hidden h-[120px]">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                        <div className="text-[10px] font-semibold text-white/80">Video / Media</div>
                        <div className="text-[10px] text-white/40">Upload</div>
                      </div>
                      <div className="h-full bg-black/50 flex items-center justify-center">
                        <div className="text-center text-white/30">
                          <div className="text-lg mb-1">Video Preview</div>
                          <div className="text-[10px]">lecture.mp4</div>
                        </div>
                      </div>
                    </div>

                    {/* Editor Panel */}
                    <div className="flex-1 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                        <div className="text-[10px] font-semibold text-white/80">Editor</div>
                        <div className="text-[10px] text-white/40">Live Config</div>
                      </div>
                      <div className="p-3 font-mono text-[10px] leading-relaxed">
                        <div className="text-indigo-400">## Wind Turbine Configuration</div>
                        <div className="text-white/60 mt-2">Analyzing optimal blade parameters...</div>
                        <div className="mt-2">
                          <span className="text-emerald-400">Wind_Speed</span>
                          <span className="text-white/50"> = </span>
                          <span className="text-amber-400">25</span>
                        </div>
                        <div>
                          <span className="text-emerald-400">Blade_Count</span>
                          <span className="text-white/50"> = </span>
                          <span className="text-amber-400">3</span>
                        </div>
                        <div>
                          <span className="text-emerald-400">Blade_Pitch</span>
                          <span className="text-white/50"> = </span>
                          <span className="text-amber-400">15</span>
                        </div>
                        <div className="mt-2 text-white/40">// Efficiency: 94.2%</div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - 3D Sandbox */}
                  <div className="col-span-5 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                      <div className="text-[10px] font-semibold text-white/80">3D Sandbox</div>
                      <div className="text-[10px] text-white/40">Interactive</div>
                    </div>
                    <div className="flex-1 relative bg-gradient-to-br from-[#0a1628] to-[#0d1f35] flex items-center justify-center overflow-hidden">
                      {/* Animated Wind Turbine */}
                      <div className="relative">
                        {/* Tower */}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-32 bg-gradient-to-t from-slate-600 to-slate-400 rounded-t-sm" />
                        
                        {/* Hub */}
                        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-6 h-6 bg-slate-300 rounded-full shadow-lg z-10" />
                        
                        {/* Rotating Blades */}
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute bottom-[122px] left-1/2 -translate-x-1/2 w-32 h-32"
                          style={{ transformOrigin: "center center" }}
                        >
                          {/* Blade 1 */}
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-16 bg-gradient-to-t from-slate-400 to-white rounded-full origin-bottom" />
                          {/* Blade 2 */}
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-16 bg-gradient-to-t from-slate-400 to-white rounded-full origin-bottom rotate-[120deg]" style={{ transformOrigin: "bottom center", transform: "translateX(-50%) rotate(120deg)" }} />
                          {/* Blade 3 */}
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-16 bg-gradient-to-t from-slate-400 to-white rounded-full origin-bottom rotate-[240deg]" style={{ transformOrigin: "bottom center", transform: "translateX(-50%) rotate(240deg)" }} />
                        </motion.div>

                        {/* Ground */}
                        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-40 h-8 bg-gradient-to-t from-emerald-900/50 to-transparent rounded-full blur-sm" />
                      </div>

                      {/* Status Badge */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <span className="text-[10px] text-white/70">Sustainability</span>
                      </div>

                      {/* Optimal Badge */}
                      <div className="absolute top-12 left-3 px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-[10px] font-mono font-bold text-emerald-400">OPTIMAL</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Transform Your Learning?
            </h2>
            <p className="text-white/50 text-lg mb-10">
              Join Loomin today and experience the future of interactive education.
            </p>
            <a
              href="/editor"
              className="group relative inline-flex items-center gap-3 px-10 py-5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-xl font-semibold transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30"
            >
              <span>Launch Physics Sandbox</span>
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                →
              </motion.span>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 blur-xl opacity-50 group-hover:opacity-70 transition-opacity -z-10" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
              <div className="h-3 w-3 rounded-sm bg-gradient-to-br from-indigo-400 via-fuchsia-300 to-emerald-300 opacity-95" />
            </div>
            <span className="text-sm text-white/50">Loomin - The Future of Learning</span>
          </div>
          <div className="text-sm text-white/30">
            Built with Next.js, Three.js, and AI
          </div>
        </div>
      </footer>
    </div>
  );
}
