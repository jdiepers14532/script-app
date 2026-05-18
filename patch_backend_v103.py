path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\backend\src\routes\autorenplan.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. uname() Fix: email als Fallback vor UUID
old = "  return req.user?.name || req.user?.user_id || 'unknown'"
new = "  return req.user?.name?.trim() || req.user?.email?.split('@')[0] || req.user?.user_id || 'unknown'"
assert old in content, 'uname not found: ' + repr(content[content.find('uname'):content.find('uname')+200])
content = content.replace(old, new, 1)

# 2. POST einsaetze: is_zusatz in destructuring
old = "    von_datum, bis_datum, gage_kat, gage_kategorie_id,\n  } = req.body\n\n  if (!produktion_db_id || !woche_von"
new = "    von_datum, bis_datum, gage_kat, gage_kategorie_id, is_zusatz,\n  } = req.body\n\n  if (!produktion_db_id || !woche_von"
assert old in content, 'POST destructuring not found'
content = content.replace(old, new, 1)

# 3. POST INSERT: add is_zusatz column
old = "        von_datum, bis_datum, gage_kat, gage_kategorie_id, erstellt_von)\n     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)"
new = "        von_datum, bis_datum, gage_kat, gage_kategorie_id, is_zusatz, erstellt_von)\n     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)"
assert old in content, 'POST INSERT not found'
content = content.replace(old, new, 1)

# 4. POST VALUES array: add is_zusatz before uid(req)
old = "      von_datum || null, bis_datum || null, gage_kat ?? null, gage_kategorie_id || null,\n      uid(req),"
new = "      von_datum || null, bis_datum || null, gage_kat ?? null, gage_kategorie_id || null, is_zusatz ?? false,\n      uid(req),"
assert old in content, 'POST values not found'
content = content.replace(old, new, 1)

# 5. PUT destructuring: add is_zusatz (different context than POST)
old = "    von_datum, bis_datum, gage_kat, gage_kategorie_id,\n  } = req.body\n\n  // Alten Status lesen"
new = "    von_datum, bis_datum, gage_kat, gage_kategorie_id, is_zusatz,\n  } = req.body\n\n  // Alten Status lesen"
assert old in content, 'PUT destructuring not found: ' + repr(content[content.find('von_datum, bis_datum, gage_kat, gage_kategorie_id,\n  } = req.body\n\n  // Alten Status'):content.find('von_datum, bis_datum, gage_kat, gage_kategorie_id,\n  } = req.body\n\n  // Alten Status')+200])
content = content.replace(old, new, 1)

# 6. PUT SET clause: add is_zusatz field + renumber WHERE
old = (
    "       gage_kat               = $15,\n"
    "       gage_kategorie_id      = $16,\n"
    "       aktualisiert_am        = NOW()\n"
    "     WHERE id = $17"
)
new = (
    "       gage_kat               = $15,\n"
    "       gage_kategorie_id      = $16,\n"
    "       is_zusatz              = COALESCE($17, is_zusatz),\n"
    "       aktualisiert_am        = NOW()\n"
    "     WHERE id = $18"
)
assert old in content, 'PUT SET not found'
content = content.replace(old, new, 1)

# 7. PUT params array: add is_zusatz
old = "      von_datum ?? null, bis_datum ?? null, gage_kat ?? null, gage_kategorie_id || null,\n      req.params.id,"
new = "      von_datum ?? null, bis_datum ?? null, gage_kat ?? null, gage_kategorie_id || null, is_zusatz ?? null,\n      req.params.id,"
assert old in content, 'PUT params not found'
content = content.replace(old, new, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Backend patched')
