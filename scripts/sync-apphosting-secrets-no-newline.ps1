# Re-sube a Secret Manager los secrets de servidor que suelen quedar con \n final
# al usar `gcloud secrets versions add` sin cuidado. Lee valores desde .env.local.
#
# Requisitos: gcloud CLI instalado y autenticado (gcloud auth login)
#
# Uso (desde la raíz del repo):
#   .\scripts\sync-apphosting-secrets-no-newline.ps1
#
# Solo simular:
#   .\scripts\sync-apphosting-secrets-no-newline.ps1 -DryRun
#
# Otro proyecto:
#   .\scripts\sync-apphosting-secrets-no-newline.ps1 -ProjectId mi-proyecto

param(
    [string]$ProjectId = $env:GCP_PROJECT,
    [string]$EnvFile = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) {
    $EnvFile = Join-Path $RepoRoot ".env.local"
}

# Secrets de servidor (no incluye NEXT_PUBLIC_* — esos ya están OK)
$SecretNames = @(
    "FIREBASE_SERVICE_ACCOUNT_KEY",
    "MERCADO_PAGO_ACCESS_TOKEN",
    "TICKET_SIGNING_SECRET",
    "PAYMENT_LINK_EXPIRY_MINUTES",
    "RESEND_API_KEY",
    "EMAIL_FROM"
)

function Read-DotEnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "No se encontró $Path. Copiá .env.example a .env.local y completá los valores."
    }
    $vars = @{}
    Get-Content $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.TrimEnd()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1)
        $vars[$key] = $val
    }
    return $vars
}

function Set-SecretNoNewline {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Project
    )
    if ($null -eq $Value -or $Value.Length -eq 0) {
        throw "Valor vacío para $Name"
    }
    $path = [System.IO.Path]::GetTempFileName()
    try {
        # Sin trailing newline — evita fallos en Bearer tokens y APIs
        [System.IO.File]::WriteAllText($path, $Value, [System.Text.UTF8Encoding]::new($false))
        if ($DryRun) {
            Write-Host "[DryRun] gcloud secrets versions add $Name --project=$Project --data-file=***" -ForegroundColor Yellow
            return
        }
        gcloud secrets versions add $Name --project=$Project --data-file=$path | Out-Host
        Write-Host "OK  $Name" -ForegroundColor Green
    }
    finally {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
    }
}

$envVars = Read-DotEnvFile -Path $EnvFile
if (-not $ProjectId) {
    $ProjectId = $envVars["NEXT_PUBLIC_FIREBASE_PROJECT_ID"]
}
if (-not $ProjectId) {
    Write-Host "Definí -ProjectId o GCP_PROJECT o NEXT_PUBLIC_FIREBASE_PROJECT_ID en .env.local" -ForegroundColor Red
    exit 1
}

Write-Host "Proyecto:  $ProjectId"
Write-Host "Env file:  $EnvFile"
if ($DryRun) { Write-Host "Modo:      DryRun (no se sube nada)" -ForegroundColor Yellow }
Write-Host ""

$missing = @($SecretNames | Where-Object { -not $envVars.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($envVars[$_]) })
if ($missing.Count -gt 0) {
    Write-Host "Faltan o están vacíos en .env.local:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

foreach ($name in $SecretNames) {
  $value = $envVars[$name].TrimEnd("`r", "`n", " ")
  Set-SecretNoNewline -Name $name -Value $value -Project $ProjectId
}

Write-Host ""
if ($DryRun) {
    Write-Host "DryRun terminado. Ejecutá sin -DryRun para crear nuevas versiones." -ForegroundColor Yellow
}
else {
    Write-Host "Listo. Nuevas versiones creadas en Secret Manager." -ForegroundColor Green
    Write-Host "Para que App Hosting las use, redeploy:" -ForegroundColor Cyan
    Write-Host "  firebase deploy --only apphosting:studio -P $ProjectId"
}
