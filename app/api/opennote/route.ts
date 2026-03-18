import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { noteContent } = await req.json();

    // If you don't have a real endpoint yet, use this Mock Response
    // so your frontend doesn't break during the demo
    if (!process.env.OPENNOTE_API_KEY) {
        return NextResponse.json({ 
            message: "Mock Opennote Response", 
            context: "Sustainability Analysis" 
        });
    }

    // Real Call logic (Uncomment when key works)
    /*
    const response = await fetch('https://api.opennote.me/v1/context', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENNOTE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: noteContent })
    });
    const data = await response.json();
    return NextResponse.json(data);
    */

    return NextResponse.json({ success: true, mock: true });

  } catch (error) {
    return NextResponse.json({ error: 'Opennote API failed' }, { status: 500 });
  }
}