import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateNewSimulation(notes: string) {
  const systemPrompt = `
    You are a physics engine API. Extract variables from the user's notes.
    RULES:
    1. Output Pure JSON. NO MATH. Calculate values yourself.
    2. Detect Topic: "wind_turbine", "robot_arm", "electronics".
    3. Standardize Units: "10 cm" -> 0.1, "100 mph" -> 45 (approx m/s), "12 V" -> 12.
    EXAMPLE: { "topic": "wind_turbine", "vars": { "wind_speed": 45, "blade_count": 5 } }
  `;

  let parsedData = { topic: "wind_turbine", vars: {} as any };

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: notes }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });
    parsedData = JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch (err) {
      console.error("Groq Error", err);
  }
    
  const topic = parsedData.topic || 'wind_turbine';
  const vars = parsedData.vars || {};

  // --- PHYSICS ENGINE ---
  let status = 'OPTIMAL';
  let message = 'System normal.';
  let recommendation = ''; 

  if (topic === 'wind_turbine') {
    const wind = vars.wind_speed || 0;
    const blades = vars.blade_count || 3;
    // Physics: 3 blades limit ~60 m/s. 8 blades limit ~20 m/s (high drag).
    const limit = Math.max(20, 75 - (blades * 5)); 

    if (wind > limit) {
      status = 'CRITICAL_FAILURE';
      message = `Drag from ${blades} blades exceeded limit (${limit} m/s) at wind speed ${wind} m/s.`;
      recommendation = `Reduce wind_speed to ${(limit - 5).toFixed(0)} m/s OR reduce blade_count to 3.`;
    }
  } 
  else if (topic === 'robot_arm') {
     const payload = vars.payload || 0;
     const length = vars.arm_length || 1;
     const torque = payload * length * 9.8; 
     if (torque > 600) { 
         status = 'CRITICAL_FAILURE'; 
         message = `Torque (${torque.toFixed(0)} Nm) snapped gears. Limit 600 Nm.`;
         recommendation = `Reduce payload to ${(600 / (length * 9.8)).toFixed(1)} kg.`;
     }
  }

  // --- AI EXPLANATION ---
  let aiExplanation = "";
  if (status === 'CRITICAL_FAILURE') {
    try {
        const report = await groq.chat.completions.create({
          messages: [{ role: 'user', content: `Explain physics failure: ${topic}, vars: ${JSON.stringify(vars)}. Reason: ${message}. Write 1 dramatic sentence.` }],
          model: 'llama-3.3-70b-versatile',
        });
        aiExplanation = report.choices[0]?.message?.content || "Catastrophic failure.";
    } catch (e) {}
  }

  return { extraction: parsedData, simulation: { status, message, aiExplanation, recommendation } };
}

export async function POST(req: Request) {
  try {
    const { notes } = await req.json();
    
    // Extract key variables directly from the notes for physics simulation
    // This bypasses the LLM for variable extraction to ensure real-time response
    const directVars = extractVariablesDirectly(notes);
    
    // If we have direct variables, run physics simulation immediately (no cache)
    if (Object.keys(directVars).length > 0) {
      const result = runPhysicsSimulation(directVars, notes);
      return NextResponse.json(result);
    }
    
    // Only use LLM for complex natural language (with caching)
    const cacheKey = notes.trim().substring(0, 500); // Limit cache key size
    
    const cachedEntry = await prisma.simulationCache.findUnique({ where: { prompt: cacheKey } });
    if (cachedEntry) {
      return NextResponse.json(JSON.parse(cachedEntry.result));
    }

    const result = await generateNewSimulation(notes);

    // Save to Cache
    try {
        await prisma.simulationCache.create({ data: { prompt: cacheKey, result: JSON.stringify(result) } });
    } catch(e) {}

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

// Direct variable extraction - bypasses LLM for fast real-time updates
function extractVariablesDirectly(notes: string): Record<string, number> {
  const vars: Record<string, number> = {};
  
  // Match various formats: Wind_Speed = 50, wind speed = 50, etc.
  const patterns = [
    { key: 'wind_speed', regex: /[Ww]ind[_\s]*[Ss]peed\s*=\s*(\d+)/g },
    { key: 'blade_count', regex: /[Bb]lade[_\s]*[Cc]ount\s*=\s*(\d+)/g },
    { key: 'number_of_blades', regex: /[Nn]umber\s*of\s*[Bb]lades\s*=\s*(\d+)/g },
    { key: 'payload', regex: /[Pp]ayload\s*=\s*(\d+(?:\.\d+)?)\s*(?:kg|lbs?|pounds?)?/g },
    { key: 'arm_length', regex: /[Aa]rm[_\s]*[Ll]ength\s*=\s*(\d+)/g },
  ];
  
  for (const { key, regex } of patterns) {
    let match;
    while ((match = regex.exec(notes)) !== null) {
      vars[key] = Number(match[1]);
    }
  }
  
  // Normalize blade_count
  if (vars.number_of_blades && !vars.blade_count) {
    vars.blade_count = vars.number_of_blades;
  }
  
  return vars;
}

// Detect topic from notes - prioritizes specific topics first
function detectTopicFromNotes(notes: string): string {
  const lower = notes.toLowerCase();
  
  // Check for Scene_Mode explicitly set (user override)
  const sceneModeMatch = notes.match(/Scene_Mode\s*=\s*(\d+)/i);
  if (sceneModeMatch) {
    const mode = parseInt(sceneModeMatch[1]);
    if (mode === 0) return 'wind_turbine';
    if (mode === 1) return 'robot_arm';
    if (mode >= 2) {
      // Detect specific generic topics
      if (lower.includes('motherboard') || lower.includes('cpu') || lower.includes('ram') || lower.includes('chipset')) return 'motherboard';
      if (lower.includes('circuit') || lower.includes('resistor') || lower.includes('capacitor') || lower.includes('led')) return 'circuit';
      if (lower.includes('gear') || lower.includes('mechanical') || lower.includes('lever') || lower.includes('pulley')) return 'mechanical';
      if (lower.includes('solar') || lower.includes('photovoltaic') || lower.includes('pv panel')) return 'solar';
      if (lower.includes('engine') || lower.includes('piston') || lower.includes('combustion')) return 'engine';
      return 'generic';
    }
  }
  
  // Priority 1: Check for specific generic topics FIRST (before wind/blade checks)
  if (lower.includes('motherboard') || lower.includes('cpu socket') || lower.includes('ram slot') || lower.includes('chipset') || lower.includes('pcie')) {
    return 'motherboard';
  }
  if (lower.includes('circuit board') || lower.includes('resistor') || lower.includes('capacitor') || lower.includes('transistor')) {
    return 'circuit';
  }
  if (lower.includes('gear ratio') || lower.includes('mechanical advantage') || lower.includes('lever') || lower.includes('fulcrum')) {
    return 'mechanical';
  }
  if (lower.includes('solar panel') || lower.includes('photovoltaic') || lower.includes('solar cell')) {
    return 'solar';
  }
  if (lower.includes('engine') || lower.includes('piston') || lower.includes('crankshaft') || lower.includes('combustion')) {
    return 'engine';
  }
  
  // Priority 2: Standard simulations
  if (lower.includes('turbine') || (lower.includes('wind') && lower.includes('blade')) || lower.includes('windmill')) {
    return 'wind_turbine';
  }
  if (lower.includes('robot') || lower.includes('robotic arm') || lower.includes('gripper') || lower.includes('actuator')) {
    return 'robot_arm';
  }
  
  // Default: If we have wind_speed or blade_count vars, assume wind turbine
  return 'generic';
}

// Direct physics simulation - no LLM, instant feedback
function runPhysicsSimulation(vars: Record<string, number>, notes: string): any {
  const topic = detectTopicFromNotes(notes);
  
  let status = 'OPTIMAL';
  let message = 'System operating within normal parameters.';
  let recommendation = '';
  let aiExplanation = '';
  
  if (topic === 'wind_turbine') {
    const wind = vars.wind_speed || 0;
    const blades = vars.blade_count || 3;
    // Physics: Higher blade count = more drag = lower speed limit
    const limit = Math.max(20, 75 - (blades * 5));
    
    if (wind > limit) {
      status = 'CRITICAL_FAILURE';
      message = `Drag from ${blades} blades exceeded limit (${limit} m/s) at wind speed ${wind} m/s.`;
      recommendation = `Reduce wind_speed to ${(limit - 5).toFixed(0)} m/s OR reduce blade_count to 3.`;
      aiExplanation = `At ${wind} m/s with ${blades} blades, the aerodynamic drag exceeds structural limits. The centrifugal force combined with wind shear creates oscillations that will tear the blades apart. According to Betz's Law and structural engineering limits, ${blades} blades can only safely operate up to ${limit} m/s.`;
    }
  } else if (topic === 'robot_arm') {
    const payload = vars.payload || 0;
    const length = vars.arm_length || 1;
    const torque = payload * length * 9.8;
    
    if (torque > 600) {
      status = 'CRITICAL_FAILURE';
      message = `Torque (${torque.toFixed(0)} Nm) exceeded gear limit of 600 Nm.`;
      recommendation = `Reduce payload to ${(600 / (length * 9.8)).toFixed(1)} kg.`;
      aiExplanation = `The torque of ${torque.toFixed(0)} Nm at the shoulder joint exceeds the gear train's rated capacity of 600 Nm. This will cause gear teeth to shear and the arm to fail catastrophically.`;
    }
  }
  // Generic topics (motherboard, circuit, etc.) don't have physics failure modes yet
  // They just render as visualizations
  
  return {
    extraction: { topic, vars },
    simulation: { status, message, aiExplanation, recommendation }
  };
}