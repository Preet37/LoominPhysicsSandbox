/**
 * Model library — a shared, on-disk cache of CAD models keyed by topic.
 *
 * Building a model costs a research call plus an OpenSCAD/Blender round trip,
 * and the result for "tennis racket" is the same for every user and every
 * session. So once a model has been rendered and NOT rejected, it is stored and
 * replayed instantly for anyone who asks for that topic again.
 *
 * Rejection is the signal that matters: a thumbs-down means the stored geometry
 * was wrong, so the entry is evicted and quarantined. The next request for that
 * topic re-renders from scratch, and the rejection count is kept so a topic that
 * keeps failing is visible rather than silently looping.
 *
 * Storage is a directory of GLB files plus a JSON index. If the filesystem is
 * read-only (serverless), everything degrades to an in-process memory cache.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface ModelLibraryEntry {
  key: string;
  topic: string;
  /** Normalised topic used for lookup. */
  normalizedTopic: string;
  generator: string;
  score: number | null;
  /** Which real product's spec grounded the geometry, when known. */
  referenceProduct: string | null;
  createdAt: string;
  /** Bumped whenever the entry is served from the library. */
  hits: number;
  /** Set when a user explicitly marked the visual as accurate. */
  verified: boolean;
  /** How many times this topic has been thumbs-downed, across all sessions. */
  rejections: number;
  glbFile: string;
  thumbFile: string | null;
  bytes: number;
}

interface LibraryIndex {
  version: 1;
  entries: Record<string, ModelLibraryEntry>;
  /** Rejection counts survive eviction so repeat failures stay visible. */
  rejections: Record<string, number>;
}

const LIBRARY_DIR =
  process.env.MODEL_LIBRARY_DIR || path.join(process.cwd(), ".model-library");
const INDEX_PATH = path.join(LIBRARY_DIR, "index.json");
const MIN_GLB_B64 = 80;

/** Used when the filesystem is unavailable, so lookups still work per-process. */
const memoryBlobs = new Map<string, { glbBase64: string; thumbnailBase64: string | null }>();
let memoryIndex: LibraryIndex | null = null;
let diskAvailable: boolean | null = null;

export function normalizeTopic(topic: string): string {
  return String(topic || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function topicKey(topic: string): string {
  const normalized = normalizeTopic(topic);
  const slug = normalized.replace(/\s+/g, "-").slice(0, 48) || "untitled";
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 8);
  return `${slug}-${hash}`;
}

function emptyIndex(): LibraryIndex {
  return { version: 1, entries: {}, rejections: {} };
}

/**
 * Checked on every access rather than memoised: the directory can be deleted
 * while the server is running, and caching a stale "yes" made every subsequent
 * write fail silently into the void.
 */
function ensureDir(): boolean {
  if (diskAvailable === false) return false;
  try {
    if (!fs.existsSync(LIBRARY_DIR)) fs.mkdirSync(LIBRARY_DIR, { recursive: true });
    diskAvailable = true;
  } catch {
    console.warn("[modelLibrary] filesystem unavailable — using in-memory cache only");
    diskAvailable = false;
  }
  return diskAvailable;
}

function readIndex(): LibraryIndex {
  if (!ensureDir()) return (memoryIndex ??= emptyIndex());
  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw) as LibraryIndex;
    if (!parsed || typeof parsed !== "object" || !parsed.entries) return emptyIndex();
    parsed.rejections ??= {};
    return parsed;
  } catch {
    return emptyIndex();
  }
}

function writeIndex(index: LibraryIndex): void {
  if (!ensureDir()) {
    memoryIndex = index;
    return;
  }
  try {
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  } catch (e) {
    console.warn("[modelLibrary] could not persist index:", String(e).slice(0, 120));
    memoryIndex = index;
  }
}

function readBlob(entry: ModelLibraryEntry): { glbBase64: string; thumbnailBase64: string | null } | null {
  const mem = memoryBlobs.get(entry.key);
  if (mem) return mem;
  if (!ensureDir()) return null;
  try {
    const glbPath = path.join(LIBRARY_DIR, entry.glbFile);
    if (!fs.existsSync(glbPath)) return null;
    const glbBase64 = fs.readFileSync(glbPath).toString("base64");
    if (glbBase64.length < MIN_GLB_B64) return null;

    let thumbnailBase64: string | null = null;
    if (entry.thumbFile) {
      const thumbPath = path.join(LIBRARY_DIR, entry.thumbFile);
      if (fs.existsSync(thumbPath)) thumbnailBase64 = fs.readFileSync(thumbPath).toString("base64");
    }
    return { glbBase64, thumbnailBase64 };
  } catch {
    return null;
  }
}

function removeFiles(entry: ModelLibraryEntry): void {
  memoryBlobs.delete(entry.key);
  if (!ensureDir()) return;
  for (const file of [entry.glbFile, entry.thumbFile]) {
    if (!file) continue;
    try {
      fs.rmSync(path.join(LIBRARY_DIR, file), { force: true });
    } catch {
      /* best effort */
    }
  }
}

export interface LibraryHit {
  entry: ModelLibraryEntry;
  glbBase64: string;
  thumbnailBase64: string | null;
}

/** Look up a previously accepted model for this topic. */
export function lookupModel(topic: string): LibraryHit | null {
  const key = topicKey(topic);
  const index = readIndex();
  const entry = index.entries[key];
  if (!entry) return null;

  const blob = readBlob(entry);
  if (!blob) {
    // Index and files drifted apart — drop the dangling record.
    delete index.entries[key];
    writeIndex(index);
    return null;
  }

  entry.hits += 1;
  index.entries[key] = entry;
  writeIndex(index);

  return { entry, glbBase64: blob.glbBase64, thumbnailBase64: blob.thumbnailBase64 };
}

export interface SaveModelInput {
  topic: string;
  glbBase64: string;
  thumbnailBase64?: string | null;
  generator: string;
  score?: number | null;
  referenceProduct?: string | null;
}

/**
 * Store a freshly rendered model. Called after a successful render — the model
 * is treated as good until a user says otherwise.
 */
export function saveModel(input: SaveModelInput): ModelLibraryEntry | null {
  const { topic, glbBase64 } = input;
  if (!topic || !glbBase64 || glbBase64.length < MIN_GLB_B64) return null;

  const key = topicKey(topic);
  const index = readIndex();
  const glbFile = `${key}.glb`;
  const thumbFile = input.thumbnailBase64 ? `${key}.png` : null;

  const entry: ModelLibraryEntry = {
    key,
    topic,
    normalizedTopic: normalizeTopic(topic),
    generator: input.generator,
    score: input.score ?? null,
    referenceProduct: input.referenceProduct ?? null,
    createdAt: new Date().toISOString(),
    hits: 0,
    verified: false,
    rejections: index.rejections[key] ?? 0,
    glbFile,
    thumbFile,
    bytes: Math.floor((glbBase64.length * 3) / 4),
  };

  memoryBlobs.set(key, {
    glbBase64,
    thumbnailBase64: input.thumbnailBase64 ?? null,
  });

  if (ensureDir()) {
    try {
      fs.writeFileSync(path.join(LIBRARY_DIR, glbFile), Buffer.from(glbBase64, "base64"));
      if (thumbFile && input.thumbnailBase64) {
        fs.writeFileSync(path.join(LIBRARY_DIR, thumbFile), Buffer.from(input.thumbnailBase64, "base64"));
      }
    } catch (e) {
      console.warn("[modelLibrary] could not write model files:", String(e).slice(0, 120));
    }
  }

  index.entries[key] = entry;
  writeIndex(index);
  console.log(`[modelLibrary] saved "${topic}" (${entry.generator}, ${(entry.bytes / 1024).toFixed(0)}KB)`);
  return entry;
}

/** Mark the stored model as confirmed-good (thumbs up). */
export function verifyModel(topic: string): ModelLibraryEntry | null {
  const key = topicKey(topic);
  const index = readIndex();
  const entry = index.entries[key];
  if (!entry) return null;
  entry.verified = true;
  index.entries[key] = entry;
  writeIndex(index);
  return entry;
}

export interface RejectResult {
  evicted: boolean;
  rejections: number;
}

/**
 * Thumbs-down: the stored geometry was wrong. Evict it so the next request
 * re-renders, and keep the rejection count as a signal about this topic.
 */
export function rejectModel(topic: string): RejectResult {
  const key = topicKey(topic);
  const index = readIndex();
  const entry = index.entries[key];
  const rejections = (index.rejections[key] ?? 0) + 1;
  index.rejections[key] = rejections;

  if (entry) {
    removeFiles(entry);
    delete index.entries[key];
  }
  writeIndex(index);
  console.log(`[modelLibrary] rejected "${topic}" (${rejections} total) — will re-render`);
  return { evicted: Boolean(entry), rejections };
}

export function listModels(): ModelLibraryEntry[] {
  const index = readIndex();
  return Object.values(index.entries).sort((a, b) => b.hits - a.hits);
}

export function libraryStats() {
  const index = readIndex();
  const entries = Object.values(index.entries);
  return {
    count: entries.length,
    totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    totalHits: entries.reduce((sum, e) => sum + e.hits, 0),
    verified: entries.filter((e) => e.verified).length,
    rejectedTopics: Object.keys(index.rejections).length,
    dir: LIBRARY_DIR,
  };
}

/** Test helper — wipes the library completely. */
export function clearLibrary(): void {
  memoryBlobs.clear();
  memoryIndex = emptyIndex();
  diskAvailable = null;
  try {
    fs.rmSync(LIBRARY_DIR, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
