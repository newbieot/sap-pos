from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
required = [
    'index.html', '404.html', 'favicon.svg', 'site.webmanifest', 'robots.txt',
    'sitemap.xml', '_headers', 'README.md', 'CHANGELOG.md',
    'assets/css/app.css', 'assets/js/app.js', 'assets/js/workbook-parser.js',
    'assets/js/converters.js', 'assets/js/validation.js', 'assets/js/export.js'
]
missing = [path for path in required if not (ROOT / path).exists()]
if missing:
    raise SystemExit(f'Missing required files: {missing}')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'assets/css/app.css').read_text(encoding='utf-8')
assert '<html lang="en">' in html
assert 'https://sapx.posnew.com/' in html
assert 'SoftwareApplication' in html
assert 'xlsx-0.20.3' in html
assert 'cdn.tailwindcss.com' not in html
assert 'fonts.googleapis.com' not in html
assert 'lucide' not in html.lower()
assert 'height:38px' in css
assert 'height:36px' in css
assert 'border-top:2px solid var(--orange)' in css
assert '@media (prefers-reduced-motion:reduce)' in css
assert re.search(r'\.dashboard-footer\{[^}]*height:38px', css)
print('Static audit passed.')
