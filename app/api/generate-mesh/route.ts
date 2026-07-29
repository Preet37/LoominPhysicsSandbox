import { NextResponse } from "next/server";
import {
  GenerativeUnavailableError,
  generateConceptImage,
  generateMeshFromImage,
  isGenerativeConfigured,
  seedForTopic,
} from "@/lib/generativeMesh";
import { lookupModel, saveModel } from "@/lib/modelLibrary";
import { researchSpecSheet } from "@/lib/specSheet";
import type { SpecSheet } from "@/lib/specSheet";

/**
 * Texture generation alone runs ~105s, so the mesh stage needs most of the
 * platform ceiling. The concept stage returns in a few seconds and shares the
 * route only because it shares the topic/spec plumbing.
 */
export const maxDuration = 300;

/**
 * Two-stage generative model endpoint.
 *
 *   POST { topic, stage: "concept" }            → a preview image, ~3s, ~$0.005
 *   POST { topic, stage: "mesh", imageUrl }     → a textured GLB, ~130s, ~$0.40
 *
 * They are separate calls so the expensive half is never spent on a concept
 * image nobody looked at. Callers should render the concept, take an accept,
 * and only then ask for the mesh.
 */
export async function POST(req: Request) {
  try {
    const { topic, stage, imageUrl, specSheet, forceRegenerate } = await req.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ success: false, error: "topic is required" }, { status: 400 });
    }
    if (!isGenerativeConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Generative 3D is not enabled on this deployment.",
          unconfigured: true,
        },
        { status: 503 },
      );
    }

    // A model already built for this topic is served without touching fal at
    // all — this is what keeps cost proportional to distinct topics rather than
    // to traffic.
    if (stage !== "concept" && !forceRegenerate) {
      const hit = lookupModel(topic);
      if (hit) {
        return NextResponse.json({
          success: true,
          stage: "mesh",
          glbBase64: hit.glbBase64,
          thumbnailBase64: hit.thumbnailBase64,
          cached: true,
          libraryKey: hit.entry.key,
        });
      }
    }

    let spec = (specSheet as SpecSheet | null) ?? null;

    if (stage === "concept") {
      // Proportion hints measurably change the image, so it is worth the wait —
      // but a missing spec must not block generation.
      if (!spec?.dimensions?.length) {
        try {
          spec = (await researchSpecSheet(topic, { timeoutMs: 20_000 })).spec;
        } catch {
          /* proceed without verified dimensions */
        }
      }
      const concept = await generateConceptImage(topic, spec);
      return NextResponse.json({
        success: true,
        stage: "concept",
        imageUrl: concept.url,
        prompt: concept.prompt,
        seed: seedForTopic(topic),
        referenceProduct: spec?.referenceProduct ?? null,
      });
    }

    if (stage === "mesh") {
      if (!imageUrl || typeof imageUrl !== "string") {
        return NextResponse.json(
          { success: false, error: "imageUrl from the concept stage is required" },
          { status: 400 },
        );
      }
      const mesh = await generateMeshFromImage(imageUrl, { topic });

      // Stored so the next request for this topic — from anyone — is instant.
      const saved = saveModel({
        topic,
        glbBase64: mesh.glbBase64,
        thumbnailBase64: null,
        generator: "hunyuan3d",
        score: null,
        referenceProduct: spec?.referenceProduct ?? null,
      });

      return NextResponse.json({
        success: true,
        stage: "mesh",
        glbBase64: mesh.glbBase64,
        seed: mesh.seed,
        cached: false,
        libraryKey: saved?.key ?? null,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown stage: ${stage}. Expected "concept" or "mesh".` },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof GenerativeUnavailableError) {
      return NextResponse.json({ success: false, error: e.message, unconfigured: true }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : "Generation failed";
    console.error("[generate-mesh]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** Lets the client hide the generative affordance entirely when it cannot work. */
export async function GET() {
  return NextResponse.json({
    ok: isGenerativeConfigured(),
    hint: isGenerativeConfigured()
      ? "Generative 3D ready"
      : "Set FAL_KEY to enable generative 3D models.",
  });
}
