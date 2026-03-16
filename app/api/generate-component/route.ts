import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// This API generates HIGH-QUALITY React Three Fiber component specifications
// Similar to Arm.jsx and Turbine.jsx - with detailed meshes, materials, parameters, animations, and HUD

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function POST(req: Request) {
  try {
    const { topic, context = '' } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: 'Topic required' }, { status: 400 });
    }

    const systemPrompt = `You are an expert 3D modeler. Generate COMPACT, PROPERLY SCALED 3D models.

CRITICAL SCALE RULES:
- Total model size must fit in a 4x4x4 unit bounding box
- Cars: ~3 units long, ~1.2 units wide, ~0.8 units tall
- Robots: ~2 units tall
- Aircraft: ~3 units wingspan
- All parts positioned relative to center (0, 0, 0)
- Y=0 is ground level, model sits ON the ground

CRITICAL POSITIONING:
- Center the model at origin (0, 0, 0)
- Ground level is Y=0, so bottom of model should be at Y=0 or slightly above
- For vehicles: wheels touch ground (Y~0.15 for wheel center)
- Parts must be CONNECTED, not floating randomly

OUTPUT FORMAT: Return ONLY valid JSON with this exact structure:
{
  "name": "ComponentName",
  "description": "What this component represents",
  "parameters": [
    {
      "name": "Parameter_Name",
      "type": "number",
      "default": 50,
      "min": 0,
      "max": 100,
      "unit": "%",
      "description": "What this controls"
    }
  ],
  "materials": {
    "primary": { "color": "#E7E9EE", "roughness": 0.42, "metalness": 0.12 },
    "secondary": { "color": "#3B3F46", "roughness": 0.55, "metalness": 0.18 },
    "accent": { "color": "#10b981", "roughness": 0.3, "metalness": 0.6 },
    "rubber": { "color": "#1C1F25", "roughness": 0.9, "metalness": 0.05 }
  },
  "parts": [
    {
      "id": "part_name",
      "type": "box|cylinder|sphere|capsule|torus|cone|roundedBox",
      "args": [width, height, depth] or [radius, height, segments],
      "position": [x, y, z],
      "rotation": [rx, ry, rz],
      "material": "primary|secondary|accent|rubber|custom",
      "customMaterial": { "color": "#fff", "roughness": 0.5, "metalness": 0.3, "emissive": "#000", "emissiveIntensity": 0 },
      "parent": "parent_part_id or null",
      "animation": {
        "type": "rotate|oscillate|pulse|none",
        "axis": "x|y|z",
        "speed": 1.0,
        "amplitude": 0.5,
        "parameter": "Wind_Speed"
      },
      "parameterBindings": {
        "rotation.x": { "parameter": "Arm_Pitch", "scale": 0.0174533, "offset": 0 }
      }
    }
  ],
  "physics": {
    "stressFormula": "(windSpeed * bladeCount) / 200",
    "criticalThreshold": 1.5,
    "effects": ["wobble", "colorChange"]
  },
  "hud": {
    "title": "Component Telemetry",
    "displays": [
      { "label": "Speed", "parameter": "Wind_Speed", "unit": "m/s", "format": "number" }
    ]
  }
}

QUALITY REQUIREMENTS:
1. MINIMUM 15-30 parts for complex objects (like a car, robot, aircraft)
2. Use nested parent-child relationships for articulated parts
3. Include multiple materials with realistic properties
4. Add AT LEAST 5 adjustable parameters that affect the visualization
5. Include physics calculations where relevant (stress, torque, speed, etc.)
6. Add animations for moving parts
7. Include a HUD display showing key parameters
8. Use proper proportions and realistic dimensions
9. Add small details like bolts, joints, cables, panels
10. Use RoundedBox for organic/mechanical shapes

EXAMPLES OF GOOD PARAMETERS:
- For a car: Wheel_Angle, Suspension_Height, Door_Open, Speed, Engine_RPM
- For a robot: Joint_1_Angle, Joint_2_Angle, Gripper_Open, Head_Tilt
- For an aircraft: Pitch, Roll, Yaw, Throttle, Flaps_Angle, Landing_Gear

COORDINATE SYSTEM:
- X = left/right (positive = right)
- Y = up/down (positive = up)  
- Z = forward/back (positive = toward viewer)
- Center at (0, 0, 0)

EXAMPLES (copy these scales and styles):

SPORTS CAR:
{"parts": [
  {"id": "body", "type": "roundedBox", "args": [1.2, 0.35, 2.8, 0.08], "position": [0, 0.35, 0]},
  {"id": "cabin", "type": "roundedBox", "args": [1.0, 0.3, 1.2, 0.06], "position": [0, 0.6, -0.2]},
  {"id": "wheel_fl", "type": "cylinder", "args": [0.18, 0.18, 0.12, 24], "position": [-0.55, 0.18, 0.9], "rotation": [0, 0, 1.5708]},
  {"id": "wheel_fr", "type": "cylinder", "args": [0.18, 0.18, 0.12, 24], "position": [0.55, 0.18, 0.9], "rotation": [0, 0, 1.5708]},
  {"id": "wheel_rl", "type": "cylinder", "args": [0.18, 0.18, 0.12, 24], "position": [-0.55, 0.18, -0.9], "rotation": [0, 0, 1.5708]},
  {"id": "wheel_rr", "type": "cylinder", "args": [0.18, 0.18, 0.12, 24], "position": [0.55, 0.18, -0.9], "rotation": [0, 0, 1.5708]}
]}

TEDDY BEAR (character/toy):
{"parts": [
  {"id": "body", "type": "sphere", "args": [0.5, 32, 32], "position": [0, 0.6, 0], "material": "accent"},
  {"id": "head", "type": "sphere", "args": [0.35, 32, 32], "position": [0, 1.2, 0], "material": "accent"},
  {"id": "snout", "type": "sphere", "args": [0.12, 16, 16], "position": [0, 1.15, 0.28], "material": "secondary"},
  {"id": "nose", "type": "sphere", "args": [0.05, 16, 16], "position": [0, 1.18, 0.38], "material": "rubber"},
  {"id": "eye_left", "type": "sphere", "args": [0.04, 16, 16], "position": [-0.12, 1.28, 0.25], "material": "rubber"},
  {"id": "eye_right", "type": "sphere", "args": [0.04, 16, 16], "position": [0.12, 1.28, 0.25], "material": "rubber"},
  {"id": "ear_left", "type": "sphere", "args": [0.12, 16, 16], "position": [-0.28, 1.45, 0], "material": "accent"},
  {"id": "ear_right", "type": "sphere", "args": [0.12, 16, 16], "position": [0.28, 1.45, 0], "material": "accent"},
  {"id": "arm_left", "type": "capsule", "args": [0.1, 0.3, 8, 16], "position": [-0.55, 0.7, 0], "rotation": [0, 0, 0.5], "material": "accent"},
  {"id": "arm_right", "type": "capsule", "args": [0.1, 0.3, 8, 16], "position": [0.55, 0.7, 0], "rotation": [0, 0, -0.5], "material": "accent"},
  {"id": "leg_left", "type": "capsule", "args": [0.12, 0.25, 8, 16], "position": [-0.22, 0.15, 0], "material": "accent"},
  {"id": "leg_right", "type": "capsule", "args": [0.12, 0.25, 8, 16], "position": [0.22, 0.15, 0], "material": "accent"}
]}

HELICOPTER:
{"parts": [
  {"id": "body", "type": "capsule", "args": [0.4, 1.2, 16, 32], "position": [0, 0.6, 0], "rotation": [0, 0, 1.5708]},
  {"id": "cockpit", "type": "sphere", "args": [0.35, 32, 32], "position": [0.6, 0.7, 0], "material": "glass"},
  {"id": "tail", "type": "cylinder", "args": [0.08, 0.04, 1.2, 16], "position": [-1.0, 0.6, 0], "rotation": [0, 0, 1.5708]},
  {"id": "main_rotor", "type": "box", "args": [0.08, 0.02, 2.0], "position": [0, 1.1, 0], "animation": {"type": "rotate", "axis": "y", "speed": 5}},
  {"id": "tail_rotor", "type": "box", "args": [0.04, 0.3, 0.02], "position": [-1.6, 0.6, 0.1], "animation": {"type": "rotate", "axis": "z", "speed": 8}},
  {"id": "skid_left", "type": "cylinder", "args": [0.03, 0.03, 1.0, 8], "position": [-0.3, 0.1, 0], "rotation": [0, 0, 1.5708]},
  {"id": "skid_right", "type": "cylinder", "args": [0.03, 0.03, 1.0, 8], "position": [0.3, 0.1, 0], "rotation": [0, 0, 1.5708]}
]}

IMPORTANT RULES:
- ALL parts must have unique IDs
- Parts must be SMALL and CONNECTED (see example sizes above)
- Wheels: radius ~0.15-0.2, rotate with [0, 0, 1.5708] to face sideways
- Use roundedBox for smooth shapes with 4th arg as radius (0.02-0.1)
- Body parts: typically 0.2-1.5 units, never larger than 3 units`;

    const userPrompt = `Create a detailed 3D component specification for: "${topic}"
${context ? `\nContext from user notes:\n${context.slice(0, 500)}` : ''}

Generate a high-quality, realistic 3D model with:
- Multiple detailed parts with proper proportions
- Realistic materials (metal, plastic, rubber as appropriate)
- Adjustable parameters the user can modify
- Animations for any moving parts
- A telemetry HUD showing key stats

Return ONLY the JSON, no markdown or explanation.`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 8000,
    });

    const content = completion.choices[0]?.message?.content || '';
    
    // Extract JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let component;
    try {
      component = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse component JSON:', e);
      return NextResponse.json({ 
        error: 'Failed to parse component', 
        raw: content 
      }, { status: 500 });
    }

    // Validate and enhance the component
    component.name = component.name || topic.replace(/\s+/g, '');
    component.description = component.description || `3D model of ${topic}`;
    component.parameters = component.parameters || [];
    component.materials = component.materials || {
      primary: { color: "#E7E9EE", roughness: 0.42, metalness: 0.12 },
      secondary: { color: "#3B3F46", roughness: 0.55, metalness: 0.18 },
      accent: { color: "#8B5A2B", roughness: 0.7, metalness: 0.05 }, // Brown for teddy bears etc
      rubber: { color: "#1C1F25", roughness: 0.9, metalness: 0.05 },
      glass: { color: "#87CEEB", roughness: 0.1, metalness: 0.1 }
    };
    component.parts = component.parts || [];
    component.hud = component.hud || { title: topic, displays: [] };

    // Ensure all parts have required fields + AUTO-FIX common issues
    component.parts = component.parts.map((part: any, i: number) => {
      const id = (part.id || `part_${i}`).toLowerCase();
      let rotation = part.rotation || [0, 0, 0];
      let animation = part.animation || null;
      
      // AUTO-FIX: Wheels must be rotated 90° on Z to face sideways
      if (id.includes('wheel') || id.includes('tire')) {
        // Check if rotation is missing or wrong
        if (!rotation[2] || Math.abs(rotation[2]) < 1) {
          rotation = [rotation[0] || 0, rotation[1] || 0, Math.PI / 2]; // 90 degrees
        }
        // Wheels should rotate on X axis (forward rolling), not spin randomly
        if (animation && animation.type === 'rotate') {
          animation = { ...animation, axis: 'x', speed: 0.5 };
        }
      }
      
      // AUTO-FIX: Doors should rotate on Y axis
      if (id.includes('door')) {
        if (animation && animation.type === 'rotate') {
          animation = { ...animation, axis: 'y', speed: 0.3 };
        }
      }
      
      // AUTO-FIX: Propellers/rotors rotate on Y axis
      if (id.includes('propeller') || id.includes('rotor') || id.includes('blade')) {
        if (animation && animation.type === 'rotate') {
          animation = { ...animation, axis: 'y', speed: 2 };
        }
      }
      
      // AUTO-FIX: Don't animate static parts
      if (id.includes('body') || id.includes('chassis') || id.includes('cabin') || 
          id.includes('hood') || id.includes('windshield') || id.includes('window') ||
          id.includes('head') || id.includes('torso') || id.includes('seat')) {
        animation = null;
      }
      
      return {
        id: part.id || `part_${i}`,
        type: part.type || 'box',
        args: part.args || [1, 1, 1],
        position: part.position || [0, 0, 0],
        rotation,
        material: part.material || 'primary',
        customMaterial: part.customMaterial,
        parent: part.parent || null,
        animation,
        parameterBindings: part.parameterBindings || null,
        castShadow: true,
        receiveShadow: true
      };
    });

    // Add parameter displays to HUD if missing
    if (component.hud.displays.length === 0 && component.parameters.length > 0) {
      component.hud.displays = component.parameters.slice(0, 4).map((p: any) => ({
        label: p.name.replace(/_/g, ' '),
        parameter: p.name,
        unit: p.unit || '',
        format: 'number'
      }));
    }

    // VERIFICATION: Check model quality
    const issues: string[] = [];
    
    // Check wheel count for vehicles
    const wheelParts = component.parts.filter((p: any) => 
      p.id.toLowerCase().includes('wheel')
    );
    if (topic.toLowerCase().includes('car') && wheelParts.length < 4) {
      issues.push(`Car should have 4 wheels, found ${wheelParts.length}`);
    }
    
    // Check for body/main part
    const hasBody = component.parts.some((p: any) => 
      ['body', 'chassis', 'torso', 'base', 'main'].some(k => p.id.toLowerCase().includes(k))
    );
    if (!hasBody) {
      issues.push('Missing main body part');
    }
    
    // Check minimum part count
    if (component.parts.length < 5) {
      issues.push(`Only ${component.parts.length} parts - model may lack detail`);
    }

    return NextResponse.json({
      success: true,
      component,
      partCount: component.parts.length,
      parameterCount: component.parameters.length,
      issues: issues.length > 0 ? issues : null,
      quality: issues.length === 0 ? 'good' : 'needs_review'
    });

  } catch (error) {
    console.error('Generate component error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate component',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
