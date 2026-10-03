// Top header for neobrutalism pages. Shows the demo user's side of the product and a sign-out link.
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { DemoUser } from '@/lib/server/auth';

const NAV = {
  investor: [
    { href: '/investor', label: 'Panels' },
    { href: '/investor/reports', label: 'Reports' },
  ],
  founder: [{ href: '/founder', label: 'Practice' }],
} as const;

export function AppHeader({ user }: { user?: DemoUser | null }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between px-6">
      <Link href="/" className="font-heading text-2xl font-bold tracking-tight">
        🦈 PitchRoom
      </Link>
      <nav className="flex items-center gap-2">
        {user ? (
          <>
            {NAV[user.role].map((n) => (
              <Button key={n.href} variant="neutral" size="sm" nativeButton={false} render={<Link href={n.href} />}>
                {n.label}
              </Button>
            ))}
            <span className="hidden text-sm sm:inline">
              {user.name} · {user.role === 'investor' ? 'Investor' : 'Founder'}
            </span>
            <Button variant="neutral" size="sm" nativeButton={false} render={<a href="/logout" />}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Button variant="neutral" size="sm" nativeButton={false} render={<Link href="/pricing" />}>
              Pricing
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
