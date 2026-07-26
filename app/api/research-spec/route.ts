/**
 * /api/research-spec
 *
 * Researches a real reference product for a topic and returns a dimensionally
 * validated spec sheet. Used by the editor to ground 3D generation in real
 * measurements instead of LLM-invented numbers.
 *
 * The response includes the validation result so the UI can show which
 * deterministic checks passed — and so callers can decide whether to trust it.
 */

import { NextResponse } from "next/server";
import { researchSpecSheet, formatSpecForPrompt } from "@/lib/specSheet";

export async function POST(req: Request) {
  try {
    const { topic, timeoutMs } = await req.json();

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }

    const { spec, validation, attempts } = await researchSpecSheet(topic.trim(), {
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : 35_000,
    });

    if (!spec) {
      return NextResponse.json(
        { error: "No spec sheet could be produced", validation, attempts },
        { status: 502 },
      );
    }

    return NextResponse.json({
      spec,
      validation,
      attempts,
      prompt: formatSpecForPrompt(spec, validation),
    });
  } catch (err) {
    console.error("[research-spec]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
