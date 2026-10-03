// Fake login (hackathon demo): any username/password — even empty — signs in to ONE shared demo workspace.
// The cookie only remembers the display name and which side of the product (investor / founder) you entered.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type Role = 'investor' | 'founder';
export interface DemoUser {
  name: string;
  role: Role;
}

const COOKIE = 'pr_user';

export async function currentUser(): Promise<DemoUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as DemoUser;
    return u.role === 'investor' || u.role === 'founder' ? u : null;
  } catch {
    return null;
  }
}

/** Server components/actions: send visitors without the right role to the login page. */
export async function requireUser(role: Role): Promise<DemoUser> {
  const u = await currentUser();
  if (!u || u.role !== role) redirect(`/login?role=${role}`);
  return u;
}

export async function signIn(name: string, role: Role) {
  (await cookies()).set(COOKIE, JSON.stringify({ name: name.trim() || (role === 'investor' ? 'Demo VC' : 'Demo Founder'), role }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
}
