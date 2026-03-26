import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// SMART GENERATION PIPELINE
// 1. Research the object (what parts does it have?)
// 2. Extract parameters (what can be adjusted?)
// 3. Generate detailed 3D component
// 4. Verify with Gemini VLM
// 5. Iterate until correct

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'missing_groq_key' });
const GEMINI_KEY = process.env.GOOGLE_API_KEY;

export async function POST(req: Request) {
  try {
    const { topic, context = '', iteration = 0, previousFeedback = null } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: 'Topic required' }, { status: 400 });
    }

    console.log(`\n=== SMART GENERATION: "${topic}" (iteration ${iteration}) ===`);

    // STEP 1: Research the object - what parts does it have?
    const researchPrompt = `You are a 3D modeling expert. For the object "${topic}", list:

1. MAIN PARTS: What are the key physical components? (e.g., for "teddy bear": body, head, arms, legs, ears, eyes, nose)
2. MATERIALS: What materials/colors would each part have? (e.g., body=fuzzy brown, eyes=black shiny)
3. PARAMETERS: What aspects could be adjustable? (e.g., Arm_Angle, Eye_Size, Ear_Position)
4. PROPORTIONS: Approximate size ratios (e.g., head is 60% of body width)
5. SPECIAL FEATURES: Any unique characteristics (e.g., stitching, button eyes, bow tie)

${previousFeedback ? `PREVIOUS ATTEMPT FEEDBACK: ${previousFeedback}\nFix these issues in your response.` : ''}

Respond in JSON:
{
  "parts": [
    {"name": "body", "shape": "sphere|box|cylinder|capsule", "material": "description", "relativeSize": "large|medium|small", "position": "center|top|bottom|left|right"}
  ],
  "materials": {
    "primary": {"color": "#hex", "roughness": 0-1, "metalness": 0-1, "description": "what it looks like"}
  },
  "parameters": [
    {"name": "Param_Name", "description": "what it controls", "default": number, "min": number, "max": number}
  ],
  "proportions": {"totalHeight": number, "totalWidth": number, "totalDepth": number},
  "specialFeatures": ["list of unique details"]
}`;

    const researchResult = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: researchPrompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    let research;
    try {
      const researchText = researchResult.choices[0]?.message?.content || '';
      const jsonMatch = researchText.match(/\{[\s\S]*\}/);
      research = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      console.error('Research parse error:', e);
      research = null;
    }

    console.log('Research:', research?.parts?.length, 'parts identified');

    // STEP 2: Generate detailed 3D component based on research
    const generatePrompt = `You are a Three.js expert. Generate a detailed 3D model specification for: "${topic}"

${research ? `RESEARCH DATA:
Parts needed: ${JSON.stringify(research.parts)}
Materials: ${JSON.stringify(research.materials)}
Parameters: ${JSON.stringify(research.parameters)}
Proportions: ${JSON.stringify(research.proportions)}
Special features: ${JSON.stringify(research.specialFeatures)}` : ''}

${previousFeedback ? `PREVIOUS FEEDBACK - FIX THESE ISSUES: ${previousFeedback}` : ''}

CRITICAL RULES:
- Model must fit in 3x3x3 unit box
- Ground is Y=0, model sits ON ground
- All parts connected, not floating
- Use spheres for organic shapes (animals, toys)
- Use roundedBox for mechanical parts
- Cylinders for wheels (rotate Z=1.5708 for sideways)

OUTPUT EXACT JSON FORMAT:
{
  "name": "${topic}",
  "description": "Detailed 3D model of ${topic}",
  "parameters": [
    {"name": "Arm_Angle", "type": "number", "default": 0, "min": -90, "max": 90, "unit": "degrees", "description": "Arm rotation"}
  ],
  "materials": {
    "primary": {"color": "#8B5A2B", "roughness": 0.7, "metalness": 0.05},
    "secondary": {"color": "#2C1810", "roughness": 0.8, "metalness": 0},
    "accent": {"color": "#FF6B6B", "roughness": 0.5, "metalness": 0.1}
  },
  "parts": [
    {
      "id": "body",
      "type": "sphere",
      "args": [0.4, 32, 32],
      "position": [0, 0.5, 0],
      "rotation": [0, 0, 0],
      "material": "primary"
    }
  ],
  "hud": {
    "title": "${topic} Controls",
    "displays": [{"label": "Arm Angle", "parameter": "Arm_Angle", "unit": "°", "format": "number"}]
  }
}

Generate 10-20 parts with proper positions. Include ALL parts from the research.`;

    const generateResult = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: generatePrompt }],
      temperature: 0.4,
      max_tokens: 4000,
    });

    let component;
    try {
      const genText = generateResult.choices[0]?.message?.content || '';
      const jsonMatch = genText.match(/\{[\s\S]*\}/);
      component = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      console.error('Generate parse error:', e);
      return NextResponse.json({ error: 'Failed to generate component' }, { status: 500 });
    }

    if (!component || !component.parts) {
      return NextResponse.json({ error: 'Invalid component generated' }, { status: 500 });
    }

    // Helper to parse args (might be string or array)
    const parseArgs = (args: any): number[] => {
      if (Array.isArray(args)) return args;
      if (typeof args === 'string') {
        return args.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
      }
      return [0.3, 32, 32];
    };

    // Helper to parse position/rotation
    const parseVec3 = (vec: any): number[] => {
      if (Array.isArray(vec)) return vec;
      if (typeof vec === 'string') {
        const nums = vec.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        return nums.length >= 3 ? nums : [0, 0, 0];
      }
      return [0, 0, 0];
    };

    // STEP 3: Auto-fix common issues
    component.parts = component.parts.map((part: any, i: number) => {
      const id = (part.id || `part_${i}`).toLowerCase();
      let rotation = parseVec3(part.rotation);
      let position = parseVec3(part.position);
      let args = parseArgs(part.args);
      let animation = part.animation || null;

      // Fix wheel orientation
      if (id.includes('wheel') || id.includes('tire')) {
        if (!rotation[2] || Math.abs(rotation[2]) < 1) {
          rotation = [rotation[0] || 0, rotation[1] || 0, Math.PI / 2];
        }
        if (animation?.type === 'rotate') {
          animation = { ...animation, axis: 'x', speed: 0.5 };
        }
      }

      // Don't animate static parts
      if (['body', 'head', 'torso', 'chassis', 'cabin', 'nose', 'snout', 'eye'].some(k => id.includes(k))) {
        animation = null;
      }

      return {
        id: part.id || `part_${i}`,
        type: part.type || 'sphere',
        args,
        position,
        rotation,
        material: part.material || 'primary',
        animation,
        castShadow: true,
        receiveShadow: true
      };
    });

    console.log('Generated:', component.parts.length, 'parts');

    // STEP 4: Structural verification
    let verification = { passed: true, feedback: null as string | null };
    const issues: string[] = [];
    
    // Fuzzy match helper - handles plural/singular, left/right variants
    const fuzzyMatch = (searchFor: string, partIds: string[]): boolean => {
      const search = searchFor.toLowerCase();
      const singular = search.replace(/s$/, ''); // arms -> arm
      
      return partIds.some(id => {
        const lower = id.toLowerCase();
        return lower.includes(search) || 
               lower.includes(singular) ||
               lower.includes(`left_${singular}`) ||
               lower.includes(`right_${singular}`) ||
               lower.includes(`${singular}_left`) ||
               lower.includes(`${singular}_right`);
      });
    };

    const partIds = component.parts.map((p: any) => p.id);

    // Check for expected parts based on research (with fuzzy matching)
    if (research?.parts) {
      for (const expectedPart of research.parts) {
        if (!fuzzyMatch(expectedPart.name, partIds)) {
          issues.push(`Missing: ${expectedPart.name}`);
        }
      }
    }

    // Check part count
    if (component.parts.length < 5) {
      issues.push('Too few parts');
    }

    // Only report issues if there are critical ones
    const criticalIssues = issues.filter(i => !i.includes('Missing')); // Missing parts are soft failures
    if (criticalIssues.length > 0) {
      verification = { passed: false, feedback: criticalIssues.join('; ') };
    } else {
      verification = { passed: true, feedback: null };
    }

    // STEP 5: If verification failed and we haven't iterated too much, retry
    if (!verification.passed && iteration < 2) {
      console.log('Verification failed, retrying with feedback:', verification.feedback);
      // Return indication to retry (client can call again)
      return NextResponse.json({
        success: false,
        needsRetry: true,
        feedback: verification.feedback,
        iteration: iteration + 1,
        partialComponent: component
      });
    }

    // Ensure materials exist
    component.materials = component.materials || {
      primary: { color: "#8B5A2B", roughness: 0.7, metalness: 0.05 },
      secondary: { color: "#2C1810", roughness: 0.8, metalness: 0 },
      accent: { color: "#FF6B6B", roughness: 0.5, metalness: 0.1 },
      rubber: { color: "#1C1F25", roughness: 0.9, metalness: 0.05 }
    };

    // Ensure HUD exists
    component.hud = component.hud || {
      title: `${topic} Controls`,
      displays: component.parameters?.slice(0, 4).map((p: any) => ({
        label: p.name.replace(/_/g, ' '),
        parameter: p.name,
        unit: p.unit || '',
        format: 'number'
      })) || []
    };

    return NextResponse.json({
      success: true,
      component,
      research: research ? {
        partsIdentified: research.parts?.length || 0,
        parametersIdentified: research.parameters?.length || 0,
        specialFeatures: research.specialFeatures || []
      } : null,
      verification,
      partCount: component.parts.length,
      parameterCount: component.parameters?.length || 0
    });

  } catch (error) {
    console.error('Smart generation error:', error);
    return NextResponse.json({ 
      error: 'Generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
