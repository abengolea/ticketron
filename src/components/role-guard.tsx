'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIdToken } from '@/hooks/use-id-token';
import { getSessionUser, type SessionUser } from '@/lib/actions/auth';
import { Loader2 } from 'lucide-react';
import type { UserRole } from '@/lib/models';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

export function RoleGuard({ children, allowedRoles, redirectTo = '/login' }: RoleGuardProps) {
  const { getIdToken, user } = useIdToken();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      if (!user) {
        router.push(redirectTo);
        return;
      }
      const token = await getIdToken();
      if (!token) {
        router.push(redirectTo);
        return;
      }
      const result = await getSessionUser(token);
      if (!result.success) {
        router.push(redirectTo);
        return;
      }
      if (!allowedRoles.includes(result.data.role)) {
        router.push('/login');
        return;
      }
      setSession(result.data);
      setLoading(false);
    }
    check();
  }, [user, getIdToken, router, allowedRoles, redirectTo]);

  if (loading || !session) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
