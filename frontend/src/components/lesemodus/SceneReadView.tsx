import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api/client'
import { renderSKTemplate } from '../../sw-ui/SzenenKopfVorlagenEditor'
import UniversalEditor from '../editor/UniversalEditor'

interface SceneReadViewProps {
  sceneIdentityId: string
  werkstufeId: string
  produktionId: string
  folgeNummer?: number | null
}

// ── Szenenkopf-Felder für renderSKTemplate aus den Szenendaten bauen ──────────
// Werte entsprechen der Backend-Logik (skChipValue); Kürzel-Fallbacks wie DEFAULT_SCENE_KUERZEL.
const IE_KUERZEL: Record<string, string> = { int: 'I', ext: 'E', 'int/ext': 'I/E' }
const TZ_KUERZEL: Record<string, string> = { tag: 'T', nacht: 'N', abend: 'A', morgen: 'M', daemmerung: 'D', 'dämmerung': 'D' }

function buildSKFields(sz: any, folgeNummer: number | null | undefined, rollen: string[]): Record<string, string> {
  const ie = (sz.int_ext ?? '').toLowerCase()
  const tz = (sz.tageszeit ?? '').toLowerCase()
  return {
    szene_nr: sz.scene_nummer != null ? `${sz.scene_nummer}${sz.scene_nummer_suffix ?? ''}` : '',
    motiv: sz.ort_name ?? '',
    innen_aussen: sz.int_ext ?? '',
    innen_aussen_kurz: IE_KUERZEL[ie] ?? (sz.int_ext?.charAt(0) ?? ''),
    tageszeit_lang: sz.tageszeit ?? '',
    tageszeit_kurz: TZ_KUERZEL[tz] ?? (sz.tageszeit?.charAt(0) ?? ''),
    spielzeit: sz.spielzeit ?? '',
    dt: sz.spieltag != null ? String(sz.spieltag) : '',
    oneliner: sz.zusammenfassung ?? '',
    info: sz.szeneninfo ?? '',
    notiz: sz.notiz ?? '',
    sondertyp: sz.sondertyp ?? '',
    rollen: rollen.join(', '),
    episode: folgeNummer != null ? String(folgeNummer) : '',
    page_length: sz.seiten ?? sz.page_length ?? '',
  }
}

/**
 * Generische Lese-Ansicht EINER Szene — rein im Browser, KEIN PDF:
 * Szenenkopf (im konfigurierten Format via renderSKTemplate) als erste Zeilen,
 * darunter der Content read-only über UniversalEditor. Das A4-Blatt mit Schatten
 * und die Seitenende-Markierung am Rand liefert PageWrapper (in UniversalEditor).
 *
 * Wiederverwendbar: Szenen-Lese-Modal und der geplante Anmerkungs-Lesemodus.
 */
export default function SceneReadView({ sceneIdentityId, werkstufeId, produktionId, folgeNummer }: SceneReadViewProps) {
  const [szene, setSzene] = useState<any | null>(null)
  const [absatzformate, setAbsatzformate] = useState<any[]>([])
  const [skTemplate, setSkTemplate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setSzene(null)
    Promise.all([
      api.resolveDokumentSzene(werkstufeId, sceneIdentityId),
      api.getAbsatzformate(produktionId),
      api.getAbsatzformatPresets().catch(() => []),
    ]).then(([sz, af, presets]) => {
      if (cancelled) return
      setSzene(sz)
      setAbsatzformate(Array.isArray(af?.formate) ? af.formate : [])
      // Szenenkopf-Template: zugewiesenes Preset, sonst erstes (gleiche Default-Logik wie der Editor)
      const list = Array.isArray(presets) ? presets : []
      const applied = af?.applied_preset_id ? list.find((p: any) => p.id === af.applied_preset_id) : null
      const chosen = applied ?? list[0] ?? null
      setSkTemplate(chosen?.szenen_kopf_template ?? null)
    }).catch((e: any) => {
      if (!cancelled) setError(e?.data?.error || 'Szene konnte nicht geladen werden')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sceneIdentityId, werkstufeId, produktionId])

  // Szenenkopf-Zeilen + Content zu EINEM Tiptap-Doc kombinieren (Szenenkopf oben aufs Blatt)
  const content = useMemo(() => {
    if (!szene) return null
    const base = szene.content && typeof szene.content === 'object' && Array.isArray(szene.content.content)
      ? szene.content
      : { type: 'doc', content: [] }

    let kopfNodes: any[] = []
    if (skTemplate) {
      const fields = buildSKFields(szene, folgeNummer, [])
      const zeilen = renderSKTemplate(skTemplate, fields)
      kopfNodes = zeilen
        .filter(z => z !== '---')
        .map(z => ({
          type: 'paragraph',
          attrs: { textTransform: 'uppercase' },
          content: z.trim() ? [{ type: 'text', marks: [{ type: 'bold' }], text: z.replace(/\t/g, '  ') }] : [],
        }))
    }
    return { type: 'doc', content: [...kopfNodes, ...(base.content ?? [])] }
  }, [szene, skTemplate, folgeNummer])

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>Lädt Szene…</div>
  if (error) return <div style={{ padding: 24, color: 'var(--danger, #FF3B30)', fontSize: 13 }}>{error}</div>
  if (!content) return null

  return (
    <UniversalEditor
      readOnly
      showShadow
      seitenformat="a4"
      kategorie={szene?.format ?? 'drehbuch'}
      initialContent={content}
      absatzformate={absatzformate}
      produktionId={produktionId}
      suppressLineNumbers
    />
  )
}
