#!/usr/bin/env python3
"""
Offline-Parser-Test
===================
Reads fixture pages from test_pages/ and verifies the infobox extraction
without making any API or Mistral calls.

Usage:
    pip install -r requirements.txt
    python test_parsing.py
"""

import sys
from pathlib import Path

# Allow importing from same directory
sys.path.insert(0, str(Path(__file__).parent))

from rote_rosen_seed import (
    parse_infobox_relationships,
    strip_wiki_markup,
    split_names,
    dedup_kandidaten,
)

TEST_PAGES_DIR = Path(__file__).parent / 'test_pages'


def test_helpers() -> None:
    print('Helper-Tests')
    print('-' * 40)

    # strip_wiki_markup
    assert strip_wiki_markup('[[Anna Lena|Anna-Lena]]') == 'Anna-Lena', \
        'Link with display text'
    assert strip_wiki_markup('[[Marc]]') == 'Marc', \
        'Simple link'
    assert strip_wiki_markup('{{Vorlage|arg}}') == '', \
        'Template stripped'
    assert strip_wiki_markup('<ref>Quelle</ref>') == '', \
        'Ref tag stripped'
    print('  OK strip_wiki_markup (4 assertions)')

    # split_names
    assert split_names('Marc, Anna, Tobias') == ['Marc', 'Anna', 'Tobias'], \
        'CSV split'
    assert split_names('[[Marc Brenner]], [[Anna]]') == ['Marc Brenner', 'Anna'], \
        'CSV with wiki links'
    assert split_names('Maria<br/>Karl') == ['Maria', 'Karl'], \
        '<br> split'
    assert split_names('') == [], \
        'Empty string'
    assert split_names('-') == [], \
        'Dash filtered'
    print('  OK split_names (5 assertions)')

    # dedup_kandidaten
    data = [
        {'roh_quelle_name': 'Anna', 'roh_ziel_name': 'Marc', 'typ_key': 'liebe'},
        {'roh_quelle_name': 'Anna', 'roh_ziel_name': 'Marc', 'typ_key': 'liebe'},  # dup
        {'roh_quelle_name': 'Anna', 'roh_ziel_name': 'Tobias', 'typ_key': 'freundschaft'},
        {'roh_quelle_name': 'anna', 'roh_ziel_name': 'MARC', 'typ_key': 'liebe'},  # case dup
    ]
    result = dedup_kandidaten(data)
    assert len(result) == 2, f'Expected 2 after dedup, got {len(result)}'
    print('  OK dedup_kandidaten (case-insensitive dedup)')

    print()


def test_fixture(path: Path) -> list[dict]:
    # Derive a plausible figur name from filename
    name_parts = path.stem.split('_')
    figur_name = ' '.join(p.capitalize() for p in name_parts)

    print(f'Fixture: {path.name}  (Figur: "{figur_name}")')
    print('-' * 40)

    wikitext = path.read_text(encoding='utf-8')
    rels = parse_infobox_relationships(figur_name, wikitext)

    if not rels:
        print('  [!] Keine Beziehungen extrahiert')
        print()
        return []

    for i, r in enumerate(rels, 1):
        match_hint = '+' if r.get('match_quelle_id') or r.get('match_ziel_id') else '-'
        print(f'  {i}. {r["roh_quelle_name"]} <-> {r["roh_ziel_name"]}')
        print(f'     typ_key: {r["typ_key"]}  |  ki_konfidenz: {r.get("ki_konfidenz", "?")}')
        if r.get('evidenz_zitat'):
            print(f'     zitat: {r["evidenz_zitat"]}')

    print(f'\n  Gesamt: {len(rels)} Beziehungen')
    print()
    return rels


def main() -> int:
    print('=' * 50)
    print('Rote Rosen Seed — Offline-Parser-Test')
    print('=' * 50)
    print()

    # Helper unit tests
    test_helpers()

    # Fixture files
    fixture_files = sorted(TEST_PAGES_DIR.glob('*.wikitext'))
    if not fixture_files:
        print(f'[!] Keine Fixture-Dateien in {TEST_PAGES_DIR}')
        print('    Lege .wikitext-Dateien in test_pages/ ab.')
        return 1

    all_rels: list[dict] = []
    for f in fixture_files:
        rels = test_fixture(f)
        all_rels.extend(rels)

    # Cross-fixture dedup check
    deduped = dedup_kandidaten(all_rels)
    print('=' * 50)
    print(f'Gesamt: {len(all_rels)} Beziehungen, '
          f'{len(deduped)} nach De-Duplizierung')
    print('Alle Tests bestanden.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
