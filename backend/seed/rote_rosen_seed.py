#!/usr/bin/env python3
"""
Rote Rosen Fandom Wiki → Beziehungsbaum Seed Pipeline
======================================================
Local runner — runs on developer laptop, NOT on VPS.
Cloudflare blocks the VPS IP; run from a normal network connection.

Usage:
    pip install -r requirements.txt
    export SEED_AUTH_EMAIL=noreply@serienwerft.studio
    export SEED_AUTH_PASSWORD=Claude2026
    export SEED_MISTRAL_API_KEY=<key>       # optional, enables AI extraction
    python rote_rosen_seed.py [--dry-run] [--max-pages N]

Guardrails:
  - Writes ONLY to beziehung_seed_kandidaten (staging table) via /api/beziehungen/seed/import
  - No direct character creation — anlegen_* flags default false, reviewer decides in UI
  - Rate-limited: SEED_RATE_LIMIT_DELAY seconds between wiki requests (default 1.5)
  - CC-BY-SA attribution stored in quell_url for every kandidat
"""

import os
import sys
import json
import time
import uuid
import logging
import argparse
import re
from datetime import date
from typing import Optional

import requests
import mwparserfromhell  # pip install mwparserfromhell

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ── Config (from ENV) ─────────────────────────────────────────────────────────
WIKI_BASE   = os.environ.get('SEED_WIKI_BASE_URL', 'https://roterosen.fandom.com/de')
WIKI_API    = f'{WIKI_BASE}/api.php'
SCRIPT_API  = os.environ.get('SEED_SCRIPT_API_BASE', 'https://script.serienwerft.studio/api')
AUTH_BASE   = os.environ.get('SEED_AUTH_BASE', 'https://auth.serienwerft.studio')
AUTH_EMAIL    = os.environ.get('SEED_AUTH_EMAIL', '')
AUTH_PASSWORD = os.environ.get('SEED_AUTH_PASSWORD', '')
MISTRAL_KEY   = os.environ.get('SEED_MISTRAL_API_KEY', '')
REIHEN_ID     = os.environ.get('SEED_REIHEN_ID', 'ea93d31d-544a-4842-a2bf-29f1c15e4bb6')
RATE_DELAY    = float(os.environ.get('SEED_RATE_LIMIT_DELAY', '1.5'))
MAX_PAGES     = int(os.environ.get('SEED_MAX_PAGES', '0'))  # 0 = no limit

# ── Infobox-Feld → DB-typ_key Mapping ─────────────────────────────────────────
# Keys correspond to INSERT in v189_beziehungsbaum.sql
INFOBOX_TYP: dict[str, str] = {
    'partner':     'liebe',
    'Partner':     'liebe',
    'ehemann':     'ehe',
    'Ehemann':     'ehe',
    'ehefrau':     'ehe',
    'Ehefrau':     'ehe',
    'geschwister': 'familie_geschwister',
    'Geschwister': 'familie_geschwister',
    'vater':       'familie_eltern_kind',
    'Vater':       'familie_eltern_kind',
    'mutter':      'familie_eltern_kind',
    'Mutter':      'familie_eltern_kind',
    'kinder':      'familie_eltern_kind',
    'Kinder':      'familie_eltern_kind',
    'freunde':     'freundschaft',
    'Freunde':     'freundschaft',
    'freund':      'freundschaft',
    'Freund':      'freundschaft',
    'feinde':      'antagonismus',
    'Feinde':      'antagonismus',
    'kollegen':    'beruflich',
    'Kollegen':    'beruflich',
}

VALID_TYP_KEYS = {
    'familie_eltern_kind', 'familie_geschwister', 'familie_sonstige',
    'ehe', 'liebe', 'affaere', 'ex', 'einseitige_liebe',
    'freundschaft', 'bekanntschaft', 'antagonismus', 'beruflich',
}

# ── Wikitext Helpers ──────────────────────────────────────────────────────────
def strip_wiki_markup(text: str) -> str:
    """Remove wiki markup from a text fragment."""
    # [[Target|Display]] → Display; [[Target]] → Target
    text = re.sub(r'\[\[(?:[^|\]]+\|)?([^\]]+)\]\]', r'\1', text)
    # {{Template|...}} → ''
    text = re.sub(r'\{\{[^}]*\}\}', '', text)
    # <ref ...>...</ref>
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.DOTALL)
    text = re.sub(r'<ref[^/]*/>', '', text)
    # HTML comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    return text.strip()


def split_names(raw: str) -> list[str]:
    """Split comma- or <br>-separated name list into individual names."""
    raw = strip_wiki_markup(raw)
    raw = re.sub(r'<br\s*/?>', ',', raw, flags=re.IGNORECASE)
    names = [n.strip() for n in raw.split(',') if n.strip()]
    return [n for n in names if len(n) > 1 and n not in ('-', '–', '—')]


# ── Wiki-Link-Extraktion ──────────────────────────────────────────────────────
def extract_wikilinks(text: str) -> list[str]:
    """Extract display names from [[Target|Display]] and [[Target]] links."""
    results = []
    for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', text):
        display = m.group(2) if m.group(2) else m.group(1)
        name = display.strip()
        # Skip non-person links (categories, years, episodes, etc.)
        if name and not name.startswith('Staffel') and not name.startswith('Folge') \
                and not name.startswith('Kategorie') and not re.match(r'^\d', name):
            results.append(name)
    return results


# ── Beziehungsstatus-Feld → typ_key ──────────────────────────────────────────
_STATUS_TYP = [
    ('ex-verlobte', 'ex'), ('ex-verlobter', 'ex'),
    ('ex-freundin', 'ex'), ('ex-freund', 'ex'),
    ('ex-frau', 'ex'), ('ex-mann', 'ex'),
    ('ex-ehefrau', 'ex'), ('ex-ehemann', 'ex'),
    ('witwe', 'ex'), ('witwer', 'ex'),
    ('ehefrau', 'ehe'), ('ehemann', 'ehe'), ('verheiratet', 'ehe'),
    ('verlobte', 'liebe'), ('verlobter', 'liebe'),
    ('freundin', 'liebe'), ('freund', 'liebe'),   # in Beziehungsstatus = romantic
    ('partner', 'liebe'), ('partnerin', 'liebe'),
]


def _beziehungsstatus_typ(text: str) -> Optional[str]:
    low = text.lower()
    if low in ('', 'ledig', 'single', 'unbekannt', '-'):
        return None
    for keyword, typ in _STATUS_TYP:
        if keyword in low:
            return typ
    return None


# ── Beziehungen-Section Parser ────────────────────────────────────────────────
# Rolle (lowercase) → typ_key
_ROLLE_TYP: dict[str, str] = {
    'mutter': 'familie_eltern_kind', 'vater': 'familie_eltern_kind',
    'tochter': 'familie_eltern_kind', 'sohn': 'familie_eltern_kind',
    'kind': 'familie_eltern_kind', 'kinder': 'familie_eltern_kind',
    'schwester': 'familie_geschwister', 'bruder': 'familie_geschwister',
    'geschwister': 'familie_geschwister',
    'oma': 'familie_sonstige', 'opa': 'familie_sonstige',
    'großmutter': 'familie_sonstige', 'großvater': 'familie_sonstige',
    'enkelin': 'familie_sonstige', 'enkel': 'familie_sonstige',
    'nichte': 'familie_sonstige', 'neffe': 'familie_sonstige',
    'tante': 'familie_sonstige', 'onkel': 'familie_sonstige',
    'cousine': 'familie_sonstige', 'cousin': 'familie_sonstige',
    'großtante': 'familie_sonstige', 'großonkel': 'familie_sonstige',
    'großnichte': 'familie_sonstige', 'großneffe': 'familie_sonstige',
    'schwiegermutter': 'familie_sonstige', 'schwiegervater': 'familie_sonstige',
    'schwiegertochter': 'familie_sonstige', 'schwiegersohn': 'familie_sonstige',
    'ehefrau': 'ehe', 'ehemann': 'ehe',
    'ex-frau': 'ex', 'ex-mann': 'ex', 'ex-ehefrau': 'ex', 'ex-ehemann': 'ex',
    'witwe': 'ex', 'witwer': 'ex',
    'verlobte': 'liebe', 'verlobter': 'liebe',
    'freundin': 'liebe', 'freund': 'liebe',
    'ex-verlobte': 'ex', 'ex-verlobter': 'ex',
    'ex-freundin': 'ex', 'ex-freund': 'ex',
    'beste freundin': 'freundschaft', 'bester freund': 'freundschaft',
    'schulfreundin': 'freundschaft', 'schulfreund': 'freundschaft',
    'kollege': 'beruflich', 'kollegin': 'beruflich',
    'vorgesetzte': 'beruflich', 'vorgesetzter': 'beruflich',
    'feind': 'antagonismus', 'feindin': 'antagonismus',
    'rivale': 'antagonismus', 'rivalin': 'antagonismus',
}


def _parse_beziehungen_section(figur_name: str, wikitext: str) -> list[dict]:
    """Parse the ==Beziehungen== section bullet list."""
    results: list[dict] = []
    in_section = False
    current_subsection_typ: Optional[str] = None

    for line in wikitext.splitlines():
        line = line.strip()
        # Section start / end
        if re.match(r'^==\s*Beziehungen\s*==', line):
            in_section = True
            continue
        if in_section and re.match(r'^==\s*\w', line) and not re.match(r'^===', line):
            break  # End of section

        if not in_section:
            continue

        # Sub-section header (===Partner===, ===Verwandte===, etc.)
        m = re.match(r'^===\s*(.+?)\s*===', line)
        if m:
            header = m.group(1).lower()
            if any(k in header for k in ('partner', 'liebe', 'beziehung', 'freund', 'ehe')):
                current_subsection_typ = 'liebe'
            elif any(k in header for k in ('verwandt', 'familie', 'eltern', 'geschwister', 'kinder')):
                current_subsection_typ = 'familie_sonstige'
            elif 'freunde' in header:
                current_subsection_typ = 'freundschaft'
            elif any(k in header for k in ('beruf', 'kollege', 'arbeit')):
                current_subsection_typ = 'beruflich'
            elif any(k in header for k in ('feind', 'rivale', 'konflikt')):
                current_subsection_typ = 'antagonismus'
            else:
                current_subsection_typ = None
            continue

        # Bullet item: * [[Name|Display]] , Rolle
        if not line.startswith('*'):
            continue
        item = line.lstrip('*').strip()
        links = extract_wikilinks(item)
        if not links:
            continue
        ziel_name = links[0]
        if ziel_name.lower() == figur_name.lower():
            continue

        # Determine typ_key from comma-separated role description
        typ_key: Optional[str] = None
        if ',' in item:
            rolle = strip_wiki_markup(item.split(',', 1)[1]).strip().lower()
            # Try longest match first
            for key in sorted(_ROLLE_TYP.keys(), key=len, reverse=True):
                if key in rolle:
                    typ_key = _ROLLE_TYP[key]
                    break
        if typ_key is None:
            typ_key = current_subsection_typ or 'familie_sonstige'

        results.append({
            'roh_quelle_name': figur_name,
            'roh_ziel_name':   ziel_name,
            'typ_key':         typ_key,
            'staffel_hinweis': None,
            'evidenz_zitat':   strip_wiki_markup(item)[:80],
            'ki_konfidenz':    0.80,
        })
    return results


# ── Body-Text Pattern Extractor ───────────────────────────────────────────────
# Each tuple: (regex, typ_key)
_BODY_PATTERNS: list[tuple[str, str]] = [
    # Familie — Eltern/Kinder
    (r'(?:ist\s+die?\s+)?(?:Mutter|Mama|Vater|Papa)\s+von\s+', 'familie_eltern_kind'),
    (r'(?:ist\s+die?\s+)?(?:Tochter|Sohn)\s+von\s+', 'familie_eltern_kind'),
    # Familie — Geschwister
    (r'(?:ist\s+die?\s+)?(?:Schwester|Bruder)\s+von\s+', 'familie_geschwister'),
    # Familie — sonstige Verwandte
    (r'(?:ist\s+die?\s+)?(?:Großmutter|Oma|Großvater|Opa)\s+von\s+', 'familie_sonstige'),
    (r'(?:ist\s+die?\s+)?(?:Enkelin|Enkel)\s+von\s+', 'familie_sonstige'),
    (r'(?:ist\s+die?\s+)?(?:Nichte|Neffe)\s+von\s+', 'familie_sonstige'),
    (r'(?:ist\s+die?\s+)?(?:Tante|Onkel)\s+von\s+', 'familie_sonstige'),
    (r'(?:ist\s+die?\s+)?(?:Cousine|Cousin)\s+von\s+', 'familie_sonstige'),
    (r'(?:ist\s+die?\s+)?(?:Großtante|Großonkel)\s+von\s+', 'familie_sonstige'),
    (r'(?:ist\s+die?\s+)?(?:Schwiegermutter|Schwiegervater|Schwiegertochter|Schwiegersohn)\s+von\s+', 'familie_sonstige'),
    # Ehe
    (r'(?:ist\s+die?\s+)?(?:Ehefrau|Ehemann)\s+von\s+', 'ehe'),
    (r'verheiratet\s+mit\s+', 'ehe'),
    # Ex / Witwe
    (r'(?:ist\s+die?\s+)?(?:Witwe|Witwer|Ex-Ehefrau|Ex-Ehemann|Ex-Frau|Ex-Mann)\s+von\s+', 'ex'),
    (r'(?:ist\s+die?\s+)?(?:Ex-Verlobte|Ex-Verlobter)\s+von\s+', 'ex'),
    # Romantik
    (r'(?:ist\s+die?\s+)?(?:Verlobte|Verlobter)\s+von\s+', 'liebe'),
    # Freundschaft (explizit "beste")
    (r'(?:ist\s+die?\s+)?(?:beste\s+Freundin|bester\s+Freund|Schulfreundin|Schulfreund)\s+von\s+', 'freundschaft'),
    # Beruflich
    (r'(?:ist\s+die?\s+)?(?:Kollegin|Kollege|Vorgesetzte|Vorgesetzter)\s+von\s+', 'beruflich'),
    # Konflikt
    (r'(?:ist\s+die?\s+)?(?:Feindin|Feind|Rivalin|Rivale)\s+von\s+', 'antagonismus'),
]


def _parse_body_text(figur_name: str, wikitext: str) -> list[dict]:
    """Extract relationships from the first 2 paragraphs of body text."""
    results: list[dict] = []

    # Strip template blocks, get plain text
    try:
        parsed = mwparserfromhell.parse(wikitext)
        for tmpl in parsed.filter_templates():
            try:
                parsed.remove(tmpl)
            except Exception:
                pass
        plain = str(parsed)
    except Exception:
        plain = re.sub(r'\{\{[^}]*\}\}', '', wikitext)

    # Take only first 3 paragraphs (most relationship-rich part)
    paragraphs = [p.strip() for p in plain.split('\n\n') if p.strip()]
    text = '\n'.join(paragraphs[:3])

    for pattern, typ_key in _BODY_PATTERNS:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            # Find the next wiki link after the match position in the ORIGINAL wikitext
            after = wikitext[m.start():]
            links = extract_wikilinks(after[:200])
            if not links:
                # Try plain text: find capitalized name
                name_m = re.search(r'\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]', after[:200])
                if name_m:
                    links = [name_m.group(1).strip()]
            for ziel in links[:3]:  # max 3 names after each pattern
                if ziel.lower() == figur_name.lower():
                    continue
                zitat = re.sub(r'\s+', ' ', m.group(0) + ziel)[:80]
                results.append({
                    'roh_quelle_name': figur_name,
                    'roh_ziel_name':   ziel,
                    'typ_key':         typ_key,
                    'staffel_hinweis': None,
                    'evidenz_zitat':   zitat,
                    'ki_konfidenz':    0.70,
                })
                break  # one name per pattern match
    return results


# ── Main Wiki Relationship Parser ─────────────────────────────────────────────
def parse_infobox_relationships(figur_name: str, wikitext: str) -> list[dict]:
    """
    Parse both {{Infobox Figur}} (test fixtures) and {{Charakter}}
    (roterosen.fandom.com) templates, plus body text and ==Beziehungen== section.
    """
    try:
        parsed = mwparserfromhell.parse(wikitext)
    except Exception as e:
        log.warning(f'mwparserfromhell error: {e}')
        return []

    kandidaten: list[dict] = []

    for template in parsed.filter_templates():
        tname = str(template.name).strip().lower()
        is_infobox = 'infobox' in tname
        is_charakter = tname == 'charakter'
        if not is_infobox and not is_charakter:
            continue

        if is_infobox:
            # Legacy: test fixtures with {{Infobox Figur}} — structured fields
            for param in template.params:
                field = str(param.name).strip()
                typ_key = INFOBOX_TYP.get(field)
                if not typ_key:
                    continue
                raw_value = str(param.value).strip()
                if not raw_value:
                    continue
                for partner_name in split_names(raw_value):
                    if not partner_name or partner_name.lower() == figur_name.lower():
                        continue
                    kandidaten.append({
                        'roh_quelle_name': figur_name,
                        'roh_ziel_name':   partner_name,
                        'typ_key':         typ_key,
                        'staffel_hinweis': None,
                        'evidenz_zitat':   f'Infobox: {field} = {partner_name}',
                        'ki_konfidenz':    0.85,
                    })

        elif is_charakter:
            # Real wiki: {{Charakter}} — Beziehungsstatus field
            for param in template.params:
                fname = str(param.name).strip()
                if fname != 'Beziehungsstatus':
                    continue
                val = str(param.value).strip()
                typ_key = _beziehungsstatus_typ(val)
                if not typ_key:
                    continue
                for ziel in extract_wikilinks(val):
                    if ziel.lower() == figur_name.lower():
                        continue
                    kandidaten.append({
                        'roh_quelle_name': figur_name,
                        'roh_ziel_name':   ziel,
                        'typ_key':         typ_key,
                        'staffel_hinweis': None,
                        'evidenz_zitat':   f'Beziehungsstatus: {val[:80]}',
                        'ki_konfidenz':    0.80,
                    })

    # For real wiki pages: also parse ==Beziehungen== section and body text
    if '{{Charakter' in wikitext or '{{charakter' in wikitext:
        kandidaten.extend(_parse_beziehungen_section(figur_name, wikitext))
        kandidaten.extend(_parse_body_text(figur_name, wikitext))

    return kandidaten


# ── Mistral Extraction ────────────────────────────────────────────────────────
_MISTRAL_PROMPT = """\
Du analysierst den Text einer Figur aus der ARD-Telenovela "Rote Rosen".
Extrahiere ALLE Beziehungen der Figur "{name}" zu anderen Figuren.

Gib NUR ein JSON-Array zurück (kein Markdown, keine Erklärung):
[
  {{"roh_quelle_name": "{name}", "roh_ziel_name": "...", "typ_key": "...", \
"staffel_hinweis": null, "evidenz_zitat": "..."}}
]

Erlaubte typ_key-Werte:
familie_eltern_kind, familie_geschwister, familie_sonstige,
ehe, liebe, affaere, ex, einseitige_liebe,
freundschaft, bekanntschaft, antagonismus, beruflich

Regeln:
- Nur direkte Beziehungen von "{name}" — keine Beziehungen zwischen anderen Figuren
- staffel_hinweis: Integer wenn klar erkennbar, sonst null
- evidenz_zitat: wörtliches Kurzitat aus dem Text (max 80 Zeichen)
- Im Zweifel weglassen statt halluzinieren

Text:
{text}
"""


def extract_with_mistral(figur_name: str, wikitext: str) -> list[dict]:
    """Use Mistral Cloud to extract relationships from free-text sections."""
    if not MISTRAL_KEY:
        return []

    try:
        parsed = mwparserfromhell.parse(wikitext)
        for tmpl in parsed.filter_templates():
            if 'infobox' in str(tmpl.name).lower():
                try:
                    parsed.remove(tmpl)
                except Exception:
                    pass
        text = parsed.strip_code()
    except Exception:
        text = re.sub(r'\{\{[^}]*\}\}', '', wikitext)

    text = text.strip()[:4000]
    if len(text) < 60:
        return []

    prompt = _MISTRAL_PROMPT.format(name=figur_name, text=text)
    try:
        resp = requests.post(
            'https://api.mistral.ai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {MISTRAL_KEY}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'mistral-small-latest',
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.1,
                'max_tokens': 1000,
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()['choices'][0]['message']['content'].strip()
        # Strip markdown code fence if present
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)

        data = json.loads(content)
        if not isinstance(data, list):
            return []

        result: list[dict] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            if item.get('typ_key') not in VALID_TYP_KEYS:
                continue
            ziel = str(item.get('roh_ziel_name', '')).strip()
            if not ziel or ziel.lower() == figur_name.lower():
                continue
            result.append({
                'roh_quelle_name': figur_name,
                'roh_ziel_name':   ziel,
                'typ_key':         item['typ_key'],
                'staffel_hinweis': item.get('staffel_hinweis'),
                'evidenz_zitat':   str(item.get('evidenz_zitat', ''))[:200],
                'ki_konfidenz':    0.60,
            })
        return result

    except json.JSONDecodeError as e:
        log.warning(f'Mistral JSON parse error for "{figur_name}": {e}')
        return []
    except Exception as e:
        log.warning(f'Mistral API error for "{figur_name}": {e}')
        return []


# ── Wiki API Client ───────────────────────────────────────────────────────────
class WikiClient:
    def __init__(self, session: requests.Session) -> None:
        self.session = session

    def get_category_members(self, category: str = 'Kategorie:Figuren') -> list[str]:
        """Fetch all page titles in a category (handles cmcontinue pagination)."""
        titles: list[str] = []
        params: dict = {
            'action': 'query',
            'list':   'categorymembers',
            'cmtitle': category,
            'cmtype': 'page',
            'cmlimit': '500',
            'format': 'json',
        }
        while True:
            resp = self.session.get(WIKI_API, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            for m in data.get('query', {}).get('categorymembers', []):
                titles.append(m['title'])
            cont = data.get('continue', {}).get('cmcontinue')
            if not cont:
                break
            params['cmcontinue'] = cont
            time.sleep(RATE_DELAY)
        return titles

    def get_wikitext(self, title: str) -> Optional[str]:
        """Fetch raw Wikitext for a page title."""
        params = {
            'action': 'query',
            'prop':   'revisions',
            'rvprop': 'content',
            'titles': title,
            'format': 'json',
            'formatversion': '2',
        }
        resp = self.session.get(WIKI_API, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get('query', {}).get('pages', [])
        if not pages or pages[0].get('missing'):
            return None
        revisions = pages[0].get('revisions', [])
        if not revisions:
            return None
        return revisions[0].get('content', '')


# ── Name → UUID Mapper ────────────────────────────────────────────────────────
class FigurenMapper:
    """Maps character names to UUIDs via GET /api/beziehungen/figuren-suche."""

    def __init__(self, session: requests.Session) -> None:
        self.session = session
        self._cache: dict[str, Optional[str]] = {}

    def lookup(self, name: str) -> Optional[str]:
        if name in self._cache:
            return self._cache[name]
        try:
            resp = self.session.get(
                f'{SCRIPT_API}/beziehungen/figuren-suche',
                params={'q': name, 'limit': '5'},
                timeout=10,
            )
            resp.raise_for_status()
            results = resp.json()
            if results:
                match_id: str = results[0]['id']
                log.debug(f'  Match: "{name}" → "{results[0]["name"]}" ({match_id})')
                self._cache[name] = match_id
                return match_id
        except Exception as e:
            log.warning(f'  figuren-suche error for "{name}": {e}')
        self._cache[name] = None
        return None


# ── Auth ──────────────────────────────────────────────────────────────────────
def login(session: requests.Session) -> bool:
    """Login via auth.serienwerft.studio and store access_token cookie."""
    if not AUTH_EMAIL or not AUTH_PASSWORD:
        log.error('SEED_AUTH_EMAIL and SEED_AUTH_PASSWORD must be set')
        return False
    try:
        resp = session.post(
            f'{AUTH_BASE}/api/auth/login',
            json={'email': AUTH_EMAIL, 'password': AUTH_PASSWORD},
            timeout=15,
        )
        resp.raise_for_status()
        # Cookie is stored automatically on session; also set for script domain
        token = session.cookies.get('access_token')
        if not token:
            token = resp.json().get('access_token')
        if token:
            for domain in ['script.serienwerft.studio', '.serienwerft.studio']:
                session.cookies.set('access_token', token, domain=domain)
        log.info(f'Logged in as {AUTH_EMAIL}')
        return True
    except Exception as e:
        log.error(f'Login failed: {e}')
        return False


# ── De-duplication ────────────────────────────────────────────────────────────
def dedup_kandidaten(kandidaten: list[dict]) -> list[dict]:
    """Remove (quelle, ziel, typ) duplicates — keep first (higher-confidence infobox first)."""
    seen: set[tuple] = set()
    result: list[dict] = []
    for k in kandidaten:
        key = (
            k['roh_quelle_name'].lower(),
            k['roh_ziel_name'].lower(),
            k.get('typ_key', ''),
        )
        if key not in seen:
            seen.add(key)
            result.append(k)
    return result


# ── Import ────────────────────────────────────────────────────────────────────
def import_batch(
    session: requests.Session,
    kandidaten: list[dict],
    batch_id: str,
    quell_url: str,
    dry_run: bool,
) -> bool:
    if dry_run:
        log.info(f'[DRY RUN] Would import {len(kandidaten)} Kandidaten (batch {batch_id})')
        for k in kandidaten[:5]:
            match = '✓' if k.get('match_quelle_id') and k.get('match_ziel_id') else '?'
            log.info(f'  {match} {k["roh_quelle_name"]} <-> {k["roh_ziel_name"]} ({k.get("typ_key","?")})')
        if len(kandidaten) > 5:
            log.info(f'  … und {len(kandidaten) - 5} weitere')
        return True

    payload = {
        'batch_id':       batch_id,
        'quell_url':      quell_url,
        'quell_abruf_am': date.today().isoformat(),
        'kandidaten':     kandidaten,
    }
    try:
        resp = session.post(
            f'{SCRIPT_API}/beziehungen/seed/import',
            json=payload,
            timeout=30,
        )
        if not resp.ok:
            log.error(f'Import failed ({resp.status_code}): {resp.text[:200]}')
            return False
        data = resp.json()
        log.info(f'Imported {data.get("inserted", "?")} Kandidaten (batch {batch_id})')
        return True
    except Exception as e:
        log.error(f'Import request failed: {e}')
        return False


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description='Rote Rosen Wiki → Seed Pipeline')
    parser.add_argument('--dry-run', action='store_true',
                        help='Analyse only — print but do not import')
    parser.add_argument('--max-pages', type=int, default=MAX_PAGES,
                        help='Max pages to process (0 = all)')
    parser.add_argument('--category', default='Kategorie:Figuren',
                        help='Wiki category to crawl')
    parser.add_argument('--start-page', default='',
                        help='Process single page title (skips category crawl)')
    parser.add_argument('--pages', default='',
                        help='Comma-separated list of page titles to process (skips category crawl)')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    session = requests.Session()
    # Browser-like UA required — Fandom/Cloudflare blocks bot-identified UA strings.
    session.headers['User-Agent'] = (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )

    # Auth (only needed when actually importing)
    if not args.dry_run:
        if not login(session):
            return 1

    wiki   = WikiClient(session)
    mapper = FigurenMapper(session)

    # Determine page list
    if args.pages:
        titles = [t.strip() for t in args.pages.split(',') if t.strip()]
        log.info(f'Using explicit page list: {titles}')
    elif args.start_page:
        titles = [args.start_page]
    else:
        log.info(f'Fetching category: {args.category} …')
        try:
            titles = wiki.get_category_members(args.category)
            log.info(f'Found {len(titles)} pages')
        except Exception as e:
            log.error(f'Category fetch failed: {e}')
            return 1

    limit = args.max_pages if args.max_pages > 0 else MAX_PAGES
    if limit > 0:
        titles = titles[:limit]
        log.info(f'Processing {len(titles)} pages')

    batch_id = str(uuid.uuid4())
    all_kandidaten: list[dict] = []

    for i, title in enumerate(titles):
        log.info(f'[{i+1}/{len(titles)}] {title}')

        try:
            wikitext = wiki.get_wikitext(title)
        except Exception as e:
            log.warning(f'  Fetch error: {e} — skipping')
            time.sleep(RATE_DELAY)
            continue

        if not wikitext:
            log.debug(f'  No wikitext — skipping')
            time.sleep(RATE_DELAY)
            continue

        page_url = f'{WIKI_BASE}/wiki/{title.replace(" ", "_")}'

        # Stage 1: deterministic infobox extraction (no API calls)
        infobox_rels = parse_infobox_relationships(title, wikitext)

        # Stage 2: Mistral AI extraction (text sections, if key set)
        ai_rels = extract_with_mistral(title, wikitext)

        # Merge — infobox first (higher confidence, dedup will keep it)
        combined = infobox_rels + ai_rels

        # Name → UUID mapping (via figuren-suche, skip when dry-run offline)
        for k in combined:
            if not args.dry_run:
                k['match_quelle_id'] = mapper.lookup(k['roh_quelle_name'])
                k['match_ziel_id']   = mapper.lookup(k['roh_ziel_name'])
            k['quell_url'] = page_url
            k['status'] = (
                'neu'
                if k.get('match_quelle_id') and k.get('match_ziel_id')
                else 'braucht_klaerung'
            )

        all_kandidaten.extend(combined)
        log.info(f'  -> {len(combined)} ({len(infobox_rels)} Infobox, {len(ai_rels)} KI)')
        time.sleep(RATE_DELAY)

    all_kandidaten = dedup_kandidaten(all_kandidaten)
    log.info(f'Total after dedup: {len(all_kandidaten)} Kandidaten')

    if not all_kandidaten:
        log.info('Keine Kandidaten — fertig.')
        return 0

    # Import in chunks of 100
    for offset in range(0, len(all_kandidaten), 100):
        chunk = all_kandidaten[offset:offset + 100]
        ok = import_batch(
            session, chunk,
            batch_id=batch_id,
            quell_url=WIKI_BASE,
            dry_run=args.dry_run,
        )
        if not ok:
            log.error('Import failed — aborting.')
            return 1

    log.info(f'Fertig. Batch-ID: {batch_id}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
