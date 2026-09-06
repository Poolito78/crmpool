@echo off
setlocal

set REPO=C:\Users\f.mouhot\OneDrive - ISOSIGN\Documents\GitHub\crmpool
cd /d "%REPO%"

if not exist "supabase\functions\odoo-prix\CONTRAT-CADRE.md" (
    echo ERREUR : placez d'abord CONTRAT-CADRE.md dans supabase\functions\odoo-prix\
    pause
    exit /b 1
)

git add supabase/functions/odoo-prix/CONTRAT-CADRE.md
git commit -m "Note : fonctionnement de la tarification par contrat-cadre"

git pull --rebase origin main
if errorlevel 1 ( echo ECHEC du pull. Envoie cette fenetre a Claude. & pause & exit /b 1 )

git push origin main

echo.
git log --oneline -2
echo.
pause