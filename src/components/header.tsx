'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Ticket,
  Loader2,
  User,
  LogOut,
  Store,
  QrCode,
  DoorOpen,
  Shield,
  Settings2,
} from 'lucide-react';
import { Button } from './ui/button';
import { useUser, useAuth } from '@/firebase';
import { useEffect, useState } from 'react';
import { getSessionUser, type SessionUser } from '@/lib/actions/auth';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/lib/models';
import { cn } from '@/lib/utils';

const validatorNavItemsByRole: Partial<
  Record<UserRole, { href: string; label: string; icon: typeof Ticket; emphasized?: boolean }[]>
> = {
  superadmin: [
    { href: '/gate', label: 'Validador digital', icon: QrCode, emphasized: true },
    { href: '/access/scan', label: 'Escáner visitantes', icon: DoorOpen, emphasized: true },
  ],
  producer: [
    { href: '/gate', label: 'Validador digital', icon: QrCode, emphasized: true },
  ],
  dirigente: [
    { href: '/access/scan', label: 'Escáner visitantes', icon: DoorOpen, emphasized: true },
  ],
  gate: [
    { href: '/gate', label: 'Validador digital', icon: QrCode, emphasized: true },
    { href: '/access/scan', label: 'Escáner visitantes', icon: DoorOpen, emphasized: true },
  ],
};

const navByRole: Record<UserRole, { href: string; label: string; icon: typeof Ticket }[]> = {
  superadmin: [
    { href: '/superadmin', label: 'Super Admin', icon: Shield },
    { href: '/admin/events', label: 'Mis eventos', icon: Ticket },
    { href: '/admin/access', label: 'Visitantes', icon: DoorOpen },
    { href: '/admin/sellers', label: 'Vendedores', icon: Store },
    { href: '/admin/settings', label: 'Ajustes', icon: Settings2 },
  ],
  producer: [
    { href: '/admin/events', label: 'Eventos', icon: Ticket },
    { href: '/admin/sellers', label: 'Vendedores', icon: Store },
    { href: '/admin/settings', label: 'Ajustes', icon: Settings2 },
  ],
  dirigente: [{ href: '/admin/access', label: 'Control de visitantes', icon: DoorOpen }],
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
  if (href === '/access/scan' && pathname.startsWith('/access/scan')) return true;
  if (href !== '/gate' && href !== '/access/scan' && pathname.startsWith(href)) return true;
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
    pathname.startsWith('/a/') ||
    pathname.startsWith('/access/invite') ||
    pathname.startsWith('/access/pass');

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
  const validatorNavItems = session ? validatorNavItemsByRole[session.role] ?? [] : [];
  const showPlatformNav =
    !!session && session.role !== 'buyer' && platformNav.length > 0;
  const showValidators = validatorNavItems.length > 0;
  const showGateShortcut =
    !!session &&
    (session.role === 'producer' ||
      session.role === 'superadmin' ||
      session.role === 'gate' ||
      session.role === 'dirigente');
  const showNavSection = showValidators || showPlatformNav;
  const showProducerCta =
    !session &&
    !user &&
    pathname !== '/register' &&
    pathname !== '/login';

  const homeHref =
    session?.role === 'superadmin'
      ? '/superadmin'
      : session?.role === 'producer'
        ? '/admin/events'
        : session?.role === 'dirigente'
          ? '/admin/access'
        : session?.role === 'gate'
          ? '/gate'
          : session?.role === 'seller'
            ? '/seller'
            : session?.role === 'buyer'
              ? '/my-tickets'
              : user
                ? '/gate'
                : '/';

  return (
    <header className="bg-card/95 backdrop-blur-sm border-b sticky top-0 z-50">
      <section className="container mx-auto px-4 py-3 space-y-3">
        <section className="flex justify-between items-center gap-4">
          <Link href={homeHref} className="flex items-center gap-3">
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
                variant={
                  session?.role === 'dirigente'
                    ? pathname.startsWith('/access/scan')
                      ? 'default'
                      : 'outline'
                    : pathname.startsWith('/gate')
                      ? 'default'
                      : 'outline'
                }
                className="shrink-0"
              >
                <Link
                  href={session?.role === 'dirigente' ? '/access/scan' : '/gate'}
                  aria-label={
                    session?.role === 'dirigente' ? 'Escáner visitantes' : 'Validador en puerta'
                  }
                  title={
                    session?.role === 'dirigente' ? 'Escáner visitantes' : 'Validador digital'
                  }
                >
                  <DoorOpen className="h-4 w-4" />
                  <span className="sr-only">
                    {session?.role === 'dirigente' ? 'Escáner visitantes' : 'Validador digital'}
                  </span>
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
            ) : (
              <>
                {showProducerCta && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/register">Ser productor</Link>
                  </Button>
                )}
                {pathname !== '/login' && (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/login">
                      <User className="mr-2 h-4 w-4" />
                      Ingresar
                    </Link>
                  </Button>
                )}
              </>
            )}
          </section>
        </section>

        {user && showNavSection && (
          <section className="flex flex-col gap-3 pt-3 border-t border-border/60">
            {showValidators && (
              <NavRow label="Validadores" items={validatorNavItems} pathname={pathname} />
            )}
            {showPlatformNav && (
              <NavRow
                label={
                  session!.role === 'producer' || session!.role === 'superadmin'
                    ? 'Venta digital'
                    : session!.role === 'dirigente'
                      ? 'Control de club'
                      : 'Panel'
                }
                items={platformNav}
                pathname={pathname}
              />
            )}
          </section>
        )}
      </section>
    </header>
  );
}
