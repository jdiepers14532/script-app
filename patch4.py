path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanSettingsModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ABRECHNUNGSTYPEN Konstante entfernen (nicht mehr gebraucht in Settings-Modal)
old = (
    "const ABRECHNUNGSTYPEN = [\n"
    "  { id: 'pauschal',  label: 'Pauschal' },\n"
    "  { id: 'pro_woche', label: 'Pro Woche' },\n"
    "  { id: 'pro_tag',   label: 'Pro Tag' },\n"
    "  { id: 'pro_buch',  label: 'Pro Buch' },\n"
    "  { id: 'pro_monat', label: 'Pro Monat' },\n"
    "  { id: 'pro_block', label: 'Pro Block' },\n"
    "]\n"
    "\n"
    "const MONATE"
)
new = "const MONATE"
assert old in content, 'ABRECHNUNGSTYPEN not found: ' + repr(content[content.find('const ABRECHNUNGSTYPEN'):content.find('const ABRECHNUNGSTYPEN')+300])
content = content.replace(old, new, 1)

# Interface prüfen - falls noch alte Felder drin
print('Interface check:', content[content.find('interface GageKategorie'):content.find('interface GageKategorie')+120])

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
