'use client';

import { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { getSessionUser } from '@/lib/actions/auth';
import { requestBuyerAccess } from '@/lib/actions/buyers';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail } from 'lucide-react';
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
      return '/gate';
    case 'buyer':
      return '/my-tickets';
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
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerSignInEmail, setBuyerSignInEmail] = useState('');
  const [buyerPassword, setBuyerPassword] = useState('');
  const [buyerMessage, setBuyerMessage] = useState<string | null>(null);

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
          session.error ?? 'Tu cuenta no está habilitada. Contactá al administrador.'
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

  async function handleRequestBuyerAccess(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setBuyerMessage(null);
    setError(null);
    try {
      const res = await requestBuyerAccess({ email: buyerEmail });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBuyerMessage(res.data.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBuyerSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setBuyerMessage(null);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        buyerSignInEmail.trim(),
        buyerPassword
      );
      const token = await cred.user.getIdToken();
      const session = await getSessionUser(token);

      if (!session.success) {
        await auth.signOut();
        setError(session.error ?? 'No se pudo iniciar sesión.');
        return;
      }

      if (session.data.role !== 'buyer') {
        await auth.signOut();
        setError('Esta cuenta no es de comprador. Usá la pestaña Equipo para ingresar.');
        return;
      }

      toast({ title: 'Bienvenido', description: 'Tus entradas te esperan.' });
      router.push('/my-tickets');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Email o contraseña incorrectos.');
      } else {
        setError(err.message ?? 'Error al iniciar sesión');
      }
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
          <CardDescription>Venta digital de entradas y acceso a tus tickets</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="buyer" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="buyer">Mis entradas</TabsTrigger>
              <TabsTrigger value="team">Equipo</TabsTrigger>
            </TabsList>

            <TabsContent value="buyer" className="space-y-6">
              {buyerMessage && (
                <Alert>
                  <AlertTitle>Te enviamos un email</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{buyerMessage}</p>
                    <p className="text-sm">
                      Abrí el correo (revisá spam si no lo ves) y tocá el botón del mensaje para
                      elegir tu contraseña. Después volvé acá e ingresá con ese email y la
                      contraseña que creaste.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <section
                aria-labelledby="buyer-first-time-heading"
                className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4"
              >
                <div className="space-y-1">
                  <h2
                    id="buyer-first-time-heading"
                    className="text-base font-semibold leading-tight"
                  >
                    Compraste entradas y es tu primera vez
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Todavía no podés ingresar con contraseña hasta que la crees. Seguí estos pasos:
                  </p>
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Escribí abajo el mismo email que usaste al comprar.</li>
                  <li>
                    Tocá el botón azul <strong className="text-foreground">«Enviarme el email»</strong>{' '}
                    (no el de ingresar, que está más abajo).
                  </li>
                  <li>
                    Abrí el correo que te llega y tocá el botón del mensaje para elegir tu
                    contraseña.
                  </li>
                </ol>
                <form onSubmit={handleRequestBuyerAccess} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="buyerEmail">Email con el que compraste</Label>
                    <Input
                      id="buyerEmail"
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="comprador@ejemplo.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Enviarme el email para crear mi cuenta
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Te llega un correo con un botón; al tocarlo elegís tu contraseña y después
                    podés volver acá a ingresar.
                  </p>
                </form>
              </section>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Ya tengo cuenta y contraseña
                  </span>
                </div>
              </div>

              <form onSubmit={handleBuyerSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="buyerSignInEmail">Email</Label>
                  <Input
                    id="buyerSignInEmail"
                    type="email"
                    value={buyerSignInEmail}
                    onChange={(e) => setBuyerSignInEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerPassword">Contraseña</Label>
                  <Input
                    id="buyerPassword"
                    type="password"
                    value={buyerPassword}
                    onChange={(e) => setBuyerPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" variant="outline" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Ingresar a mis entradas
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Solo si ya activaste tu cuenta y elegiste contraseña.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="team" className="space-y-6">
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
