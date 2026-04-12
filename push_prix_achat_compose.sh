#!/bin/bash
# Depuis la racine de ton projet crmpool (Git Bash)

git apply prix_achat_compose.patch
git add src/pages/Produits.tsx
git commit -m "feat: prix achat produit composé calculé automatiquement depuis les composants"
git push
