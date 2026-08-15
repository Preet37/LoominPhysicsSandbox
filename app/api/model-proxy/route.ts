import { NextResponse } from "next/server";
import { lookupMeshAsset } from "@/lib/meshAssets";

/**
 * Same-origin passthrough for generated mesh assets.
 *
 * Two reasons this exists rather than handing the browser the upstream URL:
 * the provider's CDN sends no Access-Control-Allow-Origin header, so GLTFLoader
 * is blocked before it reads a byte (the failure the editor used to report as
 * "GLB loading fails"); and a direct URL would name the provider in devtools.
 * Callers pass an opaque id minted by lib/meshAssets.
 */

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
  }

  const asset = lookupMeshAsset(id);
  if (!asset) {
    // Handles live in memory, so a server restart invalidates them. The client
    // recovers by asking for the model again.
    return NextResponse.json({ error: "Unknown asset. Regenerate the model." }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(asset.url);
  } catch {
    return NextResponse.json({ error: "Could not reach the asset host" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    // Presigned links expire, and an expired one is the likeliest cause here.
    return NextResponse.json(
      { error: `Asset host returned ${upstream.status}. The link may have expired — regenerate the model.` },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": asset.contentType,
      // Signed links outlive a session but not a week; a day of caching keeps
      // repeat views instant without serving a dead URL from cache.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
