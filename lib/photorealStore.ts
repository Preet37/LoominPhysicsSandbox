/**
 * Shared, durable store for photoreal meshes.
 *
 * The on-disk model library lives in /tmp on Vercel, so it is per-instance and
 * wiped on every cold start — a model one user paid for was invisible to the
 * next user and got generated (and billed) again. Blob storage is shared by
 * every instance and survives deploys, so a topic is generated once, ever, and
 * every later request for it is served straight from the CDN.
 *
 * Keyed with the library's topicKey, so "Wind Turbine", "wind-turbine" and
 * "wind turbine!" all resolve to the same object. Without a configured token
 * every call is a no-op and the route behaves exactly as it did before.
 */

import { head, put, BlobNotFoundError } from "@vercel/blob";
import { topicKey } from "@/lib/modelLibrary";

const enabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function pathnameFor(libraryKey: string): string {
  return `photoreal/${topicKey(libraryKey)}.glb`;
}

/** Public URL of the stored mesh for this topic, or null on a miss. */
export async function lookupPhotoreal(libraryKey: string): Promise<string | null> {
  if (!enabled) return null;
  try {
    const blob = await head(pathnameFor(libraryKey));
    return blob.url;
  } catch (e) {
    // A miss is the normal case. Anything else (network, quota) must not block
    // generation — fall through and let the request proceed uncached.
    if (!(e instanceof BlobNotFoundError)) {
      console.warn("[photorealStore] lookup failed:", String(e).slice(0, 160));
    }
    return null;
  }
}

/** Persists a mesh for every future request. Returns its public URL, or null. */
export async function savePhotoreal(libraryKey: string, glb: Buffer): Promise<string | null> {
  if (!enabled) return null;
  try {
    const blob = await put(pathnameFor(libraryKey), glb, {
      access: "public",
      contentType: "model/gltf-binary",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    return blob.url;
  } catch (e) {
    console.warn("[photorealStore] save failed:", String(e).slice(0, 160));
    return null;
  }
}
