import { NextResponse } from 'next/server';

// Tripo3D API Integration - Generates REAL 3D models, not primitives
// API Docs: https://platform.tripo3d.ai/docs

const TRIPO_API_KEY = process.env.TRIPO_API_KEY;
const TRIPO_BASE_URL = 'https://api.tripo3d.ai/v2/openapi';

// Simple in-memory cache to save credits
const modelCache = new Map<string, any>();

export async function POST(req: Request) {
  try {
    const { prompt, style = 'realistic' } = await req.json();

    if (!TRIPO_API_KEY) {
      return NextResponse.json({ 
        success: false, 
        error: 'TRIPO_API_KEY not configured. Add it to .env.local',
        fallback: true
      });
    }

    // Check cache first to save credits
    const cacheKey = `${prompt.toLowerCase().trim()}_${style}`;
    if (modelCache.has(cacheKey)) {
      console.log('Returning cached model for:', prompt);
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
        model_version: 'v2.0-20240919', // Latest version
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

    // Step 2: Poll for completion (with timeout)
    const maxAttempts = 60; // 2 minutes max
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
        // Get the model URL
        const modelUrl = statusData.data?.output?.model;
        const thumbnailUrl = statusData.data?.output?.rendered_image;
        
        const result = {
          success: true,
          taskId,
          modelUrl,
          thumbnailUrl,
          prompt,
          format: 'glb'
        };
        
        // Cache the result
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
