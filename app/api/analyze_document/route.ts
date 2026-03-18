import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    let fileName: string;
    let fileType: string;
    
    const contentType = req.headers.get('content-type') || '';
    
    // Handle both JSON (metadata only) and FormData requests
    if (contentType.includes('application/json')) {
      const json = await req.json();
      fileName = json.fileName;
      fileType = json.fileType;
    } else {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      fileType = formData.get('fileType') as string;
      fileName = formData.get('fileName') as string;

      if (!file && !fileName) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
    }

    // Analyze based on file metadata and generate intelligent content
    // In production, you'd use OCR for PDFs, speech-to-text for videos, etc.
    
    let detectedTopic = "general";
    
    // Detect topic from filename - more comprehensive detection
    const lowerName = fileName.toLowerCase();
    
    // Wind turbine keywords
    const turbineKeywords = ['turbine', 'wind', 'energy', 'renewable', 'blade', 'rotor', 'aerodynamic', 'power', 'generator', 'rpm', 'rotation'];
    // Robot arm keywords  
    const robotKeywords = ['robot', 'arm', 'gripper', 'servo', 'joint', 'motor', 'actuator', 'kinematics', 'mechanical', 'automation', 'manipulator'];
    // Electronics keywords
    const electronicsKeywords = ['circuit', 'electronic', 'voltage', 'current', 'resistor', 'capacitor', 'transistor', 'led', 'arduino'];
    
    if (turbineKeywords.some(kw => lowerName.includes(kw))) {
      detectedTopic = "wind_turbine";
    } else if (robotKeywords.some(kw => lowerName.includes(kw))) {
      detectedTopic = "robot_arm";
    } else if (electronicsKeywords.some(kw => lowerName.includes(kw))) {
      detectedTopic = "electronics";
    } else if (fileType === 'video') {
      // Default videos to wind turbine for demo purposes if no specific topic detected
      // In production, you'd use AI vision/audio analysis here
      detectedTopic = "wind_turbine";
    }

    // Generate an intelligent analysis based on file type and detected topic
    const analysisPrompt = `
You are analyzing a ${fileType} file named "${fileName}".
The detected topic is: ${detectedTopic === 'wind_turbine' ? 'Wind Turbine / Renewable Energy' : detectedTopic === 'robot_arm' ? 'Robotics / Mechanical Arm' : detectedTopic === 'electronics' ? 'Electronics / Circuits' : 'General Engineering'}.

Generate a detailed analysis summary that:
1. Describes what this ${fileType} likely covers based on the topic
2. Lists 3-5 key concepts that would be covered
3. Suggests simulation parameters appropriate for this topic
4. Provides a brief learning objective

Format your response as a structured note that can be used for study.
Keep it educational and informative.
`;

    let summary = "";
    let keyPoints: string[] = [];
    let suggestedVars: Record<string, number> = {};

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { 
            role: 'system', 
            content: 'You are an educational content analyzer. Generate helpful, accurate summaries for learning materials. Be concise but thorough.' 
          },
          { role: 'user', content: analysisPrompt }
        ],
        model: 'llama-3.3-70b-versatile',
      });
      
      summary = completion.choices[0]?.message?.content || "Analysis complete.";
    } catch (err) {
      console.error("Groq Error during analysis", err);
      summary = `Document analyzed: ${fileName}`;
    }

    // Generate topic-specific simulation parameters
    if (detectedTopic === 'wind_turbine') {
      suggestedVars = {
        Wind_Speed: 35,
        Blade_Count: 3,
        Blade_Pitch: 12,
        Scene_Mode: 0
      };
      keyPoints = [
        "Aerodynamic principles of blade design",
        "Power generation efficiency curves", 
        "Wind speed vs RPM relationships",
        "Structural stress analysis",
        "Yaw control systems"
      ];
    } else if (detectedTopic === 'robot_arm') {
      suggestedVars = {
        Arm_Base_Yaw: 0,
        Arm_Shoulder_Pitch: 30,
        Arm_Elbow_Pitch: 45,
        Arm_Wrist_Pitch: -20,
        Gripper_Open: 50,
        Scene_Mode: 1
      };
      keyPoints = [
        "Inverse kinematics calculations",
        "Servo motor control systems",
        "Payload capacity limits",
        "Joint torque requirements",
        "Gripper force feedback"
      ];
    } else {
      suggestedVars = { Scene_Mode: -1 };
      keyPoints = [
        "Core concepts and principles",
        "Practical applications",
        "Design considerations",
        "Safety parameters"
      ];
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileType,
      detectedTopic,
      summary,
      keyPoints,
      suggestedVars,
      generatedNotes: formatNotesFromAnalysis(fileName, fileType, detectedTopic, summary, keyPoints, suggestedVars)
    });

  } catch (error) {
    console.error("Document analysis error:", error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

function formatNotesFromAnalysis(
  fileName: string, 
  fileType: string, 
  topic: string, 
  summary: string, 
  keyPoints: string[], 
  vars: Record<string, number>
): string {
  const topicTitle = topic === 'wind_turbine' ? '🌬️ Wind Turbine Lecture Notes' 
                   : topic === 'robot_arm' ? '🤖 Robotic Arm Lecture Notes'
                   : topic === 'electronics' ? '⚡ Electronics Lecture Notes'
                   : '📚 Lecture Notes';

  // Generate topic-specific educational content
  let educationalContent = '';
  
  if (topic === 'wind_turbine') {
    educationalContent = `
### How Wind Turbines Work

Wind turbines convert kinetic energy from wind into electrical power through electromagnetic induction.

**Key Physics Principles:**
- **Betz's Law**: Maximum theoretical efficiency is 59.3% (Betz limit)
- **Tip Speed Ratio (TSR)**: λ = ωR/V (blade tip speed / wind speed)
- **Power Output**: P = ½ρAV³Cp where Cp is the power coefficient

**Blade Design Factors:**
- Blade count affects torque vs. speed (fewer blades = higher RPM)
- Pitch angle controls power capture and prevents overspeed
- Aerodynamic profile similar to aircraft wings (lift-based)

**Operational Limits:**
- Cut-in speed: ~3-4 m/s (minimum to generate power)
- Rated speed: ~12-15 m/s (optimal power generation)
- Cut-out speed: ~25 m/s (shutdown to prevent damage)
`;
  } else if (topic === 'robot_arm') {
    educationalContent = `
### How Robotic Arms Work

Robotic arms use a series of joints (degrees of freedom) to position an end effector in 3D space.

**Key Physics Principles:**
- **Forward Kinematics**: Joint angles → End effector position
- **Inverse Kinematics**: Desired position → Required joint angles
- **Torque**: τ = r × F (determines payload capacity)

**Joint Types:**
- Revolute (rotational) - most common
- Prismatic (linear/sliding)
- Spherical (ball-and-socket)

**Design Considerations:**
- Workspace envelope (reachable area)
- Payload capacity decreases with arm extension
- Accuracy vs. repeatability
- Speed vs. precision tradeoffs
`;
  }

  let notes = `## ${topicTitle}
**Source:** ${fileName} (${fileType})
**Generated:** ${new Date().toLocaleDateString()}

---

### Overview
${summary}
${educationalContent}
---

### Key Concepts to Master
${keyPoints.map((p, i) => `${i + 1}. **${p}**`).join('\n')}

---

### Interactive Simulation
Adjust the parameters below to see real-time changes in the 3D simulation.
Try different values to understand how each variable affects the system!

`;

  // Add variable assignments with comments
  Object.entries(vars).forEach(([key, value]) => {
    let comment = '';
    if (key === 'Wind_Speed') comment = '// m/s - try values between 5-50';
    else if (key === 'Blade_Count') comment = '// number of blades (1-10)';
    else if (key === 'Blade_Pitch') comment = '// degrees (0-45)';
    else if (key === 'Arm_Shoulder_Pitch') comment = '// degrees (-70 to 70)';
    else if (key === 'Gripper_Open') comment = '// percentage (0-100)';
    
    notes += `${key} = ${value} ${comment}\n`;
  });

  notes += `
---

💡 **Tip:** Modify the values above and watch the simulation update in real-time!
`;

  return notes;
}
