path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanSettingsModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

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

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
