path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. EinsatzModal Props: add isZusatz
old = (
    "  einsaetze?: Einsatz[]\n"
    "  onSave: (data: Partial<Einsatz>) => Promise<void>\n"
    "  onDelete?: () => Promise<void>\n"
    "  onClose: () => void\n"
    "}) {"
)
new = (
    "  einsaetze?: Einsatz[]\n"
    "  isZusatz?: boolean\n"
    "  onSave: (data: Partial<Einsatz>) => Promise<void>\n"
    "  onDelete?: () => Promise<void>\n"
    "  onClose: () => void\n"
    "}) {"
)
assert old in content, 'EinsatzModal props not found'
content = content.replace(old, new, 1)

# 2. Destructure isZusatz in EinsatzModal function
old = (
    "  einsatz, jk, wocheDatum, produktionDbId, blockInfo, blockLabel, folgeLabel,\n"
    "  einsaetze, onSave, onDelete, onClose,"
)
new = (
    "  einsatz, jk, wocheDatum, produktionDbId, blockInfo, blockLabel, folgeLabel,\n"
    "  einsaetze, isZusatz, onSave, onDelete, onClose,"
)
assert old in content, 'EinsatzModal destructure not found'
content = content.replace(old, new, 1)

# 3. Title: use isZusatz
old = "            <div style={{ fontSize: 14, fontWeight: 700 }}>{isNew ? 'Einsatz anlegen' : 'Einsatz bearbeiten'}</div>"
new = "            <div style={{ fontSize: 14, fontWeight: 700 }}>{isNew ? (isZusatz ? 'Zusatzpersonal planen' : 'Einsatz anlegen') : (isZusatz ? 'Zusatzpersonal bearbeiten' : 'Einsatz bearbeiten')}</div>"
assert old in content, 'title not found'
content = content.replace(old, new, 1)

# 4. Pass isZusatz to EinsatzModal render
old = (
    "          einsaetze={einsaetze}\n"
    "          onSave={handleSaveEinsatz}\n"
    "          onDelete={modal.einsatz ? () => handleDeleteEinsatz(modal.einsatz!.id) : undefined}"
)
new = (
    "          einsaetze={einsaetze}\n"
    "          isZusatz={modal.isZusatz}\n"
    "          onSave={handleSaveEinsatz}\n"
    "          onDelete={modal.einsatz ? () => handleDeleteEinsatz(modal.einsatz!.id) : undefined}"
)
assert old in content, 'EinsatzModal render not found'
content = content.replace(old, new, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
