import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { Toaster } from '@/components/ui/toast';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: { default: 'PitchRoom', template: '%s · PitchRoom' },
  description: 'Pitch to an AI investor panel. Get grilled. Get a verdict.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦈</text></svg>",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
