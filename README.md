# ticketron

Plataforma de venta y validación de entradas digitales.

## Deploy a producción

Los deploys deben ir **desde GitHub** para que en Firebase se vea cada commit (autor, SHA, enlace al cambio).

1. Conectá el repo en [App Hosting → studio → Settings → Deployment](https://console.firebase.google.com/project/studio-9893505602-68edc/apphosting) (instrucciones completas en [docs/DEPLOY.md](docs/DEPLOY.md)).
2. Hacé `git push origin main` — no uses `firebase deploy --only apphosting`.

Setup local: [docs/SETUP.md](docs/SETUP.md).
