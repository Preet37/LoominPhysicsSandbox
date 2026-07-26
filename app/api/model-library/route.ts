/**
 * /api/model-library
 *
 * The 3D sandbox's thumbs-up / thumbs-down feed this route. A rejection evicts
 * the stored model so the topic is rebuilt from scratch next time; anything not
 * rejected stays in the library and is replayed for every later session.
 */

import { NextResponse } from "next/server";
import { libraryStats, listModels, rejectModel, verifyModel } from "@/lib/modelLibrary";

export async function GET() {
  return NextResponse.json({ stats: libraryStats(), models: listModels() });
}

export async function POST(req: Request) {
  try {
    const { topic, action } = await req.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    switch (action) {
      case "reject": {
        const result = rejectModel(topic);
        return NextResponse.json({ ok: true, ...result });
      }
      case "verify": {
        const entry = verifyModel(topic);
        return NextResponse.json({ ok: true, verified: Boolean(entry), entry });
      }
      default:
        return NextResponse.json(
          { error: `Unknown action "${action}" — expected "reject" or "verify"` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[model-library]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
