'use client';

import { Badge } from '@/components/ui/badge';

export function LandingHeroVisual() {
  return (
    <div className="landing-fade-up-delay relative mx-auto aspect-[4/5] w-full max-w-md lg:max-w-none">
      <div
        className="absolute inset-[8%] rounded-2xl border border-border bg-card shadow-lg shadow-primary/10"
        aria-hidden
      />
      <div className="landing-float absolute inset-[14%] flex flex-col justify-between overflow-hidden rounded-xl border border-primary/25 bg-card p-6 font-body sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Entrada
            </p>
            <p className="mt-1 font-headline text-2xl tracking-wide sm:text-3xl">Noche en vivo</p>
          </div>
          <Badge variant="default" className="font-body font-medium">
            Válida
          </Badge>
        </div>

        <div className="my-6 flex flex-1 items-center justify-center">
          <div
            className="grid h-36 w-36 grid-cols-5 gap-1 rounded-lg bg-foreground p-3 sm:h-40 sm:w-40"
            aria-hidden
          >
            {Array.from({ length: 25 }).map((_, i) => (
              <span
                key={i}
                className="rounded-[1px] bg-background"
                style={{
                  opacity: [0, 4, 6, 8, 12, 16, 18, 20, 24].includes(i)
                    ? 0.2
                    : 0.75 + ((i * 17) % 20) / 100,
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-dashed border-border pt-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Código
            </p>
            <p className="mt-0.5 font-mono text-sm tracking-wide">TKT-9F2A</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Puerta
            </p>
            <p className="mt-0.5 text-sm font-medium text-primary">Escaneo listo</p>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute -right-4 top-1/4 h-24 w-24 rounded-full bg-primary/20 blur-2xl sm:h-32 sm:w-32"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-6 bottom-1/4 h-20 w-20 rounded-full bg-accent/15 blur-2xl"
        aria-hidden
      />
    </div>
  );
}
