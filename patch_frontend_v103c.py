path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove ZusatzpersonalModal render (actual content)
old = (
    "      {zusatzModal && (\n"
    "        <ZusatzpersonalModal\n"
    "          jk={zusatzModal.jk}\n"
    "          woche={zusatzModal.woche}\n"
    "          produktionDbId={produktionDbId}\n"
    "          onSave={async () => { await loadData() }}\n"
    "          onClose={() => setZusatzModal(null)}\n"
    "        />\n"
    "      )}"
)
assert old in content, 'not found: ' + repr(content[content.find('zusatzModal && ('):content.find('zusatzModal && (')+300])
content = content.replace(old, '', 1)
print('ZusatzpersonalModal render removed')

# Remove zusatzModal state
old = "  const [zusatzModal, setZusatzModal] = useState<{ jk: JobKategorie; woche: Date } | null>(null)\n"
assert old in content, 'zusatzModal state not found'
content = content.replace(old, '', 1)
print('zusatzModal state removed')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
