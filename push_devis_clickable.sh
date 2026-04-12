#!/bin/bash
# Depuis la racine de ton projet crmpool (Git Bash)

git apply devis_clickable.patch
git add src/pages/Devis.tsx
git commit -m "ux: carte devis cliquable, bouton modifier supprimé"
git push
