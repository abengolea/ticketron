import Link from 'next/link';
import { getPublicPlatformFees } from '@/lib/actions/producers';
import { formatArs } from '@/lib/payment-link-utils';
import { LandingHeroVisual } from '@/components/landing-hero-visual';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Escala tipográfica unificada (landing). */
const type = {
  brand: 'font-headline text-5xl leading-none tracking-wide sm:text-6xl md:text-7xl',
  display: 'font-headline text-3xl leading-tight tracking-wide sm:text-4xl',
  lead: 'font-headline text-2xl leading-snug tracking-wide sm:text-3xl',
  title: 'font-body text-lg font-semibold tracking-tight text-foreground',
  body: 'font-body text-base leading-relaxed text-muted-foreground',
  caption: 'font-body text-sm leading-relaxed text-muted-foreground',
  amount: 'font-body text-3xl font-semibold tabular-nums tracking-tight text-primary',
  overline: 'font-body text-xs font-semibold uppercase tracking-[0.18em] text-primary',
  label: 'font-body text-sm font-medium text-muted-foreground',
} as const;

export default async function HomePage() {
  const feesRes = await getPublicPlatformFees();
  const fees = feesRes.success
    ? feesRes.data
    : { pricePerEvent: 0, pricePerTicket: 0 };
  const hasFees = fees.pricePerEvent > 0 || fees.pricePerTicket > 0;

  return (
    <div className="bg-background text-foreground font-body">
      <section className="relative min-h-[calc(100svh-4.5rem)] overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 80% 55% at 70% 15%, hsl(var(--primary) / 0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 10% 85%, hsl(var(--accent) / 0.08), transparent 50%)',
          }}
        />

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-6xl flex-col justify-center px-4 py-12 sm:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            <div className="landing-fade-up max-w-xl">
              <p className={type.brand}>Ticketron</p>
              <h1 className={cn(type.lead, 'mt-5 text-foreground')}>
                Emisión digital de entradas. Sin comisión sobre el precio.
              </h1>
              <p className={cn(type.body, 'mt-4 max-w-md')}>
                Cobrá el 100% de cada entrada en tu Mercado Pago. Nosotros solo cobramos un
                fee fijo por entrada emitida.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="font-body font-semibold">
                  <Link href="/register">Quiero ser productor</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-body font-medium">
                  <Link href="/login">Ya tengo cuenta</Link>
                </Button>
              </div>
            </div>

            <LandingHeroVisual />
          </div>
        </div>
      </section>

      <section className="border-b border-border px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className={type.display}>De la venta al acceso</h2>
          <p className={cn(type.body, 'mx-auto mt-4 max-w-lg')}>
            Emitís la entrada digital, cobrás vos el precio completo y escaneás en puerta.
          </p>
          <ol className="mt-12 grid gap-8 text-left sm:grid-cols-3 sm:gap-6">
            {[
              {
                n: '01',
                title: 'Te registrás',
                body: 'Enviás los datos de tu productora. El equipo de Ticketron revisa y habilita tu cuenta.',
              },
              {
                n: '02',
                title: 'Creás el evento',
                body: 'Definís cupo, precio y vendedores. Los compradores pagan por link con Mercado Pago.',
              },
              {
                n: '03',
                title: 'Validás en puerta',
                body: 'QR único por entrada. Sabés quién entró y cuánto vendiste en tiempo real.',
              },
            ].map((step) => (
              <li key={step.n} className="space-y-2">
                <p className={type.overline}>{step.n}</p>
                <h3 className={type.title}>{step.title}</h3>
                <p className={type.caption}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className={type.display}>Sin el 10% ni el 15%</h2>
          <p className={cn(type.body, 'mt-4')}>
            Otras plataformas se quedan con un porcentaje del valor de la entrada. Ticketron
            no: es un servicio de emisión digital. El precio lo definís vos y lo cobrás
            entero en tu Mercado Pago. Solo pagás un fee fijo por cada entrada emitida
            {fees.pricePerEvent > 0 ? ' (y, si aplica, por evento)' : ''}.
          </p>
          {hasFees ? (
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {fees.pricePerEvent > 0 && (
                <div className="rounded-lg border border-border bg-card px-6 py-8 text-left sm:text-center">
                  <p className={type.label}>Fee fijo por evento</p>
                  <p className={cn(type.amount, 'mt-2')}>{formatArs(fees.pricePerEvent)}</p>
                  <p className={cn(type.caption, 'mt-3')}>Monto fijo, no un %</p>
                </div>
              )}
              <div
                className={cn(
                  'rounded-lg border border-primary/30 bg-primary/5 px-6 py-8 text-left sm:text-center',
                  fees.pricePerEvent > 0 ? '' : 'sm:col-span-2 sm:mx-auto sm:w-full sm:max-w-md'
                )}
              >
                <p className={type.label}>Fee fijo por entrada emitida</p>
                <p className={cn(type.amount, 'mt-2')}>{formatArs(fees.pricePerTicket)}</p>
                <p className={cn(type.caption, 'mt-3')}>
                  Da igual si la entrada vale $5.000 o $50.000
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-10 rounded-lg border border-primary/30 bg-primary/5 px-6 py-8">
              <p className={cn(type.title, 'text-base sm:text-lg')}>
                Fee fijo por entrada emitida — nunca un porcentaje del precio.
              </p>
              <p className={cn(type.caption, 'mt-3')}>
                El monto se confirma al aprobar tu cuenta.
              </p>
            </div>
          )}
          <Button asChild size="lg" className="mt-10 font-body font-semibold">
            <Link href="/register">Empezar registro</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 text-center">
        <p className={type.caption}>Ticketron · Operado por NOTIFICAS SRL</p>
        <p className="mt-2">
          <Link href="/bases-y-condiciones" className={cn(type.caption, 'hover:text-primary')}>
            Bases y Condiciones
          </Link>
        </p>
      </footer>
    </div>
  );
}
