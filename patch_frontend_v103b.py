path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ── 9. rowSpan fix ────────────────────────────────────────────────────────────
old = (
    "                    <td rowSpan={totalRows} style={{\n"
    "                      position: 'sticky', left: 0, zIndex: 5,\n"
    "                      background: 'var(--bg-page)', borderRight: '1px solid var(--border)',\n"
    "                      borderBottom: '2px solid var(--border)',\n"
    "                      padding: '0 8px', height: ROW_H * totalRows || ROW_H,"
)
new = (
    "                    <td rowSpan={globalMaxSlots} style={{\n"
    "                      position: 'sticky', left: 0, zIndex: 5,\n"
    "                      background: 'var(--bg-page)', borderRight: '1px solid var(--border)',\n"
    "                      borderBottom: '2px solid var(--border)',\n"
    "                      padding: '0 8px', height: ROW_H * globalMaxSlots || ROW_H,"
)
assert old in content, 'rowSpan not found'
content = content.replace(old, new, 1)
print('rowSpan fixed')

# ── 9b. Remove "+ Zusatzpersonal" ────────────────────────────────────────────
# Find the exact text
idx = content.find('+ Zusatzpersonal')
if idx >= 0:
    # Find the surrounding div block
    # Look for the {maxZusatz > 0 && (...)} pattern around it
    block_start = content.rfind('{maxZusatz > 0 && (', 0, idx)
    block_end = content.find(')}', idx) + 2
    if block_start >= 0 and block_end > idx:
        snippet = content[block_start:block_end]
        print('Removing:', repr(snippet[:80]))
        content = content[:block_start] + content[block_end:]
        print('+ Zusatzpersonal removed')
    else:
        print('Could not find block boundaries, skipping')
else:
    print('+ Zusatzpersonal not found in file')

# ── 10. Zusatz rows: add sticky first cell ────────────────────────────────────
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

# ── 11. Zusatz-Zellen delete ─────────────────────────────────────────────────
old = "onClick={async e => { e.stopPropagation(); await fetch(`/api/autorenplan/zusatz/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData() }}"
new = "onClick={async e => { e.stopPropagation(); const ep = ('status' in (z as any)) ? 'einsaetze' : 'zusatz'; await fetch(`/api/autorenplan/${ep}/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData() }}"
assert old in content, 'Zusatz delete not found'
content = content.replace(old, new, 1)
print('Step 11 done')

# ── 12. Remove ZusatzpersonalModal render ────────────────────────────────────
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

# ── 13. EinsatzModal: show correct title + header info for Zusatz ─────────────
# Find EinsatzModal title rendering
old = "<h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{isNew ? 'Einsatz planen' : 'Einsatz bearbeiten'}</h2>"
if old in content:
    # We need to know if it's isZusatz - EinsatzModal doesn't have this prop yet
    # Actually we can check if jk context + title based on what we pass
    # Simplest: just update EinsatzModal to accept isZusatz prop
    # For now, let's just ensure the modal header shows correctly
    # We'll handle this by passing isZusatz to EinsatzModal
    print('Step 13: title needs prop - will handle separately')
else:
    print('Step 13: title pattern not found')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('All done')
