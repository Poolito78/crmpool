import type { VarianteDimension } from '@/lib/store';

// Nuancier paillettes ISOFLOOR (46 teintes) — images servies depuis public/paillettes.
// Métalliques +85 €, mélangées +5 €, monochromes inclus dans le prix.
export const NUANCIER_PAILLETTES: VarianteDimension[] = [
  {
    "id": "teinte",
    "nom": "Teinte paillette",
    "options": [
      {
        "id": "C1050",
        "label": "Noir (C1050)",
        "couleur": "#1a1a1a",
        "imageUrl": "/paillettes/Noir-C1050.avif"
      },
      {
        "id": "C5114",
        "label": "Gris foncé (C5114)",
        "couleur": "#4d4d4d",
        "imageUrl": "/paillettes/Gris-fonce-C5114.avif"
      },
      {
        "id": "C1480",
        "label": "Gris moyen (C1480)",
        "couleur": "#808080",
        "imageUrl": "/paillettes/Gris-moyen-C1480.avif"
      },
      {
        "id": "C1800",
        "label": "Gris clair (C1800)",
        "couleur": "#c0c0c0",
        "imageUrl": "/paillettes/Gris-clair-C1800.avif"
      },
      {
        "id": "C5304",
        "label": "Marron foncé (C5304)",
        "couleur": "#4b2e1e",
        "imageUrl": "/paillettes/Marron-fonce-C5304.avif"
      },
      {
        "id": "C6602",
        "label": "Marron clair (C6602)",
        "couleur": "#9c6b3f",
        "imageUrl": "/paillettes/Marron-clair-C6602.avif"
      },
      {
        "id": "C9910",
        "label": "Crème (C9910)",
        "couleur": "#f3ead0",
        "imageUrl": "/paillettes/Creme-C9910.avif"
      },
      {
        "id": "C1820",
        "label": "Blanc (C1820)",
        "couleur": "#f5f5f5",
        "imageUrl": "/paillettes/Blanc-C1820.avif"
      },
      {
        "id": "C1020",
        "label": "Violet (C1020)",
        "couleur": "#7b3fa0",
        "imageUrl": "/paillettes/Violet-C1020.avif"
      },
      {
        "id": "C9983",
        "label": "Bleu foncé (C9983)",
        "couleur": "#14315c",
        "imageUrl": "/paillettes/Bleu-fonce-C9983.avif"
      },
      {
        "id": "C9967",
        "label": "Bleu (C9967)",
        "couleur": "#1763a8",
        "imageUrl": "/paillettes/Bleu-C9967.avif"
      },
      {
        "id": "C9905",
        "label": "Bleu clair (C9905)",
        "couleur": "#7fb6dd",
        "imageUrl": "/paillettes/Bleu-clair-C9905.avif"
      },
      {
        "id": "C9995",
        "label": "Rouge brique (C9995)",
        "couleur": "#9b4435",
        "imageUrl": "/paillettes/Rouge-brique-C9995.avif"
      },
      {
        "id": "C9920",
        "label": "Rouge (C9920)",
        "couleur": "#c62828",
        "imageUrl": "/paillettes/Rouge-C9920.avif"
      },
      {
        "id": "C6804",
        "label": "Orange (C6804)",
        "couleur": "#e67e22",
        "imageUrl": "/paillettes/Orange-C6804.avif"
      },
      {
        "id": "C2200",
        "label": "Jaune (C2200)",
        "couleur": "#f4c20d",
        "imageUrl": "/paillettes/Jaune-C2200.avif"
      },
      {
        "id": "C1420",
        "label": "Vert kaki (C1420)",
        "couleur": "#6e7b3d",
        "imageUrl": "/paillettes/Vert-Kaki-C1420.avif"
      },
      {
        "id": "C5102",
        "label": "Vert clair (C5102)",
        "couleur": "#7cb342",
        "imageUrl": "/paillettes/Vert-clair-C5102.avif"
      },
      {
        "id": "M-1040",
        "label": "Amber (M-1040)",
        "couleur": "#c8902f",
        "imageUrl": "/paillettes/Amber_M1040-Swatch-1-768x768.jpg",
        "prixDiff": 85
      },
      {
        "id": "M-1000",
        "label": "Multy (M-1000)",
        "couleur": "#9e9e9e",
        "imageUrl": "/paillettes/Multi_M1000-Swatch-768x768.jpg",
        "prixDiff": 85
      },
      {
        "id": "MB-1005",
        "label": "Metal (MB-1005)",
        "couleur": "#a8a8a8",
        "imageUrl": "/paillettes/MB-1005-768x768.jpg",
        "prixDiff": 85
      },
      {
        "id": "MB-1006",
        "label": "Bronze (MB-1006)",
        "couleur": "#8c6239",
        "imageUrl": "/paillettes/MB-1006-768x768.jpg",
        "prixDiff": 85
      },
      {
        "id": "B-602",
        "label": "Mélange B-602",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/1-B-602.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-214",
        "label": "Mélange B-214",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/2-B-214.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-616",
        "label": "Mélange B-616",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/3-B-616.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-606",
        "label": "Mélange B-606",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/4-B-606.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-204",
        "label": "Mélange B-204",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/5-B-204.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-205",
        "label": "Mélange B-205",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/6-B-205.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-213",
        "label": "Mélange B-213",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/7-B-213.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-217",
        "label": "Mélange B-217",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/8-B-217.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-206",
        "label": "Mélange B-206",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/9-B-206.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-310",
        "label": "Mélange B-310",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/10-B-310.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-207",
        "label": "Mélange B-207",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/11-B-207.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-219",
        "label": "Mélange B-219",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/12-B-219.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-227",
        "label": "Mélange B-227",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/13-B-227.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-230",
        "label": "Mélange B-230",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/14-B-230.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-223",
        "label": "Mélange B-223",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/15-B-223.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-212",
        "label": "Mélange B-212",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/16-B-212.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-220",
        "label": "Mélange B-220",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/17-B-220.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-216",
        "label": "Mélange B-216",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/18-B-216.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-215",
        "label": "Mélange B-215",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/19-B-215.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-209",
        "label": "Mélange B-209",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/20-B-209.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-201",
        "label": "Mélange B-201",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/21-B-201.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-221",
        "label": "Mélange B-221",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/22-B-221.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-229",
        "label": "Mélange B-229",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/23-B-229.jpg",
        "prixDiff": 5
      },
      {
        "id": "B-242",
        "label": "Mélange B-242",
        "couleur": "#cfcfcf",
        "imageUrl": "/paillettes/24-B-242.jpg",
        "prixDiff": 5
      }
    ]
  }
];
