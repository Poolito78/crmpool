# Deploy d'une Supabase Edge Function
# Usage :
#   .\deploy-function.ps1                  → déploie la fonction par défaut (devis-assistant)
#   .\deploy-function.ps1 extract-client   → déploie extract-client
#   .\deploy-function.ps1 -All             → déploie toutes les fonctions de supabase/functions
param(
    [string]$FunctionName = "devis-assistant",
    [switch]$All
)

$PROJECT_REF = "qkjxcfosutclnahvxflf"

Write-Host ""
Write-Host "=== Deploy Supabase Edge Function ===" -ForegroundColor Cyan
Write-Host ""

# Liste des fonctions à déployer
if ($All) {
    $functionsDir = Join-Path $PSScriptRoot "supabase\functions"
    $targets = Get-ChildItem -Path $functionsDir -Directory | Select-Object -ExpandProperty Name
    if (-not $targets) {
        Write-Host "Aucune fonction trouvee dans supabase\functions." -ForegroundColor Red
        exit 1
    }
    Write-Host ("Fonctions a deployer : {0}" -f ($targets -join ", ")) -ForegroundColor Yellow
} else {
    $targets = @($FunctionName)
    Write-Host ("Fonction a deployer : {0}" -f $FunctionName) -ForegroundColor Yellow
}

# Token : réutilise SUPABASE_ACCESS_TOKEN si déjà présent, sinon le demande
if (-not $env:SUPABASE_ACCESS_TOKEN) {
    Write-Host ""
    Write-Host "Ouverture de la page token Supabase..." -ForegroundColor Yellow
    Start-Process "https://supabase.com/dashboard/account/tokens"
    Write-Host ""
    $token = Read-Host "Collez votre access token Supabase ici"
    if (-not $token) {
        Write-Host "Token vide, annulation." -ForegroundColor Red
        exit 1
    }
    $env:SUPABASE_ACCESS_TOKEN = $token
} else {
    Write-Host "Token deja present dans l'environnement (SUPABASE_ACCESS_TOKEN)." -ForegroundColor DarkGray
}

$failed = @()
foreach ($fn in $targets) {
    Write-Host ""
    Write-Host ("Deploiement de {0} ..." -f $fn) -ForegroundColor Yellow
    npx supabase functions deploy $fn --project-ref $PROJECT_REF
    if ($LASTEXITCODE -eq 0) {
        Write-Host ("OK - {0} deployee." -f $fn) -ForegroundColor Green
    } else {
        Write-Host ("ERREUR lors du deploiement de {0}." -f $fn) -ForegroundColor Red
        $failed += $fn
    }
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host "Termine : toutes les fonctions ont ete deployees." -ForegroundColor Green
} else {
    Write-Host ("Termine avec erreurs sur : {0}" -f ($failed -join ", ")) -ForegroundColor Red
    exit 1
}
