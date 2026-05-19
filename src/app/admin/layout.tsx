'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, History, ShieldCheck, Ticket, Store, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ventasNav = [
  { href: '/admin/events', label: 'Eventos', icon: Ticket },
  { href: '/admin/sellers', label: 'Vendedores', icon: Store },
  { href: '/admin/sales', label: 'Ventas', icon: BarChart3 },
];

const impresionNav = [
  { href: '/print', label: 'Generador QR / PDF', icon: Printer },
  { href: '/history', label: 'Historial impresión', icon: History },
  { href: '/validate', label: 'Validador', icon: ShieldCheck },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <section className="space-y-6">
      <section className="rounded-xl border-2 border-primary/50 bg-primary/10 p-4 space-y-3">
        <p className="text-base font-bold text-primary">
          Tickets para imprimir (QR, PDF, ZIP)
        </p>
        <p className="text-sm text-muted-foreground">
          Esta sección es independiente de la venta digital con Mercado Pago.
        </p>
        <nav className="flex flex-wrap gap-2">
          {impresionNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border hover:bg-muted'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
        <span className="text-xs font-semibold text-muted-foreground self-center mr-2">
          VENTA DIGITAL
        </span>
        {ventasNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
              pathname.startsWith(item.href)
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </section>
  );
}
