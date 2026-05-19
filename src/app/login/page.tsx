'use client';

import { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { getSessionUser } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { UserRole } from '@/lib/models';

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48" {...props}>
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.223 0-9.641-3.356-11.303-8H24v-8H12.389C12.138 21.35 12 22.659 12 24c0 1.053.045 2.083.13 3.091l-6.635 5.143C4.403 29.623 4 26.925 4 24c0-3.518.92-6.794 2.545-9.631l6.635 5.143C12.389 21.917 12 22.659 12 24z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.012 35.24 44 30.026 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);

function roleHome(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin/events';
    case 'seller':
      return '/seller';
    case 'gate':
      return '/admin/events';
    default:
      return '/login';
  }
}

export default function LoginPage() {
  const auth = useAuth();
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function redirectIfLoggedIn() {
      if (!userLoading && user) {
        const token = await user.getIdToken();
        const session = await getSessionUser(token);
        if (session.success) {
          router.push(roleHome(session.data.role));
        }
      }
    }
    redirectIfLoggedIn();
  }, [user, userLoading, router]);

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdToken();
      const session = await getSessionUser(token);

      if (!session.success) {
        await auth.signOut();
        setError(
          session.error ??
            'Tu cuenta no está habilitada. Contactá al administrador.'
        );
        return;
      }

      toast({ title: 'Bienvenido', description: `Hola, ${session.data.displayName}` });
      router.push(roleHome(session.data.role));
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      let errorMessage = err.message ?? 'Error de autenticación';
      if (err.code === 'auth/unauthorized-domain') {
        errorMessage =
          'Dominio no autorizado. Agregalo en Firebase Authentication → Dominios autorizados.';
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (userLoading || user) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Ticketron</CardTitle>
          <CardDescription>
            Venta digital de entradas y generador de tickets para imprimir
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Acceso denegado</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="mr-2 h-4 w-4" />
            )}
            Iniciar sesión con Google
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Solo usuarios habilitados por el administrador pueden acceder.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

