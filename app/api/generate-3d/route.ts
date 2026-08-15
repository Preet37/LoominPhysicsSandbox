import { NextResponse } from 'next/server';
import { registerMeshAsset } from '@/lib/meshAssets';
import { lookupModel, saveModel } from '@/lib/modelLibrary';

// Generated photoreal meshes. The provider is an implementation detail — do not
// surface its name in responses, logs, or client-visible URLs.

const TRIPO_API_KEY = process.env.TRIPO_API_KEY;
const TRIPO_BASE_URL = 'https://api.tripo3d.ai/v2/openapi';

/**
 * Texture generation alone can run past 100s, so the route needs most of the
 * platform ceiling. Without this the request was cut off mid-poll and the
 * client reported "Generation timed out" for a model that was about to land.
 */
export const maxDuration = 300;

// In-memory cache, to save credits. Parked on globalThis rather than in module
// scope because every hot reload in dev creates a fresh module — which silently
// threw away warmed models and re-billed the next request.
const globalCache = globalThis as unknown as { __tripoModelCache?: Map<string, any> };
const modelCache: Map<string, any> = globalCache.__tripoModelCache ?? new Map<string, any>();
globalCache.__tripoModelCache = modelCache;

export async function POST(req: Request) {
  try {
    const { prompt, topic, style = 'realistic' } = await req.json();

    if (!TRIPO_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Photoreal generation is not configured on this deployment.',
        fallback: true
      });
    }

    const libraryTopic = (topic || prompt || '').trim();

    // Namespaced per generator. The library is shared with the CAD pipeline, and
    // an unprefixed key meant Photoreal silently served the OpenSCAD mesh for
    // any topic CAD had already built — the exact opposite of what was asked
    // for. Keyed on the bare topic rather than the decorated prompt so wording
    // changes to the prompt do not orphan the stored model.
    const libraryKey = `photoreal ${libraryTopic}`;

    // The on-disk library is the real cache: it outlives restarts, so a model
    // is paid for exactly once ever rather than once per process.
    const stored = lookupModel(libraryKey);
    if (stored) {
      return NextResponse.json({
        success: true,
        cached: 'library',
        modelUrl: `data:model/gltf-binary;base64,${stored.glbBase64}`,
        prompt,
        format: 'glb',
      });
    }

    // In-memory layer in front of it, so concurrent requests for the same topic
    // during a single generation do not each start their own paid task.
    const cacheKey = `v3:${libraryTopic.toLowerCase()}_${style}`;
    if (modelCache.has(cacheKey)) {
      return NextResponse.json({
        success: true,
        cached: true,
        ...modelCache.get(cacheKey)
      });
    }

    // Step 1: Create a generation task
    console.log('Creating Tripo3D task for:', prompt);
    
    const createResponse = await fetch(`${TRIPO_BASE_URL}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TRIPO_API_KEY}`
      },
      body: JSON.stringify({
        type: 'text_to_model',
        prompt: prompt,
        // v2.0/Turbo-v1.0 are refused server-side with code 2015 ("version has
        // been deprecated"). v3.0 is the current line and the only one worth
        // pinning — it returns a PBR-textured GLB rather than vertex colours.
        model_version: 'v3.0-20250812',
        face_limit: 10000, // Reasonable poly count
        texture: true,
        pbr: true // Physical-based rendering textures
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Tripo create error:', errorText);
      return NextResponse.json({ 
        success: false, 
        error: `Tripo API error: ${createResponse.status}`,
        details: errorText,
        fallback: true
      });
    }

    const createData = await createResponse.json();
    const taskId = createData.data?.task_id;

    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No task ID returned',
        fallback: true
      });
    }

    console.log('Tripo task created:', taskId);

    // Step 2: Poll for completion. Observed generations land between 78s and
    // 115s, so a 120s ceiling was timing out work that was nearly finished.
    const maxAttempts = 110; // ~220s, inside the 300s route budget
    const pollInterval = 2000; // 2 seconds
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const statusResponse = await fetch(`${TRIPO_BASE_URL}/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${TRIPO_API_KEY}`
        }
      });

      if (!statusResponse.ok) {
        continue;
      }

      const statusData = await statusResponse.json();
      const status = statusData.data?.status;
      const progress = statusData.data?.progress || 0;
      
      console.log(`Task ${taskId}: ${status} (${progress}%)`);

      if (status === 'success') {
        // v3.0 returns the textured mesh as `pbr_model`; older responses used
        // a bare `model`. Read both so the route survives either shape.
        const output = statusData.data?.output ?? {};
        const modelUrl = output.pbr_model ?? output.model;
        const thumbnailUrl = output.rendered_image;
        
        // Pull the mesh down and keep it. The upstream link is presigned and
        // expires within days, so persisting the bytes is what makes this a
        // permanent asset rather than a temporary one — and it is why a topic
        // is only ever paid for once.
        let storedUrl: string | null = null;
        if (modelUrl) {
          try {
            const glbRes = await fetch(modelUrl);
            if (glbRes.ok) {
              const glbBase64 = Buffer.from(await glbRes.arrayBuffer()).toString('base64');
              saveModel({
                topic: libraryKey,
                glbBase64,
                thumbnailBase64: null,
                generator: 'photoreal',
                score: null,
              });
              storedUrl = `data:model/gltf-binary;base64,${glbBase64}`;
            }
          } catch {
            // Serving straight from the provider still works for this session.
          }
        }

        // Falling back to an opaque same-origin handle solves two problems: the
        // upstream CDN sends no CORS header, so a direct URL is unloadable by
        // GLTFLoader, and a raw URL would name the provider in the response
        // body and in every devtools network row.
        const result = {
          success: true,
          modelUrl:
            storedUrl ??
            (modelUrl ? registerMeshAsset(`${taskId}:model`, modelUrl, 'model/gltf-binary') : null),
          thumbnailUrl: thumbnailUrl
            ? registerMeshAsset(`${taskId}:thumb`, thumbnailUrl, 'image/webp')
            : null,
          prompt,
          format: 'glb'
        };

        modelCache.set(cacheKey, result);

        return NextResponse.json(result);
      }

      if (status === 'failed') {
        return NextResponse.json({ 
          success: false, 
          error: 'Model generation failed',
          fallback: true
        });
      }
    }

    // Timeout
    return NextResponse.json({ 
      success: false, 
      error: 'Generation timed out',
      taskId,
      fallback: true
    });

  } catch (error) {
    console.error('Generate 3D error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal error',
      fallback: true
    });
  }
}

// GET endpoint to check task status
export async function GET(req: Request) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: 'No taskId provided' }, { status: 400 });
  }

  if (!TRIPO_API_KEY) {
    return NextResponse.json({ error: 'TRIPO_API_KEY not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${TRIPO_BASE_URL}/task/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${TRIPO_API_KEY}`
      }
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
