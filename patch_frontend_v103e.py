path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanTab.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix both delete buttons for Zusatz (may have 2 occurrences)
old = "await fetch(`/api/autorenplan/zusatz/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData()"
new = "const ep = ('status' in (z as any)) ? 'einsaetze' : 'zusatz'; await fetch(`/api/autorenplan/${ep}/${z.id}`, { method: 'DELETE', credentials: 'include' }); loadData()"
count = content.count(old)
print(f'Found {count} occurrences')
assert count > 0, 'delete not found'
content = content.replace(old, new)  # replace ALL

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
