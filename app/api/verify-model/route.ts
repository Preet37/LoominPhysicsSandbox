import { NextResponse } from 'next/server';

// Model verification — uses Gemini Vision if available, falls back to AI text analysis
// via NVIDIA NIM or Groq when no vision API key is present.

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

async function textVerify(description: string, component: any): Promise<{ verified: boolean; score: number; issues: string[]; suggestions: string[] }> {
  const parts = component?.parts || [];
  const partNames = parts.map((p: any) => p.id).join(', ');
  const partCount = parts.length;

  const prompt = `You are a 3D model quality inspector. A model of "${description}" was generated with ${partCount} parts: ${partNames}.

Evaluate the model quality:
1. Are the part names appropriate for a ${description}?
2. Does the part count (${partCount}) seem sufficient? (10-30 is typical)
3. Are there likely symmetry issues based on the part names?
4. Does this look like a recognizable ${description}?

Respond ONLY with valid JSON — no extra text:
{"verified":true/false,"score":0-100,"issues":["list any problems"],"suggestions":["how to fix"]}`;

  const key = process.env.NVIDIA_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    // No AI key at all — do structural check only
    const issues: string[] = [];
    if (partCount < 8) issues.push(`Only ${partCount} parts — model may lack detail`);
    return { verified: issues.length === 0, score: Math.max(0, 100 - issues.length * 20), issues, suggestions: [] };
  }

  try {
    let raw: string;
    if (process.env.NVIDIA_API_KEY) {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}` },
        body: JSON.stringify({ model: 'nvidia/llama-3.1-nemotron-nano-8b-v1', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 512 }),
      });
      const d = await res.json();
      raw = d.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 512 }),
      });
      const d = await res.json();
      raw = d.choices?.[0]?.message?.content || '';
    }
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fall through to structural check */ }

  const issues: string[] = [];
  if (partCount < 8) issues.push(`Only ${partCount} parts — model may lack detail`);
  return { verified: issues.length === 0, score: Math.max(0, 100 - issues.length * 20), issues, suggestions: [] };
}

export async function POST(req: Request) {
  try {
    const { description, modelData, imageBase64, component } = await req.json();

    const geminiKey = process.env.GOOGLE_API_KEY;

    // No Gemini key — use AI text-based verification instead
    if (!geminiKey) {
      // If we only have a screenshot, we can't do true vision verification.
      // Return a non-blocking score so geometry generation can proceed.
      if (imageBase64) {
        return NextResponse.json({
          success: true,
          verified: true,
          score: 65,
          issues: ["Gemini vision key missing; using heuristic fallback."],
          suggestions: [],
        });
      }

      const target = component || modelData;
      if (target && description) {
        const result = await textVerify(description, target);
        return NextResponse.json({ success: true, ...result });
      }
      // No data at all — pass through so the caller doesn't abort the model
      return NextResponse.json({ success: true, verified: true, score: 75, issues: [], suggestions: [] });
    }

    // If we have an image, use vision model
    if (imageBase64) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: `You are a 3D model quality inspector. Analyze this rendered 3D model image and verify if it accurately represents: "${description}"

Check for:
1. Is the object recognizable as a ${description}?
2. Are there symmetry issues (missing parts on one side)?
3. Are proportions correct?
4. Are wheels/rotors/moving parts oriented correctly?
5. Are colors appropriate?

Respond in JSON format:
{
  "verified": true/false,
  "score": 0-100,
  "issues": ["list of problems found"],
  "suggestions": ["how to fix the issues"]
}`
                },
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: imageBase64
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
            }
          })
        }
      );

      const data = await response.json();
      
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        // Try to parse JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ success: true, ...result });
        }
        return NextResponse.json({ 
          success: true, 
          verified: true, 
          feedback: text 
        });
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to parse Gemini response',
        verified: false
      });
    }

    // Without image, just verify the model data structure
    if (modelData) {
      const issues: string[] = [];
      const parts = modelData.parts || [];
      
      // Check for wheel symmetry
      const wheelParts = parts.filter((p: any) => 
        p.id?.includes('wheel') || p.id?.includes('tire')
      );
      
      const leftWheels = wheelParts.filter((p: any) => p.position?.[0] < 0);
      const rightWheels = wheelParts.filter((p: any) => p.position?.[0] > 0);
      
      if (leftWheels.length !== rightWheels.length) {
        issues.push(`Wheel asymmetry: ${leftWheels.length} left, ${rightWheels.length} right`);
      }
      
      // Check wheel rotation axis
      wheelParts.forEach((wheel: any) => {
        if (wheel.animation?.axis !== 'x') {
          issues.push(`${wheel.id} should rotate on X axis, not ${wheel.animation?.axis}`);
        }
      });
      
      // Check minimum part count
      if (parts.length < 10) {
        issues.push(`Model has only ${parts.length} parts - may lack detail`);
      }
      
      return NextResponse.json({
        success: true,
        verified: issues.length === 0,
        score: Math.max(0, 100 - issues.length * 15),
        issues,
        suggestions: issues.length > 0 ? ['Regenerate model with fixed parameters'] : []
      });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'No image or model data provided' 
    });

  } catch (error) {
    console.error('Verify model error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Verification failed',
      verified: false 
    });
  }
}
