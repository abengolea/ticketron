# Deploy a producción (App Hosting + GitHub)

Ticketron usa **Firebase App Hosting** (backend `studio`, proyecto `studio-9893505602-68edc`).

## Problema: deploy sin commit visible

Si desplegás con:

```bash
firebase deploy --only apphosting
```

Firebase sube un **ZIP local** (sin enlace a Git). En la consola, en **Rollouts**, no aparece el commit ni el autor — solo un build anónimo.

## Solución: conectar GitHub (una vez)

1. Abrí [App Hosting en Firebase](https://console.firebase.google.com/project/studio-9893505602-68edc/apphosting).
2. Entrá al backend **studio** → **Settings** → pestaña **Deployment**.
3. **Connect repository** → instalá la app de Firebase en GitHub si te lo pide.
4. Elegí el repo: `abengolea/ticketron`.
5. Configurá:
   - **Live branch:** `main`
   - **Root directory:** `.` (raíz del repo)
   - **Automatic rollouts:** activado
6. Guardá.

Comprobación: en `firebase apphosting:backends:list`, la columna **Repository** debe mostrar el repo (hoy está vacía = no conectado).

## Flujo de producción (después de conectar)

```text
git commit → git push origin main → rollout automático en Firebase (con commit visible)
```

**No uses** `firebase deploy --only apphosting` para producción.

### Deploy manual de un commit concreto (CLI)

```bash
firebase apphosting:rollouts:create studio --git-commit <SHA> --force
```

O el último commit de `main`:

```bash
firebase apphosting:rollouts:create studio --git-branch main --force
```

En la consola, cada rollout muestra el **commit**, autor, enlace a Cloud Build y (en GitHub) el check de App Hosting.

## URL de producción

https://studio--studio-9893505602-68edc.us-central1.hosted.app

## Secretos y variables

Siguen en **Secret Manager** / `apphosting.yaml` (no van en el repo). Ver `docs/SETUP.md`.

## CI opcional (GitHub Actions)

El workflow `.github/workflows/deploy-production.yml` dispara un rollout desde el **SHA del push** a `main`. Requiere:

- GitHub conectado al backend (pasos de arriba).
- Secret `FIREBASE_SERVICE_ACCOUNT` en el repo (JSON de cuenta de servicio con permisos de App Hosting).

Si tenés **rollouts automáticos** activos en Firebase, podés desactivar el workflow o dejar solo `workflow_dispatch` para no duplicar builds.
