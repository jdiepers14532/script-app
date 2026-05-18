path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. globalKategorien Typ anpassen (kein betrag/waehrung mehr nötig)
old = "  const [globalKategorien, setGlobalKategorien] = useState<Array<{id: string; label: string; abrechnungstyp: string; betrag?: number; waehrung: string}>>( [])"
new = "  const [globalKategorien, setGlobalKategorien] = useState<Array<{id: string; label: string; kat_nr?: number}>>( [])"
assert old in content, 'globalKategorien state not found'
content = content.replace(old, new, 1)

# 2. handleSave: gage_kategorie_id entfernen, gage_kat bleibt
old = (
    "        gage_kat: gageKat,\n"
    "        gage_kategorie_id: gageKategorieId,\n"
    "      })"
)
new = (
    "        gage_kat: gageKat,\n"
    "      })"
)
assert old in content, 'handleSave gage_kategorie_id not found'
content = content.replace(old, new, 1)

# 3. Kat.-Feld: Dropdown → einfaches Zahlen-Input mit Namenslookup
old = (
    "          {/* Gagenkategorie */}\n"
    "          {globalKategorien.length > 0 && (\n"
    "            <div>\n"
    "              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>\n"
    "                Gagenkategorie\n"
    "              </label>\n"
    "              <select\n"
    "                value={gageKategorieId ?? ''}\n"
    "                onChange={e => setGageKategorieId(e.target.value || undefined)}\n"
    "                style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)', width: '100%', maxWidth: 280 }}\n"
    "              >\n"
    "                <option value=\"\">— keine —</option>\n"
    "                {globalKategorien.map(gk => (\n"
    "                  <option key={gk.id} value={gk.id}>\n"
    "                    {gk.label}{gk.betrag != null ? ` \u00b7 ${gk.betrag.toLocaleString('de-DE')} ${gk.waehrung}` : ''}{' '}({ABRECHNUNGSTYPEN.find(a => a.id === gk.abrechnungstyp)?.label ?? gk.abrechnungstyp})\n"
    "                  </option>\n"
    "                ))}\n"
    "              </select>\n"
    "            </div>\n"
    "          )}"
)
new = (
    "          {/* Gagenkategorie */}\n"
    "          <div>\n"
    "            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Kat.</label>\n"
    "            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>\n"
    "              <input\n"
    "                type=\"number\" min={1}\n"
    "                value={gageKat ?? ''}\n"
    "                onChange={e => setGageKat(e.target.value ? Number(e.target.value) : undefined)}\n"
    "                placeholder=\"\u2014\"\n"
    "                style={{ width: 60, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 13, textAlign: 'center', color: 'var(--text-primary)' }}\n"
    "              />\n"
    "              {gageKat !== undefined && (() => {\n"
    "                const match = globalKategorien.find(g => g.kat_nr === gageKat)\n"
    "                return match ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{match.label}</span> : null\n"
    "              })()}\n"
    "            </div>\n"
    "          </div>"
)
assert old in content, 'Dropdown block not found'
content = content.replace(old, new, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
