path = r'C:\Users\jdiepers\Desktop\Serienwerft-apps\script-app\frontend\src\components\AutorenplanSettingsModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Finde Anfang und Ende von GagenkategorienTab
start_marker = '// ── GagenkategorienTab ────────────────────────────────────────────────────────\n'
end_marker = '\n// ── PausenkalenderTab ─────────────────────────────────────────────────────────'

idx_start = content.find(start_marker)
idx_end = content.find(end_marker)
assert idx_start >= 0, 'start not found'
assert idx_end >= 0, 'end not found'

new_tab = '''// ── GagenkategorienTab ────────────────────────────────────────────────────────

function GagenkategorienTab() {
  const [list, setList] = useState<GageKategorie[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<GageKategorie | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<Partial<GageKategorie>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/autorenplan/gage-kategorien', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setList(d.gage_kategorien || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const startNew = () => {
    const nextKat = list.reduce((max, g) => Math.max(max, g.kat_nr ?? 0), 0) + 1
    setForm({ label: '', kat_nr: nextKat })
    setIsNew(true)
    setEditing(null)
  }

  const startEdit = (gk: GageKategorie) => {
    setForm({ ...gk })
    setEditing(gk)
    setIsNew(false)
  }

  const cancel = () => { setEditing(null); setIsNew(false); setForm({}) }

  const save = async () => {
    if (!form.label?.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        await fetch('/api/autorenplan/gage-kategorien', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else if (editing) {
        await fetch(`/api/autorenplan/gage-kategorien/${editing.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      load()
      cancel()
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    await fetch(`/api/autorenplan/gage-kategorien/${id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  const inp: React.CSSProperties = {
    padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 12,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Globale Gagenkategorien</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Produktionsübergreifend — über Kat.-Nr. mit Einsätzen verknüpfbar
          </div>
        </div>
        <button onClick={startNew} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px',
          borderRadius: 7, border: 'none', background: '#000', color: '#fff',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={12} /> Neue Kategorie
        </button>
      </div>

      {/* Inline-Formular */}
      {(isNew || editing) && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Kat.-Nr.</label>
              <input type="number" min={1} style={{ ...inp, width: '100%', boxSizing: 'border-box', textAlign: 'center' }}
                value={form.kat_nr ?? ''} onChange={e => setForm(f => ({ ...f, kat_nr: e.target.value ? Number(e.target.value) : undefined }))} placeholder="1" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Bezeichnung *</label>
              <input style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                value={form.label ?? ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="z.B. Erstautor" autoFocus />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={cancel} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Abbrechen</button>
            <button onClick={save} disabled={saving || !form.label?.trim()} style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: !form.label?.trim() ? 0.4 : 1 }}>
              {saving ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: '20px 0' }}>Lade...</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 12 }}>Noch keine Gagenkategorien definiert.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', width: 60 }}>Kat.</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Bezeichnung</th>
                <th style={{ width: 80, borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {list.map((gk, i) => (
                <tr key={gk.id} style={{ background: i % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-subtle)' }}>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13 }}>
                    {gk.kat_nr ?? '\u2014'}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {gk.label}
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => startEdit(gk)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '3px 5px', borderRadius: 4 }}>
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => del(gk.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', padding: '3px 5px', borderRadius: 4 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
'''

content = content[:idx_start] + new_tab + content[idx_end:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
