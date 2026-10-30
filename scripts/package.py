#!/usr/bin/env python3
"""Create a reproducible Chrome extension ZIP, without build dependencies."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
assert MANIFEST['manifest_version'] == 3
VERSION = MANIFEST['version']
assert VERSION == '1.0.0', f'Expected v1.0.0, found {VERSION}'
FILES = [
    'manifest.json', 'content.js', 'popup.html', 'popup.css', 'popup.js',
    'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png',
    'icons/icon-128.png'
]
for relpath in FILES:
    file = ROOT / relpath
    if not file.is_file():
        raise SystemExit(f'Missing extension asset: {relpath}')
    if relpath.endswith('.png') and not file.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
        raise SystemExit(f'Invalid PNG: {relpath}')
for icon in MANIFEST.get('icons', {}).values():
    assert icon in FILES, f'Icon not packaged: {icon}'
assert MANIFEST['action']['default_popup'] in FILES

OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
archive = OUT / f'content-unhider-v{VERSION}.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as zf:
    for relpath in FILES:
        entry = ZipInfo(relpath, date_time=(2026, 10, 30, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        zf.writestr(entry, (ROOT / relpath).read_bytes(),
                    compress_type=ZIP_DEFLATED, compresslevel=9)
with ZipFile(archive) as zf:
    assert zf.testzip() is None
    assert zf.namelist() == FILES
    assert 'manifest.json' in zf.namelist()
sha256 = hashlib.sha256(archive.read_bytes()).hexdigest()
(OUT / 'SHA256SUMS.txt').write_text(
    f'{sha256}  {archive.name}\n', encoding='utf-8')
print(f'Created {archive} ({archive.stat().st_size:,} bytes)')
print(f'SHA256: {sha256}')
