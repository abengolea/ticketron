'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Ticket,
  Loader2,
  User,
  LogOut,
  Store,
  Printer,
  History,
  Music,
  QrCode,
  FileText,
  DoorOpen,
} from 'lucide-react';
import { Button } from './ui/button';
import { useUser, useAuth } from '@/firebase';
import { useEffect, useState } from 'react';
import { getSessionUser, type SessionUser } from '@/lib/actions/auth';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/lib/models';
import { cn } from '@/lib/utils';

const validatorNavItems = [
  { href: '/gate', label: 'Validador digital', icon: QrCode, emphasized: true },
  { href: '/validate', label: 'Validador PDF', icon: FileText, emphasized: false },
];

const printNavItems = [
  { href: '/print', label: 'Generador', icon: Printer },
  { href: '/history', label: 'Historial', icon: History },
  { href: '/youtube-mp3', label: 'MP3 YouTube', icon: Music, openInNewTab: true },
];

const navByRole: Record<UserRole, { href: string; label: string; icon: typeof Ticket }[]> = {
  admin: [
    { href: '/admin/events', label: 'Eventos', icon: Ticket },
    { href: '/admin/sellers', label: 'Vendedores', icon: Store },
  ],
  seller: [{ href: '/seller', label: 'Mis ventas', icon: Store }],
  gate: [],
  buyer: [{ href: '/my-tickets', label: 'Mis entradas', icon: Ticket }],
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof Ticket;
  openInNewTab?: boolean;
  emphasized?: boolean;
};

function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/gate' && pathname.startsWith('/gate')) return true;
  if (href === '/validate' && pathname.startsWith('/validate')) return true;
  if (href !== '/print' && href !== '/gate' && href !== '/validate' && pathname.startsWith(href)) {
    return true;
  }
  return false;
}

function NavRow({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="flex items-center gap-2 flex-wrap min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-primary shrink-0 min-w-[5.5rem]">
        {label}
      </span>
      <ul className="flex flex-wrap items-center gap-1.5 min-w-0">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                target={item.openInNewTab ? '_blank' : undefined}
                rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : item.emphasized
                      ? 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
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
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/ticket') ||
    pathname.startsWith('/activate') ||
    pathname.startsWith('/a/');

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
  const showValidators =
    !!user &&
    (!session || session.role === 'admin' || session.role === 'gate');
  const showGateShortcut = showValidators;
  const showPrintNav = session?.role === 'admin' || (!session && !!user);

  return (
    <header className="bg-card/95 backdrop-blur-sm border-b sticky top-0 z-50">
      <section className="container mx-auto px-4 py-3 space-y-3">
        {/* Fila 1: marca + usuario */}
        <section className="flex justify-between items-center gap-4">
          <Link
            href={
              session?.role === 'admin'
                ? '/admin/events'
                : session?.role === 'gate'
                  ? '/gate'
                  : session?.role === 'seller'
                    ? '/seller'
                    : session?.role === 'buyer'
                      ? '/my-tickets'
                      : user
                        ? '/gate'
                        : '/login'
            }
            className="flex items-center gap-3"
          >
            <section className="bg-primary/10 p-2 rounded-lg">
              <Ticket className="w-6 h-6 text-primary" />
            </section>
            <span className="text-xl font-headline font-bold">Ticketron</span>
          </Link>

          <section className="flex items-center gap-2">
            {showGateShortcut && (
              <Button
                asChild
                size="sm"
                variant={pathname.startsWith('/gate') ? 'default' : 'outline'}
                className="shrink-0"
              >
                <Link href="/gate" aria-label="Validador en puerta" title="Validador digital">
                  <DoorOpen className="h-4 w-4" />
                  <span className="sr-only">Validador digital</span>
                </Link>
              </Button>
            )}
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : user ? (
              <>
                <span className="text-xs text-muted-foreground max-w-[180px] truncate hidden sm:inline">
                  {session?.email ?? user.email}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Cerrar sesión">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : pathname !== '/login' ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/login">
                  <User className="mr-2 h-4 w-4" />
                  Ingresar
                </Link>
              </Button>
            ) : null}
          </section>
        </section>

        {user && (
          <section className="flex flex-col gap-3 pt-3 border-t border-border/60">
            {showValidators && (
              <NavRow label="Validadores" items={validatorNavItems} pathname={pathname} />
            )}
            <section className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3">
              {session && platformNav.length > 0 && (
                <NavRow
                  label={
                    session.role === 'admin'
                      ? 'Venta digital'
                      : session.role === 'buyer'
                        ? 'Mis entradas'
                        : 'Panel'
                  }
                  items={platformNav}
                  pathname={pathname}
                />
              )}
              {session && platformNav.length > 0 && (
                <div className="hidden lg:block w-px h-8 bg-border shrink-0" aria-hidden />
              )}
              {showPrintNav && (
                <NavRow label="Impresión" items={[...printNavItems]} pathname={pathname} />
              )}
            </section>
          </section>
        )}
      </section>
    </header>
  );
}
