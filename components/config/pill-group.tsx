'use client';
// Segmented "pill" radio group built from neobrutalism Buttons (selected = main, others = neutral).
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PillOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string; // native tooltip, e.g. why it's disabled
}

export function PillGroup<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: PillOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            size="sm"
            variant={selected ? 'default' : 'neutral'}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn('min-w-14', selected && 'translate-x-boxShadowX translate-y-boxShadowY shadow-none')}
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
