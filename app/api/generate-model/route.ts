import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { topic, context } = await req.json();

    const systemPrompt = `You are a precise 3D CAD modeler. Generate accurate, symmetrical 3D models.

COORDINATE SYSTEM (CRITICAL):
- X axis: LEFT (-) to RIGHT (+) 
- Y axis: DOWN (-) to UP (+) - this is vertical
- Z axis: BACK (-) to FRONT (+)
- Model faces FRONT (positive Z direction)
- Wheels/tires rotate around X axis (roll forward)
- Propellers/rotors rotate around Y axis (spin horizontally)

SYMMETRY RULES (VERY IMPORTANT):
- Vehicles MUST have parts on BOTH left AND right sides
- Left side: negative X position
- Right side: positive X position  
- Example: wheel_left at [-1.5, 0, 1], wheel_right at [1.5, 0, 1]

OUTPUT: Valid JSON only. No markdown.

PRIMITIVES:
- box: [width(X), height(Y), depth(Z)]
- sphere: [radius, 64, 64]
- cylinder: [radiusTop, radiusBottom, height, 64] - height along Y by default
- cone: [radius, height, 64]
- torus: [radius, tubeRadius, 32, 64] - for tires, rotate [Math.PI/2, 0, 0] to face forward
- capsule: [radius, bodyLength, 16, 32]

WHEEL/TIRE SETUP (for vehicles):
- Tires are TORUS primitives
- Rotation: [1.5708, 0, 0] (90 degrees on X) to face sideways for driving
- Animation: {"type": "rotate", "axis": "x", "speed": 5} for forward rolling
- MUST place on BOTH sides: left (negative X) and right (positive X)
- Front wheels: positive Z, Rear wheels: negative Z

CAR EXAMPLE (follow this pattern):
{
  "name": "sports_car",
  "description": "Red sports car with 4 wheels",
  "scale": 0.6,
  "parts": [
    {"id": "body_main", "type": "box", "args": [2, 0.6, 4], "position": [0, 0.5, 0], "rotation": [0, 0, 0], "color": "#dc2626", "metalness": 0.8, "roughness": 0.2, "emissive": null, "animation": null},
    {"id": "cabin", "type": "box", "args": [1.8, 0.5, 1.5], "position": [0, 1, -0.3], "rotation": [0, 0, 0], "color": "#1e3a5f", "metalness": 0.1, "roughness": 0.1, "emissive": null, "animation": null},
    {"id": "hood", "type": "box", "args": [1.9, 0.15, 1.2], "position": [0, 0.85, 1.2], "rotation": [-0.1, 0, 0], "color": "#dc2626", "metalness": 0.8, "roughness": 0.2, "emissive": null, "animation": null},
    {"id": "trunk", "type": "box", "args": [1.9, 0.2, 0.8], "position": [0, 0.75, -1.5], "rotation": [0.05, 0, 0], "color": "#dc2626", "metalness": 0.8, "roughness": 0.2, "emissive": null, "animation": null},
    
    {"id": "wheel_fl", "type": "torus", "args": [0.35, 0.12, 32, 64], "position": [-0.9, 0.35, 1.3], "rotation": [1.5708, 0, 0], "color": "#1a1a1a", "metalness": 0.1, "roughness": 0.9, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    {"id": "wheel_fr", "type": "torus", "args": [0.35, 0.12, 32, 64], "position": [0.9, 0.35, 1.3], "rotation": [1.5708, 0, 0], "color": "#1a1a1a", "metalness": 0.1, "roughness": 0.9, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    {"id": "wheel_bl", "type": "torus", "args": [0.35, 0.12, 32, 64], "position": [-0.9, 0.35, -1.3], "rotation": [1.5708, 0, 0], "color": "#1a1a1a", "metalness": 0.1, "roughness": 0.9, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    {"id": "wheel_br", "type": "torus", "args": [0.35, 0.12, 32, 64], "position": [0.9, 0.35, -1.3], "rotation": [1.5708, 0, 0], "color": "#1a1a1a", "metalness": 0.1, "roughness": 0.9, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    
    {"id": "rim_fl", "type": "cylinder", "args": [0.25, 0.25, 0.15, 32], "position": [-0.9, 0.35, 1.3], "rotation": [0, 0, 1.5708], "color": "#c0c0c0", "metalness": 0.9, "roughness": 0.1, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    {"id": "rim_fr", "type": "cylinder", "args": [0.25, 0.25, 0.15, 32], "position": [0.9, 0.35, 1.3], "rotation": [0, 0, 1.5708], "color": "#c0c0c0", "metalness": 0.9, "roughness": 0.1, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    {"id": "rim_bl", "type": "cylinder", "args": [0.25, 0.25, 0.15, 32], "position": [-0.9, 0.35, -1.3], "rotation": [0, 0, 1.5708], "color": "#c0c0c0", "metalness": 0.9, "roughness": 0.1, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    {"id": "rim_br", "type": "cylinder", "args": [0.25, 0.25, 0.15, 32], "position": [0.9, 0.35, -1.3], "rotation": [0, 0, 1.5708], "color": "#c0c0c0", "metalness": 0.9, "roughness": 0.1, "emissive": null, "animation": {"type": "rotate", "axis": "x", "speed": 5}},
    
    {"id": "headlight_l", "type": "sphere", "args": [0.1, 16, 16], "position": [-0.7, 0.6, 1.95], "rotation": [0, 0, 0], "color": "#fffacd", "metalness": 0.1, "roughness": 0.2, "emissive": "#fffacd", "animation": null},
    {"id": "headlight_r", "type": "sphere", "args": [0.1, 16, 16], "position": [0.7, 0.6, 1.95], "rotation": [0, 0, 0], "color": "#fffacd", "metalness": 0.1, "roughness": 0.2, "emissive": "#fffacd", "animation": null},
    {"id": "taillight_l", "type": "box", "args": [0.2, 0.1, 0.05], "position": [-0.8, 0.7, -1.97], "rotation": [0, 0, 0], "color": "#ff0000", "metalness": 0.1, "roughness": 0.3, "emissive": "#ff0000", "animation": null},
    {"id": "taillight_r", "type": "box", "args": [0.2, 0.1, 0.05], "position": [0.8, 0.7, -1.97], "rotation": [0, 0, 0], "color": "#ff0000", "metalness": 0.1, "roughness": 0.3, "emissive": "#ff0000", "animation": null},
    
    {"id": "windshield", "type": "box", "args": [1.7, 0.02, 0.9], "position": [0, 1.1, 0.5], "rotation": [0.5, 0, 0], "color": "#87ceeb", "metalness": 0.0, "roughness": 0.05, "emissive": null, "animation": null},
    {"id": "rear_window", "type": "box", "args": [1.6, 0.02, 0.6], "position": [0, 1.05, -1.0], "rotation": [-0.4, 0, 0], "color": "#87ceeb", "metalness": 0.0, "roughness": 0.05, "emissive": null, "animation": null},
    {"id": "spoiler", "type": "box", "args": [1.8, 0.05, 0.3], "position": [0, 1.0, -1.85], "rotation": [-0.2, 0, 0], "color": "#1a1a1a", "metalness": 0.7, "roughness": 0.3, "emissive": null, "animation": null},
    {"id": "exhaust_l", "type": "cylinder", "args": [0.06, 0.06, 0.15, 16], "position": [-0.5, 0.2, -2.05], "rotation": [1.5708, 0, 0], "color": "#404040", "metalness": 0.9, "roughness": 0.2, "emissive": null, "animation": null},
    {"id": "exhaust_r", "type": "cylinder", "args": [0.06, 0.06, 0.15, 16], "position": [0.5, 0.2, -2.05], "rotation": [1.5708, 0, 0], "color": "#404040", "metalness": 0.9, "roughness": 0.2, "emissive": null, "animation": null}
  ]
}

HELICOPTER ROTOR SETUP:
- Main rotor blades rotate around Y axis: {"type": "rotate", "axis": "y", "speed": 10}
- Tail rotor rotates around Z axis: {"type": "spin", "axis": "z", "speed": 15}

Generate accurate, symmetrical models following these exact conventions.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create a detailed, accurate 3D model of: ${topic}\n\nEnsure all parts are symmetrical where appropriate (wheels on both sides, lights on both sides, etc.)${context ? `\n\nContext: ${context.slice(0, 200)}` : ''}` }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.5, // Lower temperature for more consistent output
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let model = JSON.parse(content);

    // Validate and fix common issues
    if (model.parts && Array.isArray(model.parts)) {
      model.parts = model.parts.map((part: any, i: number) => {
        const fixed = {
          id: part.id || `part_${i}`,
          type: part.type || 'box',
          args: part.args || [1, 1, 1],
          position: part.position || [0, 0, 0],
          rotation: part.rotation || [0, 0, 0],
          color: part.color || '#6366f1',
          metalness: part.metalness ?? 0.3,
          roughness: part.roughness ?? 0.5,
          emissive: part.emissive || null,
          animation: part.animation || null
        };
        
        // Fix wheel animations - should rotate on X axis for forward motion
        if (fixed.id.includes('wheel') || fixed.id.includes('tire')) {
          if (fixed.animation && fixed.animation.axis === 'z') {
            fixed.animation.axis = 'x';
          }
        }
        
        return fixed;
      });
      
      // Check for symmetry issues and try to fix
      const leftParts = model.parts.filter((p: any) => p.id.includes('_l') || p.id.includes('_left') || p.id.includes('_fl') || p.id.includes('_bl'));
      const rightParts = model.parts.filter((p: any) => p.id.includes('_r') || p.id.includes('_right') || p.id.includes('_fr') || p.id.includes('_br'));
      
      // If we have left parts but missing right equivalents, mirror them
      if (leftParts.length > rightParts.length) {
        leftParts.forEach((leftPart: any) => {
          const rightId = leftPart.id.replace('_l', '_r').replace('_left', '_right').replace('_fl', '_fr').replace('_bl', '_br');
          const hasRight = model.parts.some((p: any) => p.id === rightId);
          
          if (!hasRight && leftPart.position[0] < 0) {
            // Mirror the part
            const rightPart = {
              ...leftPart,
              id: rightId,
              position: [-leftPart.position[0], leftPart.position[1], leftPart.position[2]]
            };
            model.parts.push(rightPart);
          }
        });
      }
    }

    return NextResponse.json({ success: true, model });
  } catch (error) {
    console.error('Generate model error:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to generate model',
      model: {
        name: "error_placeholder",
        description: "Error generating model",
        scale: 1,
        parts: [
          { id: "error_indicator", type: "sphere", args: [1, 32, 32], position: [0, 1, 0], rotation: [0, 0, 0], color: "#ef4444", metalness: 0.3, roughness: 0.5, emissive: "#ef4444", animation: { type: "pulse", axis: "y", speed: 2 } }
        ]
      }
    });
  }
}
