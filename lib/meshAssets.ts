/**
 * Opaque handles for generated mesh assets.
 *
 * The upstream provider returns presigned URLs on its own domain. Handing those
 * to the browser publishes which vendor generated the mesh in every network
 * entry and in the JSON body, so the client only ever sees an id minted here and
 * the real URL stays server-side.
 *
 * Backed by globalThis so a dev hot reload does not orphan handles that the page
 * is still holding — a new module instance with an empty map turns every live
 * asset into a 404.
 */

interface AssetEntry {
  /** Presigned upstream URL. Expires; callers must handle a dead link. */
  url: string;
  contentType: string;
}

const store = globalThis as unknown as { __meshAssets?: Map<string, AssetEntry> };
const assets: Map<string, AssetEntry> = store.__meshAssets ?? new Map<string, AssetEntry>();
store.__meshAssets = assets;

/**
 * Registers an upstream URL and returns the client-facing path.
 * `key` should be stable for a given asset (task id + role) so repeat
 * registrations reuse the same handle instead of growing the map.
 */
export function registerMeshAsset(key: string, url: string, contentType: string): string {
  assets.set(key, { url, contentType });
  return `/api/model-proxy?id=${encodeURIComponent(key)}`;
}

export function lookupMeshAsset(id: string): AssetEntry | undefined {
  return assets.get(id);
}
