import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Topic detection with simulation modes
function detectTopic(text: string): { topic: string; mode: number; params: string } {
  const lower = text.toLowerCase();
  
  // Wind Turbine (Mode 0)
  if (lower.includes('turbine') || lower.includes('wind power') || lower.includes('windmill') || 
      (lower.includes('blade') && lower.includes('wind')) || lower.includes('renewable energy')) {
    return {
      topic: 'wind_turbine',
      mode: 0,
      params: `Scene_Mode = 0\nWind_Speed = 25\nBlade_Count = 3\nBlade_Pitch = 12`
    };
  }
  
  // Robot Arm (Mode 1)
  if (lower.includes('robot') || lower.includes('robotic arm') || lower.includes('gripper') || 
      lower.includes('servo') || lower.includes('actuator') || lower.includes('kinematics')) {
    return {
      topic: 'robot_arm',
      mode: 1,
      params: `Scene_Mode = 1\nArm_Shoulder_Pitch = 30\nArm_Elbow_Pitch = 45\nGripper_Open = 60`
    };
  }
  
  // Motherboard/Computer (Mode 2)
  if (lower.includes('motherboard') || lower.includes('cpu') || lower.includes('ram') || 
      lower.includes('chipset') || lower.includes('computer component') || lower.includes('pc build')) {
    return {
      topic: 'motherboard',
      mode: 2,
      params: `Scene_Mode = 2\nCPU_Size = 1\nRAM_Slots = 4`
    };
  }
  
  // Circuit/Electronics (Mode 2)
  if (lower.includes('circuit') || lower.includes('resistor') || lower.includes('capacitor') || 
      lower.includes('led') || lower.includes('transistor') || lower.includes('electronics')) {
    return {
      topic: 'circuit',
      mode: 2,
      params: `Scene_Mode = 2\nVoltage = 5\nResistance = 100`
    };
  }
  
  // Mechanical Systems (Mode 2)
  if (lower.includes('gear') || lower.includes('lever') || lower.includes('pulley') || 
      lower.includes('mechanical advantage') || lower.includes('fulcrum')) {
    return {
      topic: 'mechanical',
      mode: 2,
      params: `Scene_Mode = 2\nGear_Ratio = 3\nLever_Length = 2`
    };
  }
  
  // Solar Panel (Mode 2)
  if (lower.includes('solar') || lower.includes('photovoltaic') || lower.includes('pv panel')) {
    return {
      topic: 'solar',
      mode: 2,
      params: `Scene_Mode = 2\nPanel_Count = 6\nAngle = 30`
    };
  }
  
  // Engine (Mode 2)
  if (lower.includes('engine') || lower.includes('piston') || lower.includes('cylinder') || 
      lower.includes('combustion') || lower.includes('crankshaft')) {
    return {
      topic: 'engine',
      mode: 2,
      params: `Scene_Mode = 2\nRPM = 3000\nCylinders = 4`
    };
  }
  
  // Default to generic visualization
  return {
    topic: 'generic',
    mode: 2,
    params: `Scene_Mode = 2`
  };
}

export async function POST(req: Request) {
  const { prompt, context } = await req.json();

  const detected = detectTopic(prompt);
  
  const systemPrompt = `
You are Loomin, an expert AI tutor and simulation engineer.
The user is learning through interactive 3D simulations. When they ask about a topic:

1. Generate clear, educational notes in Markdown format
2. Explain the concepts, principles, formulas, and real-world applications
3. ALWAYS end your response with simulation parameters that control the 3D visualization

IMPORTANT: You MUST include simulation parameters at the END of your response in this exact format:
---
### Simulation Parameters
Variable_Name = value

The available simulations are:
- Wind Turbine (Scene_Mode = 0): Wind_Speed, Blade_Count, Blade_Pitch, Yaw
- Robot Arm (Scene_Mode = 1): Arm_Base_Yaw, Arm_Shoulder_Pitch, Arm_Elbow_Pitch, Arm_Wrist_Pitch, Gripper_Open, Finger_Curl
- Generic Visualizations (Scene_Mode = 2): For motherboards, circuits, mechanical systems, solar panels, engines, and other topics

For the detected topic "${detected.topic}", use Scene_Mode = ${detected.mode}.

Always include realistic starting values that demonstrate the concept being explained.
Be educational and explain WHY each parameter matters.
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `User Request: ${prompt}\n\nExisting Notes Context: ${context}` }
      ],
      model: 'llama-3.3-70b-versatile',
    });

    let result = completion.choices[0]?.message?.content || '';
    
    // Ensure simulation parameters are included
    if (!result.includes('Scene_Mode')) {
      result += `\n\n---\n### Simulation Parameters\n${detected.params}\n`;
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Ask API error:', error);
    return NextResponse.json({ 
      result: `## Error\nFailed to generate response. Please try again.\n\n---\n### Simulation Parameters\nScene_Mode = -1\n` 
    }, { status: 500 });
  }
}