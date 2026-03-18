import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// GET: Fetch notes sorted by newest first
export async function GET() {
  const notes = await prisma.note.findMany({ 
    orderBy: { updatedAt: 'desc' } 
  });
  return NextResponse.json(notes);
}

// POST: Create or Update Note
export async function POST(req: Request) {
  const { id, title, content } = await req.json();
  
  if (id) {
    // Update existing
    const note = await prisma.note.update({
      where: { id },
      data: { 
          content, 
          title: title || "Untitled Note",
          updatedAt: new Date() // Force update timestamp
      }
    });
    return NextResponse.json(note);
  } else {
    // Create new
    const note = await prisma.note.create({
      data: { 
        title: title || "New Physics Note", 
        content: content || "" 
      }
    });
    return NextResponse.json(note);
  }
}

// DELETE: Remove a note
export async function DELETE(req: Request) {
    const { id } = await req.json();
    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ success: true });
}