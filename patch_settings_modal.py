path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanSettingsModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Interface vereinfachen
old = (
    "interface GageKategorie {\n"
    "  id: string\n"
    "  label: string\n"
    "  beschreibung?: string\n"
    "  abrechnungstyp: string\n"
    "  betrag?: number\n"
    "  waehrung: string\n"
    "  lst_rg: string\n"
    "  sortierung: number\n"
    "}"
)
new = (
    "interface GageKategorie {\n"
    "  id: string\n"
    "  label: string\n"
    "  kat_nr?: number\n"
    "}"
)
assert old in content, 'Interface not found'
content = content.replace(old, new, 1)

# startNew
old = (
    "  const startNew = () => {\n"
    "    setForm({ label: '', abrechnungstyp: 'pauschal', waehrung: 'EUR', lst_rg: 'rg', betrag: undefined, sortierung: list.length })\n"
    "    setIsNew(true)\n"
    "    setEditing(null)\n"
    "  }"
)
new = (
    "  const startNew = () => {\n"
    "    const nextKat = list.reduce((max, g) => Math.max(max, g.kat_nr ?? 0), 0) + 1\n"
    "    setForm({ label: '', kat_nr: nextKat })\n"
    "    setIsNew(true)\n"
    "    setEditing(null)\n"
    "  }"
)
assert old in content, 'startNew not found'
content = content.replace(old, new, 1)

# Formular-Grid ersetzen - vereinfacht suchen
# Wir suchen nach dem Anfang und Ende des Grids
grid_start = "        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>"
grid_end = "          </div>"
# Finde den Block
idx_start = content.find(grid_start)
assert idx_start >= 0, 'grid_start not found'
# Finde das Ende nach dem Start (das letzte </div> vor den Buttons)
idx_end = content.find(grid_end, idx_start)
# Es gibt mehrere schließende </div> - wir brauchen das nach dem letzten <div>
# Besser: suche nach dem schließenden </div> für das Grid (nach den 4 Spalten)
# Da das Grid 4 Kinder hat, suche nach dem 4. </div>
# Einfacher: suche nach dem spezifischen Ende
specific_end = "            </div>\n          </div>\n          <div style={{ display: 'flex', justifyContent: 'flex-end'"
idx_end2 = content.find(specific_end, idx_start)
assert idx_end2 >= 0, 'grid_end not found: ' + repr(content[idx_start:idx_start+200])

old_grid = content[idx_start:idx_end2 + len("            </div>\n          </div>")]
new_grid = (
    "        <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}>\n"
    "            <div style={{ width: 72 }}>\n"
    "              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Kat.-Nr.</label>\n"
    "              <input type=\"number\" min={1} style={{ ...inp, width: '100%', boxSizing: 'border-box', textAlign: 'center' }}\n"
    "                value={form.kat_nr ?? ''} onChange={e => setForm(f => ({ ...f, kat_nr: e.target.value ? Number(e.target.value) : undefined }))} placeholder=\"1\" />\n"
    "            </div>\n"
    "            <div style={{ flex: 1 }}>\n"
    "              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Bezeichnung *</label>\n"
    "              <input style={{ ...inp, width: '100%', boxSizing: 'border-box' }}\n"
    "                value={form.label ?? ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder=\"z.B. Erstautor\" />\n"
    "            </div>\n"
    "          </div>"
)
content = content.replace(old_grid, new_grid, 1)

# Tabellen-Header vereinfachen
old_header = (
    "              <thead>\n"
    "              <tr style={{ background: 'var(--bg-subtle)' }}>\n"
    "                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Bezeichnung</th>\n"
    "                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Abrechnung</th>\n"
    "                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 100 }}>Betrag</th>\n"
    "                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 60 }}>LSt/RG</th>\n"
    "                <th style={{ width: 80, borderBottom: '1px solid var(--border)' }} />\n"
    "              </tr>\n"
    "            </thead>"
)
new_header = (
    "              <thead>\n"
    "              <tr style={{ background: 'var(--bg-subtle)' }}>\n"
    "                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 60 }}>Kat.</th>\n"
    "                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Bezeichnung</th>\n"
    "                <th style={{ width: 80, borderBottom: '1px solid var(--border)' }} />\n"
    "              </tr>\n"
    "            </thead>"
)
assert old_header in content, 'header not found'
content = content.replace(old_header, new_header, 1)

# Tabellen-Zeilen vereinfachen - suche nach dem tr und ersetze die tds
old_row_start = "                <tr key={gk.id} style={{ background: i % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-subtle)' }}>\n"
old_row_tds = (
    "                  <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>\n"
    "                    {gk.label}\n"
    "                    {gk.beschreibung && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6, fontWeight: 400 }}>{gk.beschreibung}</span>}\n"
    "                  </td>\n"
    "                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)' }}>\n"
    "                    {ABRECHNUNGSTYPEN.find(a => a.id === gk.abrechnungstyp)?.label ?? gk.abrechnungstyp}\n"
    "                  </td>\n"
    "                  <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>\n"
    "                    {gk.betrag != null ? `${gk.betrag.toLocaleString('de-DE')} ${gk.waehrung}` : '\u2014'}\n"
    "                  </td>\n"
    "                  <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 11 }}>\n"
    "                    {gk.lst_rg}\n"
    "                  </td>\n"
    "                  <td style={{ padding: '9px 8px', textAlign: 'center' }}>"
)
new_row_tds = (
    "                  <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13 }}>\n"
    "                    {gk.kat_nr ?? '\u2014'}\n"
    "                  </td>\n"
    "                  <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>\n"
    "                    {gk.label}\n"
    "                  </td>\n"
    "                  <td style={{ padding: '9px 8px', textAlign: 'center' }}>"
)
assert old_row_tds in content, 'row tds not found'
content = content.replace(old_row_tds, new_row_tds, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
