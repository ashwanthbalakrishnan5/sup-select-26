// GET /logout — clear the demo session and go home.
import { NextResponse } from 'next/server';
import { signOut } from '@/lib/server/auth';

export async function GET(request: Request) {
  await signOut();
  return NextResponse.redirect(new URL('/', request.url));
}
