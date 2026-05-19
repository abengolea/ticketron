# Crea un job en Google Cloud Scheduler para expirar payment links cada 5 minutos.
# Requisitos: gcloud CLI instalado y autenticado (gcloud auth login)
#
# Uso:
#   $env:NEXT_PUBLIC_APP_URL = "https://tu-app.web.app"
#   $env:CRON_SECRET = "tu-secreto"
#   .\scripts\setup-cloud-scheduler.ps1
#
# Opcional:
#   $env:GCP_PROJECT = "studio-9893505602-68edc"
#   $env:GCP_REGION = "us-central1"

$ErrorActionPreference = "Stop"

$ProjectId = if ($env:GCP_PROJECT) { $env:GCP_PROJECT } else { $env:NEXT_PUBLIC_FIREBASE_PROJECT_ID }
$Region = if ($env:GCP_REGION) { $env:GCP_REGION } else { "us-central1" }
$AppUrl = $env:NEXT_PUBLIC_APP_URL
$CronSecret = $env:CRON_SECRET
$JobName = "ticketron-expire-payment-links"

if (-not $ProjectId) {
    Write-Host "Definí GCP_PROJECT o NEXT_PUBLIC_FIREBASE_PROJECT_ID" -ForegroundColor Red
    exit 1
}
if (-not $AppUrl) {
    Write-Host "Definí NEXT_PUBLIC_APP_URL (URL pública de la app desplegada)" -ForegroundColor Red
    exit 1
}
if (-not $CronSecret) {
    Write-Host "Definí CRON_SECRET (mismo valor que en .env.local / App Hosting)" -ForegroundColor Red
    exit 1
}

$TargetUrl = "$($AppUrl.TrimEnd('/'))/api/cron/expire-links"
$Schedule = "*/5 * * * *"

Write-Host "Proyecto: $ProjectId"
Write-Host "Región:   $Region"
Write-Host "URL:      $TargetUrl"
Write-Host "Schedule: $Schedule (cada 5 minutos)"
Write-Host ""

gcloud config set project $ProjectId

# Habilitar API si hace falta
gcloud services enable cloudscheduler.googleapis.com --quiet 2>$null

$existing = gcloud scheduler jobs describe $JobName --location=$Region 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Actualizando job existente: $JobName"
    gcloud scheduler jobs update http $JobName `
        --location=$Region `
        --schedule=$Schedule `
        --uri=$TargetUrl `
        --http-method=POST `
        --headers="Authorization=Bearer $CronSecret" `
        --attempt-deadline=120s `
        --time-zone="America/Argentina/Buenos_Aires"
} else {
    Write-Host "Creando job: $JobName"
    gcloud scheduler jobs create http $JobName `
        --location=$Region `
        --schedule=$Schedule `
        --uri=$TargetUrl `
        --http-method=POST `
        --headers="Authorization=Bearer $CronSecret" `
        --attempt-deadline=120s `
        --time-zone="America/Argentina/Buenos_Aires"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al configurar Cloud Scheduler" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Listo. Probar manualmente:" -ForegroundColor Green
Write-Host "  gcloud scheduler jobs run $JobName --location=$Region"
