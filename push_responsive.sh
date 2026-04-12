#!/bin/bash
# Depuis la racine de ton projet crmpool (Git Bash)

git apply responsive_produits.patch
git add src/pages/Produits.tsx
git commit -m "fix: fiche produit responsive — grilles et largeur dialog ajustées"
git push
