// Fake login: any username/password (even empty) signs in to the shared demo workspace on the chosen side.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn, type Role } from '@/lib/server/auth';

export const metadata = { title: 'Sign in' };

async function login(formData: FormData) {
  'use server';
  const role: Role = formData.get('role') === 'investor' ? 'investor' : 'founder';
  await signIn(String(formData.get('username') ?? ''), role);
  redirect(role === 'investor' ? '/investor' : '/founder');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const role: Role = (await searchParams).role === 'investor' ? 'investor' : 'founder';
  const other: Role = role === 'investor' ? 'founder' : 'investor';
  return (
    <>
      <AppHeader />
      <main className="mx-auto mt-10 w-full max-w-md px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{role === 'investor' ? 'Investor sign in' : 'Founder sign in'}</CardTitle>
            <p className="text-sm">
              {role === 'investor'
                ? 'Build AI interview panels and review every startup that takes them.'
                : 'Practice your pitch with an AI investor panel.'}
            </p>
          </CardHeader>
          <CardContent>
            <form action={login} className="flex flex-col gap-4">
              <input type="hidden" name="role" value={role} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" autoComplete="username" placeholder="anything works" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="anything works" />
              </div>
              <Button type="submit" size="lg">
                Sign in →
              </Button>
              <p className="text-xs">Demo mode: any username and password (even empty) signs you in.</p>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm">
          {other === 'investor' ? 'Are you an investor?' : 'Are you a founder?'}{' '}
          <Link href={`/login?role=${other}`} className="font-bold underline">
            Sign in as {other}
          </Link>
        </p>
      </main>
    </>
  );
}
