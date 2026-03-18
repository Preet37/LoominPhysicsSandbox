import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// AI-POWERED 3D MODEL GENERATION
// Generates detailed 3D model specifications for ANY topic

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topic, feedback, attempt } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: 'Topic required' }, { status: 400 });
    }

    console.log(`AI Generating 3D model for: "${topic}"`);

    // STEP 1: Research the object - understand its structure
    const researchPrompt = `You are a 3D modeling expert. For the object "${topic}", provide:
1. Main parts (list 8-20 key components)
2. Approximate proportions (height:width:depth ratio)
3. Key materials (metal, plastic, organic, etc.)
4. Distinctive features that make it recognizable

Be specific. Output JSON only:
{
  "parts": ["part1", "part2", ...],
  "proportions": { "height": 1, "width": 0.5, "depth": 0.3 },
  "materials": ["material1", "material2"],
  "features": ["feature1", "feature2"]
}`;

    const research = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: researchPrompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    let researchData;
    try {
      const researchText = research.choices[0]?.message?.content || '';
      const jsonMatch = researchText.match(/\{[\s\S]*\}/);
      researchData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      researchData = null;
    }

    console.log('Research complete:', researchData?.parts?.length || 0, 'parts identified');

    const topicLower = topic.toLowerCase();
    const categoryGuide = buildCategoryGuidance(topicLower);

    const procedural = buildProceduralModel(topicLower, topic);
    if (procedural) {
      const finalComponent = postProcessModel(procedural, topic);
      return NextResponse.json({
        success: true,
        component: finalComponent,
        partCount: finalComponent.parts?.length || 0,
        source: 'procedural'
      });
    }

    // STEP 2: Generate HIGHLY detailed 3D specification like a professional 3D artist
    const systemPrompt = `You are an expert 3D artist creating production-quality models. Output ONLY valid JSON.`;
    
    const userPrompt = `Create a HIGHLY DETAILED 3D model of "${topic}" like a professional 3D artist would.

SHAPES (high segment counts for smooth surfaces):
- sphere: [radius, 32, 32] - smooth spheres
- capsule: [radius, length, 12, 24] - smooth capsules  
- cylinder: [radiusTop, radiusBottom, height, 48] - smooth cylinders
- roundedBox: [width, height, depth, radius] - panels with rounded edges
- box: [width, height, depth] - flat surfaces
- cone: [radius, height, 32] - smooth cones
- torus: [radius, tube, 24, 48] - rings/donuts

QUALITY STANDARDS (like a robotic arm with 50+ detailed parts):
1. Create ${categoryGuide.minParts}-${categoryGuide.maxParts} DISTINCT parts for rich detail
2. Add sub-details: bevels, lips, collars, insets, trim pieces
3. Layer parts: main body + accent panels + detail pieces
4. Use 5-8 materials with varied roughness (0.3-0.9) and metalness (0-0.8)
5. Every joint needs a collar/ring detail
6. Add small accents: rivets, buttons, lights, seams
7. Parts should overlap slightly for seamless connections

MATERIALS (create variety):
- primary: main body color
- secondary: accent panels (slightly different shade)
- dark: joints, collars, mechanical parts (roughness: 0.6, metalness: 0.2)
- accent: highlights, buttons, lights
- detail: trim, edges, small features

POSITIONING:
- Ground at Y=0, model sits on ground
- Total height ~1.5 units
- Center at X=0, Z=0
- Perfect left/right symmetry

CATEGORY REQUIREMENTS:
${categoryGuide.hint}

${researchData ? `MUST INCLUDE: ${researchData.parts?.slice(0, 12).join(', ')}
MATERIALS TO USE: ${researchData.materials?.join(', ')}` : ''}
${feedback ? `\nFIX THESE ISSUES FROM VERIFICATION:\n- ${feedback}\n` : ''}

EXAMPLE (high-quality car with 30+ parts):
{
  "name": "Sports Car",
  "materials": {
    "body": {"color": "#DC2626", "roughness": 0.15, "metalness": 0.85},
    "body_accent": {"color": "#B91C1C", "roughness": 0.2, "metalness": 0.8},
    "glass": {"color": "#87CEEB", "roughness": 0.05, "metalness": 0.1},
    "dark": {"color": "#1f2937", "roughness": 0.6, "metalness": 0.3},
    "chrome": {"color": "#E5E7EB", "roughness": 0.1, "metalness": 0.95},
    "rubber": {"color": "#111111", "roughness": 0.95, "metalness": 0},
    "light": {"color": "#FBBF24", "roughness": 0.3, "metalness": 0.4}
  },
  "parts": [
    {"id": "body_main", "type": "roundedBox", "args": [0.7, 0.2, 1.6, 0.08], "position": [0, 0.25, 0], "material": "body"},
    {"id": "body_top", "type": "roundedBox", "args": [0.6, 0.15, 0.8, 0.06], "position": [0, 0.42, -0.1], "material": "body"},
    {"id": "hood", "type": "roundedBox", "args": [0.65, 0.08, 0.5, 0.04], "position": [0, 0.32, 0.55], "material": "body_accent"},
    {"id": "hood_vent", "type": "roundedBox", "args": [0.3, 0.02, 0.2, 0.01], "position": [0, 0.37, 0.5], "material": "dark"},
    {"id": "trunk", "type": "roundedBox", "args": [0.6, 0.1, 0.3, 0.04], "position": [0, 0.28, -0.7], "material": "body_accent"},
    {"id": "windshield", "type": "box", "args": [0.55, 0.22, 0.03], "position": [0, 0.45, 0.3], "rotation": [-0.5, 0, 0], "material": "glass"},
    {"id": "rear_window", "type": "box", "args": [0.5, 0.18, 0.03], "position": [0, 0.42, -0.45], "rotation": [0.4, 0, 0], "material": "glass"},
    {"id": "side_window_l", "type": "box", "args": [0.03, 0.12, 0.35], "position": [-0.32, 0.44, -0.05], "material": "glass"},
    {"id": "side_window_r", "type": "box", "args": [0.03, 0.12, 0.35], "position": [0.32, 0.44, -0.05], "material": "glass"},
    {"id": "door_l", "type": "roundedBox", "args": [0.03, 0.18, 0.45, 0.02], "position": [-0.36, 0.28, 0.05], "material": "body"},
    {"id": "door_r", "type": "roundedBox", "args": [0.03, 0.18, 0.45, 0.02], "position": [0.36, 0.28, 0.05], "material": "body"},
    {"id": "door_handle_l", "type": "roundedBox", "args": [0.01, 0.02, 0.06, 0.005], "position": [-0.37, 0.32, 0.15], "material": "chrome"},
    {"id": "door_handle_r", "type": "roundedBox", "args": [0.01, 0.02, 0.06, 0.005], "position": [0.37, 0.32, 0.15], "material": "chrome"},
    {"id": "wheel_fl", "type": "cylinder", "args": [0.12, 0.12, 0.06, 32], "position": [-0.32, 0.12, 0.5], "rotation": [0, 0, 1.5708], "material": "rubber"},
    {"id": "wheel_fr", "type": "cylinder", "args": [0.12, 0.12, 0.06, 32], "position": [0.32, 0.12, 0.5], "rotation": [0, 0, 1.5708], "material": "rubber"},
    {"id": "wheel_rl", "type": "cylinder", "args": [0.12, 0.12, 0.06, 32], "position": [-0.32, 0.12, -0.5], "rotation": [0, 0, 1.5708], "material": "rubber"},
    {"id": "wheel_rr", "type": "cylinder", "args": [0.12, 0.12, 0.06, 32], "position": [0.32, 0.12, -0.5], "rotation": [0, 0, 1.5708], "material": "rubber"},
    {"id": "rim_fl", "type": "cylinder", "args": [0.08, 0.08, 0.065, 24], "position": [-0.32, 0.12, 0.5], "rotation": [0, 0, 1.5708], "material": "chrome"},
    {"id": "rim_fr", "type": "cylinder", "args": [0.08, 0.08, 0.065, 24], "position": [0.32, 0.12, 0.5], "rotation": [0, 0, 1.5708], "material": "chrome"},
    {"id": "rim_rl", "type": "cylinder", "args": [0.08, 0.08, 0.065, 24], "position": [-0.32, 0.12, -0.5], "rotation": [0, 0, 1.5708], "material": "chrome"},
    {"id": "rim_rr", "type": "cylinder", "args": [0.08, 0.08, 0.065, 24], "position": [0.32, 0.12, -0.5], "rotation": [0, 0, 1.5708], "material": "chrome"},
    {"id": "headlight_l", "type": "sphere", "args": [0.04, 16, 16], "position": [-0.25, 0.28, 0.78], "material": "light"},
    {"id": "headlight_r", "type": "sphere", "args": [0.04, 16, 16], "position": [0.25, 0.28, 0.78], "material": "light"},
    {"id": "headlight_housing_l", "type": "cylinder", "args": [0.05, 0.05, 0.02, 24], "position": [-0.25, 0.28, 0.79], "rotation": [1.5708, 0, 0], "material": "chrome"},
    {"id": "headlight_housing_r", "type": "cylinder", "args": [0.05, 0.05, 0.02, 24], "position": [0.25, 0.28, 0.79], "rotation": [1.5708, 0, 0], "material": "chrome"},
    {"id": "taillight_l", "type": "roundedBox", "args": [0.08, 0.04, 0.02, 0.01], "position": [-0.28, 0.28, -0.79], "material": "light"},
    {"id": "taillight_r", "type": "roundedBox", "args": [0.08, 0.04, 0.02, 0.01], "position": [0.28, 0.28, -0.79], "material": "light"},
    {"id": "grille", "type": "roundedBox", "args": [0.35, 0.06, 0.02, 0.01], "position": [0, 0.2, 0.79], "material": "dark"},
    {"id": "bumper_front", "type": "roundedBox", "args": [0.68, 0.06, 0.08, 0.02], "position": [0, 0.12, 0.75], "material": "body_accent"},
    {"id": "bumper_rear", "type": "roundedBox", "args": [0.65, 0.06, 0.06, 0.02], "position": [0, 0.12, -0.78], "material": "body_accent"},
    {"id": "exhaust_l", "type": "cylinder", "args": [0.025, 0.025, 0.06, 16], "position": [-0.2, 0.1, -0.82], "rotation": [1.5708, 0, 0], "material": "chrome"},
    {"id": "exhaust_r", "type": "cylinder", "args": [0.025, 0.025, 0.06, 16], "position": [0.2, 0.1, -0.82], "rotation": [1.5708, 0, 0], "material": "chrome"},
    {"id": "mirror_l", "type": "roundedBox", "args": [0.02, 0.03, 0.05, 0.01], "position": [-0.38, 0.4, 0.25], "material": "body"},
    {"id": "mirror_r", "type": "roundedBox", "args": [0.02, 0.03, 0.05, 0.01], "position": [0.38, 0.4, 0.25], "material": "body"}
  ],
  "hud": {"title": "Sports Car", "displays": []}
}

NOW CREATE "${topic}" with THIS LEVEL OF DETAIL (${categoryGuide.minParts}-${categoryGuide.maxParts} parts). OUTPUT ONLY THE JSON:`;

    const component = await generateComponentWithRetries({
      systemPrompt,
      userPrompt,
      minParts: categoryGuide.minParts,
      requiredIds: categoryGuide.requiredIds,
      categoryHint: categoryGuide.hint
    });

    // POST-PROCESS: Fix common issues
    const finalComponent = postProcessModel(component, topic);

    console.log(`Generated model with ${component.parts?.length || 0} parts`);

    return NextResponse.json({
      success: true,
        component: finalComponent,
        partCount: finalComponent.parts?.length || 0,
      source: 'ai'
    });

  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}

// Post-process to fix common AI mistakes
function postProcessModel(component: any, topic: string): any {
  const lower = topic.toLowerCase();
  
  // Ensure required fields
  if (!component.name) component.name = topic;
  if (!component.materials || Object.keys(component.materials).length === 0) {
    component.materials = {
      primary: { color: '#6366f1', roughness: 0.5, metalness: 0.3 },
      secondary: { color: '#374151', roughness: 0.6, metalness: 0.2 },
      dark: { color: '#111827', roughness: 0.7, metalness: 0.2 },
      accent: { color: '#10b981', roughness: 0.4, metalness: 0.4 }
    };
  }
  if (!component.parts || component.parts.length === 0) {
    component.parts = [
      { id: 'body', type: 'sphere', args: [0.5, 32, 32], position: [0, 0.5, 0], material: 'primary' }
    ];
  }
  if (!component.hud) {
    component.hud = { title: topic, displays: [] };
  }

  // Fix wheel orientations for vehicles
  const isVehicle = lower.includes('car') || lower.includes('truck') || lower.includes('bus') || lower.includes('vehicle');
  if (isVehicle) {
    component.parts = component.parts.map((part: any) => {
      if (part.id?.includes('wheel') && part.type === 'cylinder') {
        return {
          ...part,
          rotation: [0, 0, Math.PI / 2] // Rotate wheels correctly
        };
      }
      return part;
    });
  }

  // Ensure parts have valid positions
  component.parts = component.parts.map((part: any) => {
    // Parse position if string
    if (typeof part.position === 'string') {
      try {
        part.position = JSON.parse(part.position);
      } catch {
        part.position = [0, 0.5, 0];
      }
    }
    // Parse rotation if string
    if (typeof part.rotation === 'string') {
      try {
        part.rotation = JSON.parse(part.rotation);
      } catch {
        part.rotation = [0, 0, 0];
      }
    }
    // Parse args if string
    if (typeof part.args === 'string') {
      try {
        part.args = JSON.parse(part.args);
      } catch {
        part.args = [0.3, 16, 16];
      }
    }
    
    // Ensure position exists
    if (!part.position) part.position = [0, 0.5, 0];
    if (!part.rotation) part.rotation = [0, 0, 0];
    if (!part.args) part.args = [0.3, 16, 16];
    if (!part.material) part.material = 'primary';

    return part;
  });

  return component;
}

async function generateComponentWithRetries({ systemPrompt, userPrompt, minParts, requiredIds, categoryHint }: { systemPrompt: string; userPrompt: string; minParts: number; requiredIds: string[]; categoryHint: string; }) {
  const attemptPrompts = [
    userPrompt,
    `${userPrompt}\n\nIMPORTANT: Your last output was missing required parts or detail. Increase detail to at least ${minParts} parts. Use REQUIRED part IDs: ${requiredIds.join(", ")}. Follow category requirements:\n${categoryHint}`
  ];

  for (let i = 0; i < attemptPrompts.length; i += 1) {
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: attemptPrompts[i] }
      ],
      temperature: 0.35,
      max_tokens: 4000,
    });

    const text = result.choices[0]?.message?.content || '';
    console.log('AI Response length:', text.length);

    let jsonStr = '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    if (!jsonStr) {
      const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        jsonStr = codeMatch[1].trim();
      }
    }

    if (!jsonStr) {
      continue;
    }

    try {
      jsonStr = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"');
      const component = JSON.parse(jsonStr);
      const categoryCheck = verifyCategory(component, requiredIds);
      const hasMinParts = (component?.parts?.length || 0) >= minParts;
      if (hasMinParts && categoryCheck.ok) {
        return component;
      }
      if (i === attemptPrompts.length - 1) {
        return component;
      }
    } catch (parseError) {
      console.log('JSON parse error:', parseError);
      if (i === attemptPrompts.length - 1) {
        break;
      }
    }
  }

  return createFallbackModel("Unknown");
}

function buildCategoryGuidance(topicLower: string) {
  if (topicLower.includes("shoe") || topicLower.includes("sneaker") || topicLower.includes("boot")) {
    return {
      minParts: 28,
      maxParts: 45,
      requiredIds: ["sole", "midsole", "upper", "toe", "heel", "tongue", "lace"],
      hint: [
        "- MUST include: sole, outsole tread, midsole, upper, toe cap, heel counter",
        "- Add laces or straps, tongue, eyelets, logo patch, stitching strips",
        "- Shape must be long and low profile, not round or blob-like"
      ].join("\n")
    };
  }

  if (topicLower.includes("tennis racket") || topicLower.includes("racket") || topicLower.includes("racquet")) {
    return {
      minParts: 30,
      maxParts: 48,
      requiredIds: ["frame", "string", "handle", "throat", "grip"],
      hint: [
        "- MUST include: oval frame, string bed grid, throat, handle, grip, butt cap",
        "- Strings should be thin bars forming a grid inside the frame",
        "- Long handle with wrapped grip; frame should be thin and oval"
      ].join("\n")
    };
  }

  if (topicLower.includes("bottle") || topicLower.includes("water bottle")) {
    return {
      minParts: 24,
      maxParts: 40,
      requiredIds: ["body", "neck", "cap", "base", "label"],
      hint: [
        "- MUST include: base, cylindrical body, shoulder, neck, cap, label/band",
        "- Use smooth cylinder parts and add ridges or grooves as detail",
        "- Tall vertical silhouette, not wide or flat"
      ].join("\n")
    };
  }

  if (topicLower.includes("rocket")) {
    return {
      minParts: 28,
      maxParts: 45,
      requiredIds: ["nose", "body", "fin", "engine", "nozzle"],
      hint: [
        "- MUST include: nose cone, cylindrical body, fins (3-4), engine bell, nozzle",
        "- Add panel lines, windows, fuel bands, and accent stripes",
        "- Tall vertical silhouette with pointed top"
      ].join("\n")
    };
  }

  if (topicLower.includes("person") || topicLower.includes("human") || topicLower.includes("face") || topicLower.includes("donald") || topicLower.includes("trump")) {
    return {
      minParts: 32,
      maxParts: 50,
      requiredIds: ["head", "eye", "nose", "mouth", "ear", "hair"],
      hint: [
        "- MUST include: head, neck, hair, eyes, nose, mouth, ears, shoulders",
        "- Use layered parts for hair, eyebrows, lips, and jawline",
        "- Keep facial proportions human and recognizable"
      ].join("\n")
    };
  }

  return {
    minParts: 24,
    maxParts: 40,
    requiredIds: [],
    hint: "- Ensure the model matches the object shape and proportions, not a generic blob."
  };
}

function buildProceduralModel(topicLower: string, topic: string) {
  if (topicLower.includes("bottle")) return createWaterBottleModel(topic);
  if (topicLower.includes("tennis racket") || topicLower.includes("racket") || topicLower.includes("racquet")) return createTennisRacketModel(topic);
  if (topicLower.includes("shoe") || topicLower.includes("sneaker") || topicLower.includes("boot")) return createShoeModel(topic);
  if (topicLower.includes("rocket")) return createRocketModel(topic);
  return null;
}

function createWaterBottleModel(topic: string) {
  const points = [
    [0.0, 0.0],
    [0.34, 0.0],
    [0.36, 0.08],
    [0.37, 0.25],
    [0.37, 1.1],
    [0.33, 1.25],
    [0.22, 1.4],
    [0.22, 1.55],
    [0.24, 1.58],
    [0.24, 1.52]
  ];

  return {
    name: "Water Bottle",
    description: "A detailed water bottle with cap and label",
    parameters: [
      { name: "Bottle_Height", type: "number", default: 1, min: 0.7, max: 1.4, unit: "x" },
      { name: "Bottle_Width", type: "number", default: 1, min: 0.7, max: 1.3, unit: "x" },
      { name: "Water_Level", type: "number", default: 0.6, min: 0, max: 1, unit: "" }
    ],
    materials: {
      plastic: { color: "#60A5FA", roughness: 0.15, metalness: 0.05, emissive: "#000000" },
      cap: { color: "#111827", roughness: 0.6, metalness: 0.2 },
      label: { color: "#E5E7EB", roughness: 0.6, metalness: 0.1 },
      water: { color: "#93C5FD", roughness: 0.05, metalness: 0.0, emissive: "#000000" },
      accent: { color: "#1F2937", roughness: 0.5, metalness: 0.2 }
    },
    parts: [
      {
        id: "body",
        type: "lathe",
        points,
        segments: 96,
        position: [0, 0, 0],
        scale: [1, 1, 1],
        material: "plastic",
        parameterBindings: {
          "scale.y": { parameter: "Bottle_Height", scale: 1, offset: 0 },
          "scale.x": { parameter: "Bottle_Width", scale: 1, offset: 0 },
          "scale.z": { parameter: "Bottle_Width", scale: 1, offset: 0 }
        }
      },
      {
        id: "label",
        type: "cylinder",
        args: [0.34, 0.34, 0.28, 64],
        position: [0, 0.7, 0],
        material: "label",
        parameterBindings: {
          "scale.y": { parameter: "Bottle_Height", scale: 1, offset: 0 },
          "scale.x": { parameter: "Bottle_Width", scale: 1, offset: 0 },
          "scale.z": { parameter: "Bottle_Width", scale: 1, offset: 0 }
        }
      },
      {
        id: "neck",
        type: "cylinder",
        args: [0.22, 0.22, 0.18, 64],
        position: [0, 1.45, 0],
        material: "plastic",
        parameterBindings: {
          "scale.y": { parameter: "Bottle_Height", scale: 1, offset: 0 },
          "scale.x": { parameter: "Bottle_Width", scale: 1, offset: 0 },
          "scale.z": { parameter: "Bottle_Width", scale: 1, offset: 0 }
        }
      },
      {
        id: "cap",
        type: "cylinder",
        args: [0.25, 0.25, 0.12, 64],
        position: [0, 1.58, 0],
        material: "cap",
        parameterBindings: {
          "scale.y": { parameter: "Bottle_Height", scale: 1, offset: 0 },
          "scale.x": { parameter: "Bottle_Width", scale: 1, offset: 0 },
          "scale.z": { parameter: "Bottle_Width", scale: 1, offset: 0 }
        }
      },
      {
        id: "base",
        type: "torus",
        args: [0.34, 0.02, 24, 64],
        position: [0, 0.02, 0],
        rotation: [Math.PI / 2, 0, 0],
        material: "accent",
        parameterBindings: {
          "scale.x": { parameter: "Bottle_Width", scale: 1, offset: 0 },
          "scale.z": { parameter: "Bottle_Width", scale: 1, offset: 0 }
        }
      },
      {
        id: "water",
        type: "lathe",
        points: points.map(([x, y]) => [x * 0.93, y * 0.95]),
        segments: 96,
        position: [0, 0, 0],
        material: "water",
        scale: [0.98, 0.6, 0.98],
        parameterBindings: {
          "scale.y": { parameter: "Water_Level", scale: 1, offset: 0 }
        }
      }
    ],
    hud: { title: "Water Bottle", displays: [{ label: "Water", parameter: "Water_Level", unit: "" }] }
  };
}

function createRocketModel(topic: string) {
  return {
    name: "Rocket",
    description: "A detailed rocket with fins and engine bell",
    parameters: [
      { name: "Rocket_Height", type: "number", default: 1, min: 0.8, max: 1.5, unit: "x" },
      { name: "Rocket_Width", type: "number", default: 1, min: 0.7, max: 1.3, unit: "x" }
    ],
    materials: {
      body: { color: "#E5E7EB", roughness: 0.4, metalness: 0.6 },
      accent: { color: "#EF4444", roughness: 0.35, metalness: 0.2 },
      dark: { color: "#111827", roughness: 0.7, metalness: 0.2 },
      window: { color: "#93C5FD", roughness: 0.1, metalness: 0.1 }
    },
    parts: [
      { id: "body", type: "cylinder", args: [0.3, 0.3, 1.2, 64], position: [0, 0.7, 0], material: "body",
        parameterBindings: { "scale.y": { parameter: "Rocket_Height", scale: 1, offset: 0 }, "scale.x": { parameter: "Rocket_Width", scale: 1, offset: 0 }, "scale.z": { parameter: "Rocket_Width", scale: 1, offset: 0 } }
      },
      { id: "nose", type: "cone", args: [0.3, 0.45, 48], position: [0, 1.35, 0], material: "accent",
        parameterBindings: { "scale.y": { parameter: "Rocket_Height", scale: 1, offset: 0 }, "scale.x": { parameter: "Rocket_Width", scale: 1, offset: 0 }, "scale.z": { parameter: "Rocket_Width", scale: 1, offset: 0 } }
      },
      { id: "engine_bell", type: "cone", args: [0.32, 0.28, 48], position: [0, 0.05, 0], rotation: [Math.PI, 0, 0], material: "dark" },
      { id: "nozzle", type: "cylinder", args: [0.12, 0.16, 0.12, 48], position: [0, 0.12, 0], material: "dark" },
      { id: "fin_left", type: "box", args: [0.06, 0.2, 0.28], position: [-0.28, 0.3, 0], material: "accent" },
      { id: "fin_right", type: "box", args: [0.06, 0.2, 0.28], position: [0.28, 0.3, 0], material: "accent" },
      { id: "fin_back", type: "box", args: [0.28, 0.2, 0.06], position: [0, 0.3, -0.28], material: "accent" },
      { id: "fin_front", type: "box", args: [0.28, 0.2, 0.06], position: [0, 0.3, 0.28], material: "accent" },
      { id: "window", type: "sphere", args: [0.08, 32, 32], position: [0, 0.95, 0.27], material: "window" },
      { id: "band1", type: "torus", args: [0.31, 0.02, 24, 64], position: [0, 0.55, 0], rotation: [Math.PI / 2, 0, 0], material: "accent" },
      { id: "band2", type: "torus", args: [0.31, 0.02, 24, 64], position: [0, 0.95, 0], rotation: [Math.PI / 2, 0, 0], material: "accent" }
    ],
    hud: { title: "Rocket", displays: [] }
  };
}

function createTennisRacketModel(topic: string) {
  const parts = [];
  const stringCountX = 8;
  const stringCountY = 6;

  for (let i = 0; i < stringCountX; i += 1) {
    const x = -0.25 + (i * 0.5) / (stringCountX - 1);
    parts.push({ id: `string_v_${i}`, type: "box", args: [0.01, 0.7, 0.01], position: [x, 1.1, 0], material: "string" });
  }
  for (let i = 0; i < stringCountY; i += 1) {
    const y = 0.8 + (i * 0.6) / (stringCountY - 1);
    parts.push({ id: `string_h_${i}`, type: "box", args: [0.5, 0.01, 0.01], position: [0, y, 0], material: "string" });
  }

  return {
    name: "Tennis Racket",
    description: "A detailed tennis racket with string bed",
    parameters: [
      { name: "Racket_Length", type: "number", default: 1, min: 0.8, max: 1.4, unit: "x" }
    ],
    materials: {
      frame: { color: "#111827", roughness: 0.5, metalness: 0.3 },
      grip: { color: "#4B5563", roughness: 0.9, metalness: 0.1 },
      string: { color: "#E5E7EB", roughness: 0.4, metalness: 0.2 },
      accent: { color: "#F59E0B", roughness: 0.5, metalness: 0.2 }
    },
    parts: [
      {
        id: "frame",
        type: "torus",
        args: [0.32, 0.03, 24, 64],
        position: [0, 1.1, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1.1, 1.4, 0.6],
        material: "frame",
        parameterBindings: { "scale.y": { parameter: "Racket_Length", scale: 1, offset: 0 } }
      },
      { id: "throat", type: "roundedBox", args: [0.18, 0.18, 0.08, 0.03], position: [0, 0.7, 0], material: "frame" },
      { id: "handle", type: "capsule", args: [0.08, 0.5, 12, 24], position: [0, 0.3, 0], rotation: [0, 0, 0], material: "grip" },
      { id: "grip", type: "cylinder", args: [0.09, 0.09, 0.45, 48], position: [0, 0.3, 0], material: "grip" },
      { id: "butt_cap", type: "cylinder", args: [0.1, 0.1, 0.06, 48], position: [0, 0.05, 0], material: "accent" },
      ...parts
    ],
    hud: { title: "Tennis Racket", displays: [] }
  };
}

function createShoeModel(topic: string) {
  const laces = Array.from({ length: 6 }).map((_, i) => ({
    id: `lace_${i}`,
    type: "box",
    args: [0.12, 0.01, 0.02],
    position: [0, 0.28 + i * 0.035, 0.12 - i * 0.01],
    material: "lace"
  }));

  return {
    name: "Shoe",
    description: "A detailed sneaker with sole and upper",
    parameters: [
      { name: "Shoe_Length", type: "number", default: 1, min: 0.8, max: 1.4, unit: "x" }
    ],
    materials: {
      sole: { color: "#E5E7EB", roughness: 0.9, metalness: 0.1 },
      midsole: { color: "#D1D5DB", roughness: 0.8, metalness: 0.1 },
      upper: { color: "#2563EB", roughness: 0.6, metalness: 0.1 },
      lace: { color: "#F9FAFB", roughness: 0.7, metalness: 0.1 },
      accent: { color: "#111827", roughness: 0.6, metalness: 0.2 }
    },
    parts: [
      { id: "sole", type: "roundedBox", args: [0.8, 0.08, 0.3, 0.04], position: [0, 0.04, 0], material: "sole" },
      { id: "midsole", type: "roundedBox", args: [0.76, 0.06, 0.28, 0.03], position: [0, 0.10, 0], material: "midsole" },
      { id: "upper", type: "roundedBox", args: [0.7, 0.16, 0.26, 0.06], position: [0, 0.22, 0], material: "upper" },
      { id: "toe", type: "capsule", args: [0.12, 0.22, 12, 24], position: [0.32, 0.16, 0], rotation: [0, 0, Math.PI / 2], material: "upper" },
      { id: "heel", type: "roundedBox", args: [0.2, 0.18, 0.26, 0.04], position: [-0.3, 0.2, 0], material: "upper" },
      { id: "tongue", type: "roundedBox", args: [0.18, 0.08, 0.06, 0.03], position: [0.05, 0.3, 0], material: "accent" },
      { id: "logo", type: "roundedBox", args: [0.18, 0.02, 0.08, 0.02], position: [0.05, 0.22, 0.14], material: "accent" },
      ...laces
    ],
    hud: { title: "Shoe", displays: [] }
  };
}

function verifyCategory(component: any, requiredIds: string[]) {
  if (!requiredIds || requiredIds.length === 0) {
    return { ok: true, missing: [] };
  }

  const ids = (component?.parts || []).map((p: any) => String(p?.id || "").toLowerCase());
  const missing = requiredIds.filter((req) => !ids.some((id) => id.includes(req)));
  return { ok: missing.length <= Math.max(1, Math.floor(requiredIds.length / 3)), missing };
}
// Fallback model when AI fails
function createFallbackModel(topic: string): any {
  return {
    name: topic,
    description: `A 3D representation of ${topic}`,
    parameters: [],
    materials: {
      primary: { color: '#6366f1', roughness: 0.5, metalness: 0.3 },
      secondary: { color: '#374151', roughness: 0.6, metalness: 0.2 },
      accent: { color: '#10b981', roughness: 0.4, metalness: 0.4 }
    },
    parts: [
      { id: 'body', type: 'sphere', args: [0.4, 32, 32], position: [0, 0.6, 0], material: 'primary' },
      { id: 'base', type: 'cylinder', args: [0.3, 0.35, 0.2, 24], position: [0, 0.1, 0], material: 'secondary' },
      { id: 'top', type: 'sphere', args: [0.2, 24, 24], position: [0, 1.0, 0], material: 'accent' },
      { id: 'left', type: 'capsule', args: [0.08, 0.2, 8, 16], position: [-0.35, 0.5, 0], rotation: [0, 0, 0.5], material: 'secondary' },
      { id: 'right', type: 'capsule', args: [0.08, 0.2, 8, 16], position: [0.35, 0.5, 0], rotation: [0, 0, -0.5], material: 'secondary' }
    ],
    hud: { title: topic, displays: [] }
  };
}
