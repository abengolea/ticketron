# Ticketron — Configuración

## Estructura de carpetas

```
src/
├── app/
│   ├── admin/events|sellers|sales/   # Panel admin
│   ├── seller/                       # Panel vendedor
│   ├── checkout/[token]/             # Checkout público
│   ├── ticket/[ticketCode]/          # Entrada digital
│   ├── gate/[eventId]/               # Control de puerta
│   ├── api/mercadopago/webhook/      # Webhook MP
│   └── api/cron/expire-links/        # Expirar links
├── lib/
│   ├── types/                        # Modelos TypeScript
│   ├── validations/                  # Esquemas Zod
│   ├── actions/                      # Server actions
│   ├── services/                     # Lógica de negocio
│   ├── firebase-admin.ts
│   ├── mercadopago.ts
│   ├── qr.ts
│   └── tokens.ts
└── components/
    ├── digital-ticket.tsx
    ├── gate-scanner.tsx
    └── role-guard.tsx
```

## Variables de entorno

Copiar `.env.example` → `.env.local` y completar:

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | URL pública (ej. `https://tu-dominio.com`) |
| `NEXT_PUBLIC_FIREBASE_*` | Credenciales Firebase client |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | JSON service account (una línea) |
| `MERCADO_PAGO_ACCESS_TOKEN` | Token MP (sandbox o producción) |
| `TICKET_SIGNING_SECRET` | Secreto HMAC para QR (32+ chars) |
| `CRON_SECRET` | Bearer para `/api/cron/expire-links` |
| `PAYMENT_LINK_EXPIRY_MINUTES` | Default: 30 |
| `RESEND_API_KEY` | API key de [Resend](https://resend.com) para emails al comprador |
| `EMAIL_FROM` | Remitente verificado (ej. `Ticketron <entradas@tudominio.com>`) |

## Email al comprador

Tras un pago aprobado (webhook Mercado Pago), se envía automáticamente un correo con el link a `/ticket?token=...`.

En el checkout el comprador ingresa el email **dos veces** (confirmación). No se crea cuenta de usuario.

1. Crear cuenta en Resend y verificar dominio (o usar dominio de prueba en desarrollo).
2. Completar `RESEND_API_KEY` y `EMAIL_FROM` en `.env.local` / App Hosting.

## Primer administrador

Crear manualmente en Firestore Console:

```
Colección: users
Documento ID: {uid del usuario Google}

{
  "email": "admin@ejemplo.com",
  "displayName": "Admin",
  "role": "admin",
  "active": true,
  "createdAt": <Timestamp>,
  "updatedAt": <Timestamp>
}
```

El `uid` se obtiene tras el primer login con Google (Firebase Auth → Users).

## Mercado Pago

1. Crear aplicación en [developers.mercadopago.com](https://www.mercadopago.com.ar/developers)
2. Copiar **Access Token** a `MERCADO_PAGO_ACCESS_TOKEN`
3. Configurar webhook: `{NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`
4. Eventos: `payment`

## Cron de expiración (paso 4)

### Desarrollo local (automático)

Con el servidor de desarrollo y expiración cada 5 min:

```bash
npm run dev:full
```

O en otra terminal mientras corre `npm run dev`:

```bash
npm run cron:expire:watch
```

Una sola ejecución manual:

```bash
npm run cron:expire
```

### Producción — Firebase App Hosting (Google Cloud Scheduler)

1. Asegurate de tener `CRON_SECRET` en las variables de App Hosting.
2. Desplegá la app con la URL pública final.
3. En PowerShell (con [gcloud CLI](https://cloud.google.com/sdk/docs/install)):

```powershell
$env:NEXT_PUBLIC_APP_URL = "https://TU-URL-DE-APP"
$env:CRON_SECRET = "tu-secreto-igual-que-en-hosting"
$env:GCP_PROJECT = "tu-project-id"
.\scripts\setup-cloud-scheduler.ps1
```

Probar el job:

```powershell
gcloud scheduler jobs run ticketron-expire-payment-links --location=us-central1
```

### Alternativa — GitHub Actions

Si el repo está en GitHub, el workflow `.github/workflows/cron-expire-links.yml` corre cada 5 min.

Configurar secrets en el repo:

| Secret | Valor |
|--------|--------|
| `APP_URL` | URL pública (ej. `https://tu-app.web.app`) |
| `CRON_SECRET` | Mismo que en hosting |

### Endpoint HTTP

```
POST o GET {NEXT_PUBLIC_APP_URL}/api/cron/expire-links
Authorization: Bearer {CRON_SECRET}
```

## Despliegue de reglas e índices

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Flujo de prueba

1. Admin crea evento en `/admin/events`
2. Admin crea usuario vendedor en `users` y asigna cupo en `/admin/sellers`
3. Vendedor genera link en `/seller/event/{id}`
4. Comprador paga en `/checkout/{token}`
5. Webhook emite ticket → `/ticket?token=...`
6. Puerta valida en `/gate/{eventId}`
