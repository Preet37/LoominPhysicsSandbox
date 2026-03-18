import { NextResponse } from 'next/server';

// Mock leaderboard data for demo purposes
const mockLeaderboard = [
  { id: '1', topic: 'Wind Turbine Optimization', score: 98, config: {} },
  { id: '2', topic: 'Robot Arm Calibration', score: 95, config: {} },
  { id: '3', topic: 'Solar Panel Efficiency', score: 92, config: {} },
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // In production, you would save to database
    const savedSim = {
      id: Math.random().toString(36).substring(7),
      topic: body.topic,
      score: body.score,
      config: body.config
    };
    return NextResponse.json(savedSim);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Return mock leaderboard for demo
    return NextResponse.json(mockLeaderboard);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
