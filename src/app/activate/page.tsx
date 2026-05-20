'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '@/firebase';
import {
  completeBuyerActivation,
  getActivationPreview,
} from '@/lib/actions/buyers';
import { getSessionUser } from '@/lib/actions/auth';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

function ActivateContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') ?? '';
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<
    'valid' | 'expired' | 'used' | 'invalid' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!code) {
      setTokenStatus('invalid');
      setLoading(false);
      return;
    }

    async function load() {
      const res = await getActivationPreview(code);
      if (!res.success) {
        setTokenStatus('invalid');
        setLoading(false);
        return;
      }
      setTokenStatus(res.data.status);
      if (res.data.status === 'valid') {
        setEmail(res.data.email);
        if (res.data.displayName) setDisplayName(res.data.displayName);
      } else if (res.data.status === 'used') {
        setEmail(res.data.email);
      }
      setLoading(false);
    }

    load();
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setSubmitting(true);
    try {
      const res = await completeBuyerActivation({
        code,
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, res.data.email, password);
      const token = await cred.user.getIdToken();
      const session = await getSessionUser(token);

      if (!session.success || session.data.role !== 'buyer') {
        await auth.signOut();
        setError(
          'Cuenta activada pero no se pudo iniciar sesión. Probá ingresar desde el login.'
        );
        return;
      }

      toast({
        title: 'Cuenta lista',
        description: 'Ya podés ver todas tus entradas.',
      });
      router.push('/my-tickets');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Error al activar la cuenta');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (tokenStatus === 'invalid' || !code) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Link inválido</CardTitle>
          <CardDescription>
            El enlace no es válido. Pedí uno nuevo desde el login en Mis entradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Ir al login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (tokenStatus === 'expired') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Link expirado</CardTitle>
          <CardDescription>
            Este enlace venció (válido 7 días). Podés pedir uno nuevo con tu email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Pedir nuevo link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (tokenStatus === 'used') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Ya activaste tu cuenta</CardTitle>
          <CardDescription>
            {email ? (
              <>
                Iniciá sesión con <strong>{email}</strong> y tu contraseña.
              </>
            ) : (
              'Iniciá sesión con tu email y contraseña.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Crear tu cuenta</CardTitle>
        <CardDescription>
          Elegí una contraseña para acceder a todas tus entradas en Ticketron.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">Nombre (opcional)</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Activar cuenta
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
