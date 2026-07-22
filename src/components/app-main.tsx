'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === '/';

  return (
    <main
      className={cn(
        'flex-grow',
        fullBleed ? '' : 'container mx-auto px-4 py-8'
      )}
    >
      {children}
    </main>
  );
}
