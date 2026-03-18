"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface TechBadgeProps {
  icon: ReactNode;
  name: string;
  description: string;
  delay?: number;
}

export default function TechBadge({ icon, name, description, delay = 0 }: TechBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ scale: 1.05 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-default"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 flex items-center justify-center text-white/80">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-white">{name}</div>
        <div className="text-xs text-white/50">{description}</div>
      </div>
    </motion.div>
  );
}
