import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!process.env.GOOGLE_API_KEY) {
        return NextResponse.json({ error: 'Gemini Key Missing' }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Analyze this lecture transcript.
      Identify 3 key timestamps where a physics concept is introduced.
      Return valid JSON array. Format:
      [
        { "time": "00:45", "concept": "Blade Aerodynamics", "variable_focus": "blade_pitch" },
        { "time": "02:30", "concept": "Material Stress", "variable_focus": "tensile_strength" }
      ]
      Transcript: ${transcript.substring(0, 3000)}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // Clean markdown
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    return NextResponse.json(JSON.parse(text));

  } catch (error) {
    console.error('Gemini Error:', error);
    return NextResponse.json({ error: 'Gemini failed' }, { status: 500 });
  }
}