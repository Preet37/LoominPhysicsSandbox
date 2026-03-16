import { NextResponse } from 'next/server';

// Gemini Vision API for model verification
// This endpoint takes a screenshot/description and verifies if the 3D model is accurate

export async function POST(req: Request) {
  try {
    const { description, modelData, imageBase64 } = await req.json();

    const geminiKey = process.env.GOOGLE_API_KEY; // Using GOOGLE_API_KEY from .env.local
    
    if (!geminiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'GEMINI_API_KEY not configured',
        verified: false,
        feedback: 'Vision verification not available - add GEMINI_API_KEY to .env.local'
      });
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
