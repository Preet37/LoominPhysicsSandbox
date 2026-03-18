import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { notes, count } = await req.json();
    const numCards = count || 5;

    const systemPrompt = `
      You are an automated Study Assistant.
      Create exactly ${numCards} flashcards based on the user's physics notes.
      Output format must be valid JSON:
      { "cards": [{ "front": "Question?", "back": "Answer" }] }
    `;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: notes }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const data = JSON.parse(completion.choices[0]?.message?.content || '{ "cards": [] }');
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ cards: [{ front: "Error", back: "Could not generate cards." }] });
  }
}