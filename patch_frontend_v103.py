path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Einsatz interface: add is_zusatz ──────────────────────────────────────
old = "  gage_kat?: number\n  gage_kategorie_id?: string\n  erstellt_am?: string"
new = "  gage_kat?: number\n  gage_kategorie_id?: string\n  is_zusatz?: boolean\n  erstellt_am?: string"
assert old in content, 'Einsatz interface not found'
content = content.replace(old, new, 1)

# ── 2. modal state type: add isZusatz ────────────────────────────────────────
old = "  const [modal, setModal] = useState<{ einsatz?: Einsatz; jk: JobKategorie; woche: Date } | null>(null)\n  const [zusatzModal, setZusatzModal] = useState<{ jk: JobKategorie; woche: Date } | null>(null)"
new = "  const [modal, setModal] = useState<{ einsatz?: Einsatz; jk: JobKategorie; woche: Date; isZusatz?: boolean } | null>(null)"
assert old in content, 'modal state not found'
content = content.replace(old, new, 1)

# ── 3. handleCellClick: replace setZusatzModal with setModal isZusatz ────────
old = (
    "  const handleCellClick = (jk: JobKategorie, week: Date, einsatz?: Einsatz) => {\n"
    "    if (zPressedRef.current) {\n"
    "      setZusatzModal({ jk, woche: week })\n"
    "    } else {\n"
    "      setModal({ einsatz, jk, woche: week })\n"
    "    }\n"
    "  }"
)
new = (
    "  const handleCellClick = (jk: JobKategorie, week: Date, einsatz?: Einsatz) => {\n"
    "    if (zPressedRef.current) {\n"
    "      setModal({ jk, woche: week, isZusatz: true })\n"
    "    } else {\n"
    "      setModal({ einsatz, jk, woche: week })\n"
    "    }\n"
    "  }"
)
assert old in content, 'handleCellClick not found'
content = content.replace(old, new, 1)

# ── 4. getZusatzForCell: also include is_zusatz einsaetze ────────────────────
old = (
    "  function getZusatzForCell(jk: JobKategorie, weekDate: Date): Zusatz[] {\n"
    "    const wKey = dateKey(weekDate)\n"
    "    return zusatz.filter(z => z.job_kategorie_id === jk.id && (z.woche_von || '').slice(0, 10) === wKey)\n"
    "  }"
)
new = (
    "  function getZusatzForCell(jk: JobKategorie, weekDate: Date): (Zusatz | Einsatz)[] {\n"
    "    const wKey = dateKey(weekDate)\n"
    "    const legacy = zusatz.filter(z => z.job_kategorie_id === jk.id && (z.woche_von || '').slice(0, 10) === wKey)\n"
    "    const fromEinsaetze = einsaetze.filter(e => e.is_zusatz && e.job_kategorie_id === jk.id && (e.woche_von || '').slice(0, 10) === wKey)\n"
    "    return [...legacy, ...fromEinsaetze]\n"
    "  }"
)
assert old in content, 'getZusatzForCell not found'
content = content.replace(old, new, 1)

# ── 5. getSlotsForCell: exclude is_zusatz entries ────────────────────────────
old = "      if (e.job_kategorie_id !== jk.id) return false\n      if (e.status === 'abgesagt') return false"
new = "      if (e.job_kategorie_id !== jk.id) return false\n      if (e.is_zusatz) return false\n      if (e.status === 'abgesagt') return false"
assert old in content, 'getSlotsForCell filter not found'
content = content.replace(old, new, 1)

# ── 6. handleSaveEinsatz: pass is_zusatz ─────────────────────────────────────
old = (
    "  const handleSaveEinsatz = async (data: Partial<Einsatz>) => {\n"
    "    if (modal?.einsatz) {"
)
new = (
    "  const handleSaveEinsatz = async (data: Partial<Einsatz>) => {\n"
    "    if (modal?.isZusatz && !modal?.einsatz) data = { ...data, is_zusatz: true }\n"
    "    if (modal?.einsatz) {"
)
assert old in content, 'handleSaveEinsatz not found'
content = content.replace(old, new, 1)

print('Steps 1-6 done')

# ── 7. UUID-Erkennung im "!" Tooltip ─────────────────────────────────────────
old = (
    "            abs.abgesagt_am ? `${fmtDate(abs.abgesagt_am)}${abs.abgesagt_von ? ` · ${abs.abgesagt_von}` : ''}` : '',"
)
new = (
    "            abs.abgesagt_am ? `${fmtDate(abs.abgesagt_am)}${abs.abgesagt_von ? ` \u00b7 ${/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(abs.abgesagt_von) ? 'Nutzer' : abs.abgesagt_von}` : ''}` : '',"
)
assert old in content, 'Tooltip abgesagt_von not found'
content = content.replace(old, new, 1)

print('Step 7 done')

# ── 8. ZusatzpersonalModal aufrufe mit setZusatzModal → setModal ──────────────
# In Zusatz-Zeilen: setZusatzModal({ jk, woche: week }) → setModal({ jk, woche: week, isZusatz: true })
content = content.replace(
    'onClick={() => setZusatzModal({ jk, woche: week })}',
    'onClick={() => setModal({ jk, woche: week, isZusatz: true })}'
)

print('Step 8 done')

# ── 9. rowSpan fix: totalRows → globalMaxSlots für jk-Label-Zelle ────────────
old = "      rowSpan={totalRows} style={{"
new = "      rowSpan={globalMaxSlots} style={{"
assert old in content, 'rowSpan not found'
content = content.replace(old, new, 1)

# 9b. Remove "+ Zusatzpersonal" label from jk header
old = (
    "          {maxZusatz > 0 && (\n"
    "                            <div style={{ fontSize: 8, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>+ Zusatzpersonal</div>\n"
    "                          )}"
)
assert old in content, '+ Zusatzpersonal not found: ' + repr(content[content.find('Zusatzpersonal'):content.find('Zusatzpersonal')+300])
content = content.replace(old, '', 1)

print('Step 9 done')

# ── 10. Zusatz rows: add sticky first cell for zi===0 ────────────────────────
old = (
    "                // Zusatzpersonal-Zeilen (inline-Modus)\n"
    "                ...Array.from({ length: maxZusatz }, (_, zi) => (\n"
    "                  <tr key={`${jk.id}-zusatz-${zi}`}>\n"
    "                    {weeks.map((week, wi) => {"
)
new = (
    "                // Zusatzpersonal-Zeilen (inline-Modus)\n"
    "                ...Array.from({ length: maxZusatz }, (_, zi) => (\n"
    "                  <tr key={`${jk.id}-zusatz-${zi}`}>\n"
    "                    {zi === 0 && (\n"
    "                      <td rowSpan={maxZusatz} style={{\n"
    "                        position: 'sticky', left: 0, zIndex: 5,\n"
    "                        background: 'var(--bg-page)', borderRight: '1px solid var(--border)',\n"
    "                        borderBottom: '2px solid var(--border)',\n"
    "                        padding: '0 8px', width: LABEL_W, minWidth: LABEL_W,\n"
    "                        verticalAlign: 'middle',\n"
    "                      }}>\n"
    "                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 7 }}>\n"
    "                          <div style={{ width: 3, height: 14, borderRadius: 2, background: `${jk.farbe}60`, flexShrink: 0 }} />\n"
    "                          <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Zusatz</div>\n"
    "                        </div>\n"
    "                      </td>\n"
    "                    )}\n"
    "                    {weeks.map((week, wi) => {"
)
assert old in content, 'Zusatz rows not found'
content = content.replace(old, new, 1)

print('Step 10 done')

# ── 11. Zusatz-Zellen delete: check type ─────────────────────────────────────
# Currently: await fetch(`/api/autorenplan/zusatz/${z.id}`, { method: 'DELETE', credentials: 'include' })
# After: check if it's an Einsatz (has status field) → use einsaetze endpoint
old = "onClick={async e => { e.stopPropagation(); await fetch(`/api/autorenplan/zusatz/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData() }}"
new = "onClick={async e => { e.stopPropagation(); const ep = ('status' in (z as any)) ? 'einsaetze' : 'zusatz'; await fetch(`/api/autorenplan/${ep}/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData() }}"
assert old in content, 'Zusatz delete not found'
content = content.replace(old, new, 1)

print('Step 11 done')

# ── 12. ZusatzpersonalModal am Ende: remove from render ──────────────────────
old = (
    "      {zusatzModal && (\n"
    "        <ZusatzpersonalModal\n"
    "          jk={zusatzModal.jk}\n"
    "          woche={zusatzModal.woche}\n"
    "          produktionDbId={produktionDbId}\n"
    "          onSave={loadData}\n"
    "          onClose={() => setZusatzModal(null)}\n"
    "        />\n"
    "      )}"
)
assert old in content, 'ZusatzpersonalModal render not found'
content = content.replace(old, '', 1)

print('Step 12 done')

# ── 13. EinsatzModal title: show "Zusatzpersonal" if isZusatz ────────────────
# Find where EinsatzModal is rendered and check for modal open condition
# The EinsatzModal render should show title based on isZusatz
# Let's find the modal render in AutorenplanGrid and check context
# Actually EinsatzModal controls its own title - let's look at EinsatzModal header

# Find EinsatzModal header
old_header = "          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{isNew ? 'Einsatz planen' : 'Einsatz bearbeiten'}</h2>"
if old_header in content:
    # Need to know isZusatz from props - let's add a prop
    print('Step 13: EinsatzModal header found, will add isZusatz prop')
else:
    print('Step 13: EinsatzModal header not found - skipping')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('All done')
