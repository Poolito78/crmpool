"""
Télécharge les vraies photos couleur QuartzColor depuis Flowcrete
et les stocke dans public/quartz/
"""
import urllib.request
import os

IMAGES = {
    'Beige_101.jpg':      'https://assets.cpg-europe.com/cms/ressources/4254_9bb5e4f6-a408-4d42-9260-3d40772eabfe/Flowfast BC Beige 101.jpg',
    'Biscuit_102.jpg':    'https://assets.cpg-europe.com/cms/ressources/4254_3ef84411-9366-480c-968a-23b9280485a9/Flowfast BC Biscuit 102.jpg',
    'Black_901.jpg':      'https://assets.cpg-europe.com/cms/ressources/4254_dceef25e-6be5-40d2-ba52-410a7cb931a7/Flowfast BC Black 901.jpg',
    'Dark_Grey_703.jpg':  'https://assets.cpg-europe.com/cms/ressources/4254_27f5f332-8205-4910-802a-69bf5da83c2e/Flowfast BC Dark Grey 703.jpg',
    'Grass_Green_601.jpg':'https://assets.cpg-europe.com/cms/ressources/4254_2f996f5a-66ac-4584-8759-7759d2642684/Flowfast BC Grass Green 601.jpg',
    'Light_Grey_701.jpg': 'https://assets.cpg-europe.com/cms/ressources/4254_100bc736-ade6-4a42-819a-381f1a37b4ac/Flowfast BC Light Grey 701.jpg',
    'Mid_Blue_501.jpg':   'https://assets.cpg-europe.com/cms/ressources/4254_b0b0be46-a8b9-4f62-b2b7-5be581ebd527/Flowfast BC Mid Blue 501.jpg',
    'Mid_Grey_702.jpg':   'https://assets.cpg-europe.com/cms/ressources/4254_02fd52d2-3435-4f10-aab9-7b2b573004af/Flowfast BC Mid Grey 702.jpg',
    'Blue_502.jpg':       'https://assets.cpg-europe.com/cms/ressources/4254_fc42305a-1f3f-4e3e-8b32-2ce95134ced9/Flowfast BC Blue 502.jpg',
    'Cream_103.jpg':      'https://assets.cpg-europe.com/cms/ressources/4254_3d4fe38c-fbf1-45be-aa58-f775efa0d51b/Flowfast BC Cream 103.jpg',
    'Green_602.jpg':      'https://assets.cpg-europe.com/cms/ressources/4254_6ac4fac5-00e4-40b6-a07c-e52efb6be385/Flowfast BC Green 602.jpg',
    'Grey_704.jpg':       'https://assets.cpg-europe.com/cms/ressources/4254_8269c917-75f3-487c-a33a-e213a3f3587e/Flowfast BC Grey 704.jpg',
    'Red_301.jpg':        'https://assets.cpg-europe.com/cms/ressources/4254_8c0143c5-5c40-4c2a-ae44-30e360b627aa/Flowfast BC Red 301.jpg',
    'Yellow_104.jpg':     'https://assets.cpg-europe.com/cms/ressources/4254_3f60e017-d2b3-4666-bb2d-37ec0be1fc5d/Flowfast BC Yellow 104.jpg',
}

out_dir = os.path.join(os.path.dirname(__file__), 'public', 'quartz')
os.makedirs(out_dir, exist_ok=True)

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

for filename, url in IMAGES.items():
    dest = os.path.join(out_dir, filename)
    try:
        encoded_url = url.replace(' ', '%20')
        req = urllib.request.Request(encoded_url, headers=headers)
        with urllib.request.urlopen(req) as resp, open(dest, 'wb') as f:
            f.write(resp.read())
        size = os.path.getsize(dest)
        print(f'✓ {filename} ({size//1024} ko)')
    except Exception as e:
        print(f'✗ {filename} — {e}')

print('\nTerminé.')
