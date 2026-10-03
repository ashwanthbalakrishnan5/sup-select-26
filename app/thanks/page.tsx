// Shown to a startup after an interview: the report goes to the investor, not the founder.
import { CheckCircle2 } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Interview complete' };

export default function ThanksPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto mt-16 w-full max-w-lg px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-8 text-center">
            <CheckCircle2 className="size-12" />
            <h1 className="text-3xl font-bold">Interview complete</h1>
            <p>Thanks for pitching. The fund has received your interview and will be in touch about next steps.</p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
