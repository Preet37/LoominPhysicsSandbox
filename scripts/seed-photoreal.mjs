// Uploads every photoreal mesh in the local .model-library to the shared Blob
// store, so models already paid for are instant on the deployed site.
//
//   vercel env pull .env.blob --environment=production --yes
//   node --env-file=.env.blob scripts/seed-photoreal.mjs && rm .env.blob
//
// Pathnames match lib/photorealStore.ts: the local filename already is the
// library's topicKey, so `photoreal/<file>` is exactly what the route looks up.
import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set — see the usage comment at the top.");
  process.exit(1);
}

const dir = path.join(process.cwd(), ".model-library");
const files = fs.readdirSync(dir).filter((f) => f.startsWith("photoreal-") && f.endsWith(".glb"));

for (const file of files) {
  const body = fs.readFileSync(path.join(dir, file));
  const blob = await put(`photoreal/${file}`, body, {
    access: "public",
    contentType: "model/gltf-binary",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
  console.log(`✓ ${file} (${(body.length / 1024).toFixed(0)}KB) → ${blob.url}`);
}
console.log(`Seeded ${files.length} photoreal models.`);
