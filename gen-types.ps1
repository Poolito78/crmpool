# Régénère src/integrations/supabase/types.ts depuis la base Supabase.
# Usage :
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_xxx"   # ton vrai token (une fois par session)
#   .\gen-types.ps1
#
# Le token n'est PAS stocké dans ce fichier : il est lu depuis la variable d'environnement.

$ErrorActionPreference = "Stop"
$projectRef = "qkjxcfosutclnahvxflf"
$outFile    = "src\integrations\supabase\types.ts"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
    Write-Host "ERREUR : variable SUPABASE_ACCESS_TOKEN absente." -ForegroundColor Red
    Write-Host 'Lance d''abord :  $env:SUPABASE_ACCESS_TOKEN = "sbp_ton_token"' -ForegroundColor Yellow
    exit 1
}

Write-Host "Generation des types depuis le projet $projectRef ..." -ForegroundColor Cyan
# --yes : sans lui, npx demande « Ok to proceed? (y) » pour installer le
# paquet ; la question est capturée dans $types (donc invisible, le script
# semble figé) puis écrite en tête de types.ts, qui ne compile plus.
$types = npx --yes supabase gen types typescript --project-id $projectRef

if ($LASTEXITCODE -ne 0 -or -not $types) {
    Write-Host "Echec de la generation (voir le message ci-dessus)." -ForegroundColor Red
    exit 1
}

$types | Out-File -Encoding utf8 $outFile
$lines = (Get-Content $outFile | Measure-Object -Line).Lines
Write-Host "OK : $outFile reecrit ($lines lignes)." -ForegroundColor Green
