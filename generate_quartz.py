"""
Génère des SVG texturés pour les teintes QuartzColor
Résultat dans public/quartz/
"""
import os

QUARTZ_COLORS = {
    'Beige_101':      {'hex': '#BFB08A', 'dark': False, 'label': 'Beige 101'},
    'Biscuit_102':    {'hex': '#C9A85A', 'dark': False, 'label': 'Biscuit 102'},
    'Black_901':      {'hex': '#2C2A28', 'dark': True,  'label': 'Black 901'},
    'Dark_Grey_703':  {'hex': '#4A4844', 'dark': True,  'label': 'Dark Grey 703'},
    'Grass_Green_601':{'hex': '#4C6C32', 'dark': True,  'label': 'Grass Green 601'},
    'Light_Grey_701': {'hex': '#AAAA9C', 'dark': False, 'label': 'Light Grey 701'},
    'Mid_Blue_501':   {'hex': '#4870A4', 'dark': True,  'label': 'Mid Blue 501'},
    'Mid_Grey_702':   {'hex': '#72706A', 'dark': True,  'label': 'Mid Grey 702'},
    'Blue_502':       {'hex': '#3A507E', 'dark': True,  'label': 'Blue 502'},
    'Cream_103':      {'hex': '#D8CCAA', 'dark': False, 'label': 'Cream 103'},
    'Green_602':      {'hex': '#5C7E44', 'dark': True,  'label': 'Green 602'},
    'Grey_704':       {'hex': '#88887A', 'dark': True,  'label': 'Grey 704'},
    'Red_301':        {'hex': '#924030', 'dark': True,  'label': 'Red 301'},
    'Yellow_104':     {'hex': '#C89C1A', 'dark': False, 'label': 'Yellow 104'},
}

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def adjust(val, delta):
    return max(0, min(255, val + delta))

def lighter(hex_color, amount=30):
    r, g, b = hex_to_rgb(hex_color)
    return f'#{adjust(r, amount):02X}{adjust(g, amount):02X}{adjust(b, amount):02X}'

def darker(hex_color, amount=30):
    r, g, b = hex_to_rgb(hex_color)
    return f'#{adjust(r, -amount):02X}{adjust(g, -amount):02X}{adjust(b, -amount):02X}'

def make_svg(key, info):
    base = info['hex']
    text_color = '#FFFFFF' if info['dark'] else '#222222'
    light = lighter(base, 25)
    dark  = darker(base, 25)
    label = info['label']

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <defs>
    <!-- Texture granulat simulée -->
    <filter id="grain" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" seed="3" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
      <feBlend in="SourceGraphic" in2="grey" mode="soft-light" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="speckle" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency="0.9 0.9" numOctaves="3" seed="7" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="{light}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="{dark}" stop-opacity="0.6"/>
    </radialGradient>
  </defs>

  <!-- Fond de couleur de base -->
  <rect width="120" height="80" fill="{base}" rx="4"/>

  <!-- Couche texture granulat -->
  <rect width="120" height="80" fill="{base}" filter="url(#grain)" rx="4" opacity="0.9"/>

  <!-- Vignette légère -->
  <rect width="120" height="80" fill="url(#vignette)" rx="4"/>

  <!-- Étiquette en bas -->
  <rect x="0" y="58" width="120" height="22" fill="rgba(0,0,0,0.45)" rx="0"/>
  <rect x="0" y="58" width="120" height="22" fill="rgba(0,0,0,0)" rx="4"/>
  <text x="60" y="72" font-family="Arial, sans-serif" font-size="9.5" font-weight="600"
        text-anchor="middle" fill="{text_color}" opacity="0.95">{label}</text>
</svg>'''
    return svg

out_dir = os.path.join(os.path.dirname(__file__), 'public', 'quartz')
os.makedirs(out_dir, exist_ok=True)

for key, info in QUARTZ_COLORS.items():
    svg = make_svg(key, info)
    fname = os.path.join(out_dir, f'{key}.svg')
    with open(fname, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f'✓ {key}.svg')

print(f'\n{len(QUARTZ_COLORS)} fichiers générés dans public/quartz/')
