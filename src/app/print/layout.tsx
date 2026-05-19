'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Printer, History, ShieldCheck } from 'lucide-react';
import PrivateRoute from '@/components/private-route';

const printNav = [
  { href: '/print', label: 'Generador', icon: Printer, exact: true },
  { href: '/history', label: 'Historial', icon: History, exact: false },
  { href: '/validate', label: 'Validador', icon: ShieldCheck, exact: false },
];

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PrivateRoute>
      <section className="space-y-6">
        <section className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium text-muted-foreground mb-3">
            Impresión — tickets con QR para imprimir
          </p>
          <nav>
            <ul className="flex flex-wrap gap-2">
              {printNav.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted'
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </section>
        {children}
      </section>
    </PrivateRoute>
  );
}
