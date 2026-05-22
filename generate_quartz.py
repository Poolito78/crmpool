"""
Génère des SVG texturés haute qualité pour les teintes QuartzColor
Résultat dans public/quartz/
"""
import os

QUARTZ_COLORS = {
    'Beige_101':      {'hex': '#BFB08A', 'dark': False, 'label': 'Beige 101',       'r':191,'g':176,'b':138},
    'Biscuit_102':    {'hex': '#C9A85A', 'dark': False, 'label': 'Biscuit 102',     'r':201,'g':168,'b': 90},
    'Black_901':      {'hex': '#2C2A28', 'dark': True,  'label': 'Black 901',       'r': 44,'g': 42,'b': 40},
    'Dark_Grey_703':  {'hex': '#4A4844', 'dark': True,  'label': 'Dark Grey 703',   'r': 74,'g': 72,'b': 68},
    'Grass_Green_601':{'hex': '#4C6C32', 'dark': True,  'label': 'Grass Green 601', 'r': 76,'g':108,'b': 50},
    'Light_Grey_701': {'hex': '#AAAA9C', 'dark': False, 'label': 'Light Grey 701',  'r':170,'g':170,'b':156},
    'Mid_Blue_501':   {'hex': '#4870A4', 'dark': True,  'label': 'Mid Blue 501',    'r': 72,'g':112,'b':164},
    'Mid_Grey_702':   {'hex': '#72706A', 'dark': True,  'label': 'Mid Grey 702',    'r':114,'g':112,'b':106},
    'Blue_502':       {'hex': '#3A507E', 'dark': True,  'label': 'Blue 502',        'r': 58,'g': 80,'b':126},
    'Cream_103':      {'hex': '#D8CCAA', 'dark': False, 'label': 'Cream 103',       'r':216,'g':204,'b':170},
    'Green_602':      {'hex': '#5C7E44', 'dark': True,  'label': 'Green 602',       'r': 92,'g':126,'b': 68},
    'Grey_704':       {'hex': '#88887A', 'dark': True,  'label': 'Grey 704',        'r':136,'g':136,'b':122},
    'Red_301':        {'hex': '#924030', 'dark': True,  'label': 'Red 301',         'r':146,'g': 64,'b': 48},
    'Yellow_104':     {'hex': '#C89C1A', 'dark': False, 'label': 'Yellow 104',      'r':200,'g':156,'b': 26},
}

def make_svg(key, info):
    r, g, b = info['r'], info['g'], info['b']
    text_color = '#FFFFFF' if info['dark'] else '#333333'
    # Couleur plus claire pour les granulats clairs
    rl = min(255, r+40); gl = min(255, g+38); bl = min(255, b+35)
    # Couleur plus sombre pour les granulats foncés
    rd = max(0, r-35); gd = max(0, g-35); bd = max(0, b-35)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <defs>
    <!-- Bruit de base pour simuler granulat -->
    <filter id="f1" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <!-- Turbulence fine pour grain de quartz -->
      <feTurbulence type="fractalNoise" baseFrequency="0.65 0.7" numOctaves="4" seed="12" result="noise1"/>
      <!-- Turbulence grossière pour particules visibles -->
      <feTurbulence type="turbulence" baseFrequency="0.12 0.14" numOctaves="2" seed="5" result="noise2"/>
      <!-- Mélange des deux niveaux de bruit -->
      <feMerge result="combinedNoise">
        <feMergeNode in="noise1"/>
        <feMergeNode in="noise2"/>
      </feMerge>
      <!-- Éclairage directionnel pour effet 3D granulat -->
      <feDiffuseLighting in="noise1" lighting-color="white" diffuseConstant="1.2" surfaceScale="4" result="light">
        <feDistantLight azimuth="225" elevation="55"/>
      </feDiffuseLighting>
      <!-- Colorer le bruit avec la couleur de base -->
      <feColorMatrix type="matrix" in="noise2"
        values="0 0 0 0 {r/255:.3f}
                0 0 0 0 {g/255:.3f}
                0 0 0 0 {b/255:.3f}
                0 0 0 1 0" result="coloredNoise"/>
      <!-- Blend lumière + couleur -->
      <feBlend in="coloredNoise" in2="light" mode="multiply" result="litColor"/>
      <!-- Ajuste contraste -->
      <feComponentTransfer in="litColor" result="contrast">
        <feFuncR type="gamma" amplitude="1.1" exponent="0.9" offset="-0.02"/>
        <feFuncG type="gamma" amplitude="1.1" exponent="0.9" offset="-0.02"/>
        <feFuncB type="gamma" amplitude="1.1" exponent="0.9" offset="-0.02"/>
      </feComponentTransfer>
      <feComposite in="contrast" in2="SourceGraphic" operator="in"/>
    </filter>

    <!-- Filtre pour les particules distinctes -->
    <filter id="f2" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feTurbulence type="turbulence" baseFrequency="0.25 0.28" numOctaves="1" seed="9" result="t"/>
      <feColorMatrix type="matrix" in="t"
        values="0 0 0 0 {rl/255:.3f}
                0 0 0 0 {gl/255:.3f}
                0 0 0 0 {bl/255:.3f}
                0 0 3 -1.2 0" result="particles"/>
      <feComposite in="particles" in2="SourceGraphic" operator="in"/>
    </filter>

    <filter id="f3" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feTurbulence type="turbulence" baseFrequency="0.3 0.32" numOctaves="1" seed="17" result="t"/>
      <feColorMatrix type="matrix" in="t"
        values="0 0 0 0 {rd/255:.3f}
                0 0 0 0 {gd/255:.3f}
                0 0 0 0 {bd/255:.3f}
                0 0 3 -1.5 0" result="dark_particles"/>
      <feComposite in="dark_particles" in2="SourceGraphic" operator="in"/>
    </filter>

    <clipPath id="clip"><rect width="200" height="100" rx="6"/></clipPath>
  </defs>

  <!-- Fond de couleur de base -->
  <rect width="200" height="100" fill="rgb({r},{g},{b})" rx="6"/>

  <!-- Couche texture principale (grain fin + éclairage) -->
  <rect width="200" height="100" fill="rgb({r},{g},{b})" filter="url(#f1)" clip-path="url(#clip)" opacity="0.95"/>

  <!-- Particules claires (granulats brillants) -->
  <rect width="200" height="100" fill="white" filter="url(#f2)" clip-path="url(#clip)" opacity="0.25"/>

  <!-- Particules sombres (granulats foncés) -->
  <rect width="200" height="100" fill="black" filter="url(#f3)" clip-path="url(#clip)" opacity="0.2"/>

  <!-- Léger vignettage sur les bords -->
  <rect width="200" height="100" rx="6"
    fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="2"/>
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

print(f'\n{len(QUARTZ_COLORS)} fichiers SVG améliorés dans public/quartz/')
