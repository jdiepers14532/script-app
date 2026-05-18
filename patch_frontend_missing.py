path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Einsatz interface: add is_zusatz
old = "  gage_kat?: number\n  gage_kategorie_id?: string\n  erstellt_am?: string"
new = "  gage_kat?: number\n  gage_kategorie_id?: string\n  is_zusatz?: boolean\n  erstellt_am?: string"
if old in content:
    content = content.replace(old, new, 1)
    print('1. is_zusatz interface: done')
else:
    print('1. is_zusatz interface: already applied or not found')

# 2. modal state type: add isZusatz (state declaration already trimmed from zusatzModal)
old = "  const [modal, setModal] = useState<{ einsatz?: Einsatz; jk: JobKategorie; woche: Date } | null>(null)"
new = "  const [modal, setModal] = useState<{ einsatz?: Einsatz; jk: JobKategorie; woche: Date; isZusatz?: boolean } | null>(null)"
if old in content:
    content = content.replace(old, new, 1)
    print('2. modal isZusatz: done')
else:
    print('2. modal isZusatz: already applied or not found')

# 3. handleCellClick: setZusatzModal → setModal(isZusatz)
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
if old in content:
    content = content.replace(old, new, 1)
    print('3. handleCellClick: done')
else:
    print('3. handleCellClick: already applied or not found')

# 4. getZusatzForCell: also include is_zusatz einsaetze
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
if old in content:
    content = content.replace(old, new, 1)
    print('4. getZusatzForCell: done')
else:
    print('4. getZusatzForCell: already applied or not found')

# 5. getSlotsForCell: exclude is_zusatz entries
old = "      if (e.job_kategorie_id !== jk.id) return false\n      if (e.status === 'abgesagt') return false"
new = "      if (e.job_kategorie_id !== jk.id) return false\n      if (e.is_zusatz) return false\n      if (e.status === 'abgesagt') return false"
if old in content:
    content = content.replace(old, new, 1)
    print('5. getSlotsForCell: done')
else:
    print('5. getSlotsForCell: already applied or not found')

# 6. handleSaveEinsatz: pass is_zusatz
old = (
    "  const handleSaveEinsatz = async (data: Partial<Einsatz>) => {\n"
    "    if (modal?.einsatz) {"
)
new = (
    "  const handleSaveEinsatz = async (data: Partial<Einsatz>) => {\n"
    "    if (modal?.isZusatz && !modal?.einsatz) data = { ...data, is_zusatz: true }\n"
    "    if (modal?.einsatz) {"
)
if old in content:
    content = content.replace(old, new, 1)
    print('6. handleSaveEinsatz: done')
else:
    print('6. handleSaveEinsatz: already applied or not found')

# 7. UUID-Erkennung im Tooltip - einfachere Variante
old = "abs.abgesagt_am ? `${fmtDate(abs.abgesagt_am)}${abs.abgesagt_von ? ` · ${abs.abgesagt_von}` : ''}` : '',"
new = "abs.abgesagt_am ? `${fmtDate(abs.abgesagt_am)}${abs.abgesagt_von ? ` · ${/^[0-9a-f]{8}-/.test(abs.abgesagt_von) ? 'Nutzer' : abs.abgesagt_von}` : ''}` : '',"
if old in content:
    content = content.replace(old, new, 1)
    print('7. UUID tooltip: done')
else:
    print('7. UUID tooltip: not found - checking alternative')
    # Maybe backtick template is encoded differently
    idx = content.find('abgesagt_von ? ` \u00b7 ${abs.abgesagt_von}')
    if idx >= 0:
        print('  found unicode middle dot version')
    idx2 = content.find('abgesagt_von}` : \'\'}` : \'\',')
    print('  idx2:', idx2)
    print('  context:', repr(content[content.find('abs.abgesagt_am ?'):content.find('abs.abgesagt_am ?')+200]))

# 8. Alle verbleibenden setZusatzModal → setModal
count = content.count('setZusatzModal({ jk, woche: week })')
print(f'8. Remaining setZusatzModal calls: {count}')
content = content.replace(
    'onClick={() => setZusatzModal({ jk, woche: week })}',
    'onClick={() => setModal({ jk, woche: week, isZusatz: true })}'
)
# Also the one in separate section
content = content.replace('setZusatzModal({ jk, woche: week })', 'setModal({ jk, woche: week, isZusatz: true })')
remaining = content.count('setZusatzModal')
print(f'   Remaining after replace: {remaining}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('\nAll done')
