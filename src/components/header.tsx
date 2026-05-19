'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Ticket,
  Loader2,
  User,
  LogOut,
  ShieldCheck,
  Store,
  BarChart3,
  Printer,
  History,
  Music,
} from 'lucide-react';
import { Button } from './ui/button';
import { useUser, useAuth } from '@/firebase';
import { useEffect, useState } from 'react';
import { getSessionUser, type SessionUser } from '@/lib/actions/auth';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/lib/models';
import { cn } from '@/lib/utils';

const printNavItems = [
  { href: '/print', label: 'Generador', icon: Printer },
  { href: '/history', label: 'Historial', icon: History },
  { href: '/validate', label: 'Validador', icon: ShieldCheck },
  { href: '/youtube-mp3', label: 'MP3 YouTube', icon: Music, openInNewTab: true },
];

const navByRole: Record<UserRole, { href: string; label: string; icon: typeof Ticket }[]> = {
  admin: [
    { href: '/admin/events', label: 'Eventos', icon: Ticket },
    { href: '/admin/sellers', label: 'Vendedores', icon: Store },
    { href: '/admin/sales', label: 'Ventas', icon: BarChart3 },
  ],
  seller: [{ href: '/seller', label: 'Mis ventas', icon: Store }],
  gate: [{ href: '/admin/events', label: 'Eventos', icon: ShieldCheck }],
};

function NavRow({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { href: string; label: string; icon: typeof Ticket; openInNewTab?: boolean }[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold uppercase tracking-wide text-primary shrink-0 w-20">
        {label}
      </span>
      <ul className="flex flex-wrap items-center gap-1">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/print' && pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                target={item.openInNewTab ? '_blank' : undefined}
                rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 hover:bg-muted text-foreground'
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Header() {
  const pathname = usePathname();
  const { user, loading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [session, setSession] = useState<SessionUser | null>(null);

  const isPublicCheckout =
    pathname.startsWith('/checkout') || pathname.startsWith('/ticket');

  useEffect(() => {
    async function loadSession() {
      if (!user) {
        setSession(null);
        return;
      }
      const token = await user.getIdToken();
      const res = await getSessionUser(token);
      setSession(res.success ? res.data : null);
    }
    loadSession();
  }, [user]);

  if (isPublicCheckout) return null;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: 'Sesión cerrada' });
      router.push('/login');
    } catch {
      toast({ variant: 'destructive', title: 'Error al cerrar sesión' });
    }
  };

  const platformNav = session ? navByRole[session.role] ?? [] : [];

  return (
    <header className="bg-card/95 backdrop-blur-sm border-b sticky top-0 z-50">
      <section className="container mx-auto px-4 py-3 space-y-3">
        {/* Fila 1: marca + usuario */}
        <section className="flex justify-between items-center gap-4">
          <Link href={session ? platformNav[0]?.href ?? '/print' : '/login'} className="flex items-center gap-3">
            <section className="bg-primary/10 p-2 rounded-lg">
              <Ticket className="w-6 h-6 text-primary" />
            </section>
            <span className="text-xl font-headline font-bold">Ticketron</span>
          </Link>

          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : user ? (
            <section className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground max-w-[180px] truncate">
                {session?.email ?? user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </section>
          ) : pathname !== '/login' ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/login">
                <User className="mr-2 h-4 w-4" />
                Ingresar
              </Link>
            </Button>
          ) : null}
        </section>

        {/* Fila 2: navegación — Impresión SIEMPRE visible si hay sesión Firebase */}
        {user && (
          <section className="flex flex-col gap-2 pt-2 border-t border-border/60">
            {session && platformNav.length > 0 && (
              <NavRow label="Ventas" items={platformNav} pathname={pathname} />
            )}
            <NavRow label="Impresión" items={[...printNavItems]} pathname={pathname} />
          </section>
        )}
      </section>
    </header>
  );
}
