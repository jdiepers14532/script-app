import { Router } from 'express'
import { query, queryOne, pool } from '../db'
import { authMiddleware } from '../auth'
import { prodQueryOne } from '../prodDb'

const router = Router()

router.use(authMiddleware)

// GET /api/produktionen/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM produktionen WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Produktion nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/produktionen/:id/bloecke — live from ProdDB, no local copy
router.get('/:id/bloecke', async (req, res) => {
  try {
    const produktion = await queryOne('SELECT * FROM produktionen WHERE id = $1', [req.params.id])
    if (!produktion) return res.status(404).json({ error: 'Produktion nicht gefunden' })
    if (!produktion.produktion_db_id) return res.json([])

    const prod = await prodQueryOne(
      'SELECT erster_block, bloecke FROM productions WHERE id = $1',
      [produktion.produktion_db_id]
    )
    if (!prod?.bloecke?.length) return res.json([])

    res.json(prod.bloecke.map((entry: any, i: number) => ({
      proddb_id: entry.id,
      block_nummer: prod.erster_block + i,
      team_index: entry.team_index ?? null,
      folge_von: entry.folge_von ?? null,
      folge_bis: entry.folge_bis ?? null,
      dreh_von: entry.dreh_von || null,
      dreh_bis: entry.dreh_bis || null,
      drehtage: entry.drehtage || null,
    })))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/produktionen/:id/copy-preview?source=:sourceId — preview counts/labels for copy modal
router.get('/:id/copy-preview', async (req, res) => {
  const sourceId = req.query.source as string
  if (!sourceId) return res.status(400).json({ error: 'source query param required' })
  try {
    const [
      settings,
      kategorienCnt, charFelderCnt, labelsCnt, colorsCnt,
      revEinst, vorstoppEinst, absatzCnt, kfRows, vorlagenCnt,
      stockshotCnt, glossarCnt, autorenKatCnt,
      freieLabelsCnt, deskriptorCnt, rollenFreigabeRow,
      stimmungenCnt,
    ] = await Promise.all([
      pool.query('SELECT key, value FROM production_app_settings WHERE production_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM character_kategorien WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM charakter_felder_config WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM stage_labels WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM revision_colors WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT * FROM revision_export_einstellungen WHERE produktion_id = $1 LIMIT 1', [sourceId]),
      pool.query('SELECT * FROM vorstopp_einstellungen WHERE produktion_id = $1 LIMIT 1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM absatzformate WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT werkstufe_typ, kopfzeile_aktiv, fusszeile_aktiv FROM kopf_fusszeilen_defaults WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM dokument_vorlagen WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM stockshot_templates WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM dk_glossar WHERE production_id = $1', [sourceId]),
      pool.query(`SELECT COUNT(*) FROM autorenplan_job_kategorien ak
                  JOIN produktionen p ON p.produktion_db_id = ak.produktion_db_id
                  WHERE p.id = $1`, [sourceId]),
      pool.query('SELECT COUNT(*) FROM freie_dokument_labels WHERE produktion_id = $1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM deskriptor_vorlagen WHERE production_id = $1', [sourceId]),
      pool.query('SELECT freigabe_aktiv FROM rollen_freigabe_konfiguration WHERE production_id = $1 LIMIT 1', [sourceId]),
      pool.query('SELECT COUNT(*) FROM tageszeit_stimmungen WHERE production_id = $1', [sourceId]),
    ])

    const s: Record<string, string> = {}
    for (const row of settings.rows) s[row.key] = row.value

    let kuerzelLabel = 'Standard (I/E/T/N/D/A)'
    if (s.scene_kuerzel) {
      try {
        const k = JSON.parse(s.scene_kuerzel)
        kuerzelLabel = `${k.int || 'I'}/${k.ext || 'E'}/${k.tag || 'T'}/${k.nacht || 'N'}/${k.daemmerung || 'D'}/${k.abend || 'A'}`
      } catch {}
    }

    let lnLabel = 'Standard'
    if (s.ln_settings) {
      try {
        const l = JSON.parse(s.ln_settings)
        const fam = l.fontFamily?.includes('Courier Prime') ? 'Courier Prime'
          : l.fontFamily?.includes('Courier New') ? 'Courier New'
          : l.fontFamily?.includes('Inter') ? 'Inter'
          : (l.fontFamily?.split(',')[0] ?? '').replace(/['"]/g, '').trim()
        lnLabel = `${fam}, ${l.fontSizePt ?? 10}pt`
      } catch {}
    }

    let replikLabel = 'Standard'
    if (s.replik_settings) {
      try {
        const r = JSON.parse(s.replik_settings)
        replikLabel = r.mode === 'per_scene' ? `pro Szene, ${r.color}` : `durchgehend, ${r.color}`
      } catch {}
    }

    let seitenformatLabel = (s.seitenformat ?? 'a4').toUpperCase()
    if (s.page_margin_mm) {
      try {
        const m = JSON.parse(s.page_margin_mm)
        seitenformatLabel += `, ${m.links ?? 25}/${m.rechts ?? 25}/${m.oben ?? 25}/${m.unten ?? 20}mm`
      } catch {}
    }

    let dailyLabel = '—'
    if (s.daily_regeln) {
      try {
        const d = JSON.parse(s.daily_regeln)
        dailyLabel = d.enabled ? 'aktiv' : 'inaktiv'
      } catch { dailyLabel = 'konfiguriert' }
    }

    const revE = revEinst.rows[0]
    const vsE = vorstoppEinst.rows[0]
    const konfKF = (kfRows.rows as any[]).filter(r => r.kopfzeile_aktiv || r.fusszeile_aktiv)
    const autorenCnt = parseInt(autorenKatCnt.rows[0]?.count ?? '0')
    const stimmCnt = parseInt(stimmungenCnt.rows[0]?.count ?? '0')

    res.json({
      darstellung: {
        datumsformat:    { label: s.datumsformat === 'en' ? 'Englisch (MM/DD/YYYY)' : 'Deutsch (TT.MM.JJJJ)' },
        scene_kuerzel:   { label: kuerzelLabel },
        szenenfarben:    { label: s.scene_env_colors ? 'angepasst' : 'Standard' },
        ln_settings:     { label: lnLabel },
        replik_settings: { label: replikLabel },
        stimmungen:      { count: stimmCnt, label: stimmCnt > 0 ? `${stimmCnt} Stimmungen` : '—' },
      },
      terminologie: {
        treatment_label:    { label: s.treatment_label ?? 'Treatment' },
        glossar:            { count: parseInt(glossarCnt.rows[0].count), label: `${glossarCnt.rows[0].count} Einträge` },
        terminologie_config: { label: s.terminologie ? 'konfiguriert' : 'Standard' },
        figuren_label:      { label: s.figuren_label ?? 'Rollen' },
      },
      figuren: {
        kategorien:       { count: parseInt(kategorienCnt.rows[0].count), label: `${kategorienCnt.rows[0].count} Kategorien` },
        charakter_felder: { count: parseInt(charFelderCnt.rows[0].count), label: `${charFelderCnt.rows[0].count} Felder` },
        suffix_settings:  { label: s.suffix_settings ? 'konfiguriert' : 'Standard' },
      },
      fassungen: {
        labels:           { count: parseInt(labelsCnt.rows[0].count), label: `${labelsCnt.rows[0].count} Labels` },
        colors:           { count: parseInt(colorsCnt.rows[0].count), label: `${colorsCnt.rows[0].count} Farben` },
        einstellungen:    { label: revE ? `${revE.memo_schwellwert_zeichen} Zeichen Memo-Schwelle` : '—' },
        vorstopp:         { label: vsE ? `${vsE.menge} ${vsE.methode === 'seiten' ? 'Seiten' : 'Zeichen'} = ${Math.round(vsE.dauer_sekunden / 60)} Min` : '—' },
      },
      format: {
        absatzformate:        { count: parseInt(absatzCnt.rows[0].count), label: `${absatzCnt.rows[0].count} Formate` },
        seitenformat_margins: { label: seitenformatLabel },
        kopf_fusszeilen:      { count: konfKF.length, label: konfKF.length > 0 ? `${konfKF.length} Typ${konfKF.length > 1 ? 'en' : ''} konfiguriert` : '—' },
        vorlagen:             { count: parseInt(vorlagenCnt.rows[0].count), label: `${vorlagenCnt.rows[0].count} Vorlagen` },
        stockshot_templates:  { count: parseInt(stockshotCnt.rows[0].count), label: `${stockshotCnt.rows[0].count} Templates` },
        freie_dok_labels:     { count: parseInt(freieLabelsCnt.rows[0].count), label: `${freieLabelsCnt.rows[0].count} Labels` },
      },
      sonstige: {
        daily_regeln:              { label: dailyLabel },
        statistik_config:          { label: s.statistik_config ? 'konfiguriert' : 'Standard' },
        statistik_modal_config:    { label: s.statistik_modal_config ? 'konfiguriert' : 'Standard' },
        sonstige_dokumente_format: { label: s.sonstige_dokumente_format ? 'konfiguriert' : 'Standard' },
        drehbuch_checks:           { label: s.drehbuch_checks ? 'konfiguriert' : 'Standard' },
        synopsis_settings:         { label: s.synopsis_settings ? 'konfiguriert' : 'Standard' },
        inhaltskennzeichnung:      { count: parseInt(deskriptorCnt.rows[0].count), label: `${deskriptorCnt.rows[0].count} Vorlagen` },
        rollen_freigabe_config:    { label: rollenFreigabeRow.rows[0] ? (rollenFreigabeRow.rows[0].freigabe_aktiv ? 'aktiv' : 'konfiguriert') : '—' },
        snapshot_settings:         { label: s.snapshot_settings ? 'konfiguriert' : 'Standard' },
      },
      autorenplan: {
        autorenplan_kategorien: { count: autorenCnt, label: autorenCnt > 0 ? `${autorenCnt} Job-Kategorien` : '—' },
      },
    })
  } catch (err) {
    console.error('copy-preview error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:id/copy-settings — copy settings from another produktion (atomic)
router.post('/:id/copy-settings', async (req, res) => {
  const { source_produktion_id, sections, merge_mode } = req.body
  const targetId = req.params.id
  const merge = merge_mode === true

  if (!source_produktion_id || !Array.isArray(sections) || !sections.length) {
    return res.status(400).json({ error: 'source_produktion_id und sections erforderlich' })
  }
  const ALLOWED = [
    'kategorien', 'labels', 'colors', 'einstellungen', 'absatzformate', 'vorlagen',
    'datumsformat', 'scene_kuerzel', 'szenenfarben', 'ln_settings', 'replik_settings',
    'treatment_label', 'glossar', 'charakter_felder', 'vorstopp', 'seitenformat_margins',
    'kopf_fusszeilen', 'stockshot_templates', 'daily_regeln', 'statistik_config', 'autorenplan_kategorien',
    'statistik_modal_config', 'sonstige_dokumente_format',
    'freie_dok_labels', 'drehbuch_checks', 'synopsis_settings', 'inhaltskennzeichnung', 'rollen_freigabe_config',
    'stimmungen', 'terminologie_config', 'figuren_label', 'suffix_settings', 'snapshot_settings',
  ]
  const invalid = (sections as string[]).filter(s => !ALLOWED.includes(s))
  if (invalid.length) return res.status(400).json({ error: `Ungültige Sections: ${invalid.join(', ')}` })

  // Helper: copy a single key from production_app_settings (always upsert)
  const copyAppSetting = async (client: any, key: string) => {
    const src = await client.query(
      'SELECT value FROM production_app_settings WHERE production_id = $1 AND key = $2',
      [source_produktion_id, key]
    )
    if (src.rows.length) {
      await client.query(
        `INSERT INTO production_app_settings (production_id, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (production_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
        [targetId, key, src.rows[0].value]
      )
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Single-value app settings (always replace) ──────────────────────────
    if (sections.includes('datumsformat'))    await copyAppSetting(client, 'datumsformat')
    if (sections.includes('scene_kuerzel'))   await copyAppSetting(client, 'scene_kuerzel')
    if (sections.includes('szenenfarben')) {
      await copyAppSetting(client, 'scene_env_colors')
      await copyAppSetting(client, 'scene_env_colors_dark')
    }
    if (sections.includes('ln_settings'))     await copyAppSetting(client, 'ln_settings')
    if (sections.includes('replik_settings')) await copyAppSetting(client, 'replik_settings')
    if (sections.includes('treatment_label')) await copyAppSetting(client, 'treatment_label')
    if (sections.includes('daily_regeln'))    await copyAppSetting(client, 'daily_regeln')
    if (sections.includes('statistik_config'))         await copyAppSetting(client, 'statistik_config')
    if (sections.includes('statistik_modal_config'))   await copyAppSetting(client, 'statistik_modal_config')
    if (sections.includes('sonstige_dokumente_format')) await copyAppSetting(client, 'sonstige_dokumente_format')
    if (sections.includes('drehbuch_checks'))            await copyAppSetting(client, 'drehbuch_checks')
    if (sections.includes('synopsis_settings'))          await copyAppSetting(client, 'synopsis_settings')
    if (sections.includes('seitenformat_margins')) {
      await copyAppSetting(client, 'seitenformat')
      await copyAppSetting(client, 'page_margin_mm')
    }
    if (sections.includes('terminologie_config')) await copyAppSetting(client, 'terminologie')
    if (sections.includes('figuren_label'))       await copyAppSetting(client, 'figuren_label')
    if (sections.includes('suffix_settings'))     await copyAppSetting(client, 'suffix_settings')
    if (sections.includes('snapshot_settings'))   await copyAppSetting(client, 'snapshot_settings')

    // ── Vorstopp (single-row upsert) ────────────────────────────────────────
    if (sections.includes('vorstopp')) {
      const src = await client.query('SELECT * FROM vorstopp_einstellungen WHERE produktion_id = $1', [source_produktion_id])
      if (src.rows.length) {
        const e = src.rows[0]
        await client.query(
          `INSERT INTO vorstopp_einstellungen (produktion_id, methode, menge, dauer_sekunden)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (produktion_id) DO UPDATE SET methode=$2, menge=$3, dauer_sekunden=$4, updated_at=NOW()`,
          [targetId, e.methode, e.menge, e.dauer_sekunden]
        )
      }
    }

    // ── Revisions-Export (single-row upsert) ────────────────────────────────
    if (sections.includes('einstellungen')) {
      const src = await client.query('SELECT * FROM revision_export_einstellungen WHERE produktion_id = $1', [source_produktion_id])
      if (src.rows.length) {
        await client.query(
          `INSERT INTO revision_export_einstellungen (produktion_id, memo_schwellwert_zeichen)
           VALUES ($1, $2)
           ON CONFLICT (produktion_id) DO UPDATE SET memo_schwellwert_zeichen = $2`,
          [targetId, src.rows[0].memo_schwellwert_zeichen]
        )
      }
    }

    // ── Charakter-Kategorien ────────────────────────────────────────────────
    if (sections.includes('kategorien')) {
      const src = await client.query('SELECT * FROM character_kategorien WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM character_kategorien WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          await client.query(
            `INSERT INTO character_kategorien (produktion_id, name, typ, sort_order)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [targetId, row.name, row.typ, row.sort_order]
          )
        } else {
          await client.query(
            'INSERT INTO character_kategorien (produktion_id, name, typ, sort_order) VALUES ($1, $2, $3, $4)',
            [targetId, row.name, row.typ, row.sort_order]
          )
        }
      }
    }

    // ── Stage Labels ────────────────────────────────────────────────────────
    if (sections.includes('labels')) {
      const src = await client.query('SELECT * FROM stage_labels WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM stage_labels WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query('SELECT id FROM stage_labels WHERE produktion_id=$1 AND name=$2', [targetId, row.name])
          if (exists.rows.length) continue
        }
        await client.query(
          'INSERT INTO stage_labels (produktion_id, name, sort_order, is_produktionsfassung) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.sort_order, row.is_produktionsfassung]
        )
      }
    }

    // ── Revisions-Farben ────────────────────────────────────────────────────
    if (sections.includes('colors')) {
      const src = await client.query('SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM revision_colors WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query('SELECT id FROM revision_colors WHERE produktion_id=$1 AND name=$2', [targetId, row.name])
          if (exists.rows.length) continue
        }
        await client.query(
          'INSERT INTO revision_colors (produktion_id, name, color, sort_order) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.color, row.sort_order]
        )
      }
    }

    // ── Glossar ─────────────────────────────────────────────────────────────
    if (sections.includes('glossar')) {
      const src = await client.query('SELECT * FROM dk_glossar WHERE production_id = $1 ORDER BY sort_order, kuerzel', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM dk_glossar WHERE production_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query('SELECT id FROM dk_glossar WHERE production_id=$1 AND kuerzel=$2', [targetId, row.kuerzel])
          if (exists.rows.length) continue
        }
        await client.query(
          `INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [targetId, row.kuerzel, row.name, row.erklaerung, row.sort_order]
        )
      }
    }

    // ── Charakter-Felder ────────────────────────────────────────────────────
    if (sections.includes('charakter_felder')) {
      const src = await client.query('SELECT * FROM charakter_felder_config WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM charakter_felder_config WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query(
            'SELECT id FROM charakter_felder_config WHERE produktion_id=$1 AND name=$2 AND gilt_fuer=$3',
            [targetId, row.name, row.gilt_fuer]
          )
          if (exists.rows.length) continue
        }
        await client.query(
          `INSERT INTO charakter_felder_config (produktion_id, name, typ, optionen, sort_order, gilt_fuer)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [targetId, row.name, row.typ, JSON.stringify(row.optionen), row.sort_order, row.gilt_fuer]
        )
      }
    }

    // ── Absatzformate ───────────────────────────────────────────────────────
    // enter_next_format / tab_next_format sind FK-Selbstreferenzen (UUID):
    // Erst alle Formate ohne FK einfügen, dann FK-Spalten mit gemappten IDs updaten.
    if (sections.includes('absatzformate')) {
      const src = await client.query('SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM absatzformate WHERE produktion_id = $1', [targetId])
      const idMap: Record<string, string> = {}
      // Pass 1: einfügen ohne FK-Spalten
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query('SELECT id FROM absatzformate WHERE produktion_id=$1 AND name=$2', [targetId, row.name])
          if (exists.rows.length) { idMap[row.id] = exists.rows[0].id; continue }
        }
        const ins = await client.query(
          `INSERT INTO absatzformate (produktion_id, name, kuerzel, kategorie, font_family, font_size,
            bold, italic, underline, uppercase, text_align, margin_left, margin_right,
            space_before, space_after, line_height, sort_order, ist_standard, textbaustein, shortcut)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING id`,
          [targetId, row.name, row.kuerzel, row.kategorie, row.font_family, row.font_size,
            row.bold, row.italic, row.underline, row.uppercase, row.text_align,
            row.margin_left, row.margin_right, row.space_before, row.space_after,
            row.line_height, row.sort_order, row.ist_standard, row.textbaustein, row.shortcut]
        )
        idMap[row.id] = ins.rows[0].id
      }
      // Pass 2: FK-Spalten mit gemappten IDs aktualisieren
      for (const row of src.rows) {
        const newId = idMap[row.id]
        if (!newId || (!row.enter_next_format && !row.tab_next_format)) continue
        await client.query(
          `UPDATE absatzformate SET enter_next_format = $1, tab_next_format = $2 WHERE id = $3`,
          [
            row.enter_next_format ? (idMap[row.enter_next_format] ?? null) : null,
            row.tab_next_format   ? (idMap[row.tab_next_format]   ?? null) : null,
            newId,
          ]
        )
      }
    }

    // ── Kopf-/Fußzeilen (always upsert per werkstufe_typ) ──────────────────
    if (sections.includes('kopf_fusszeilen')) {
      const src = await client.query('SELECT * FROM kopf_fusszeilen_defaults WHERE produktion_id = $1', [source_produktion_id])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query(
            'SELECT id FROM kopf_fusszeilen_defaults WHERE produktion_id=$1 AND werkstufe_typ=$2 AND (kopfzeile_aktiv=true OR fusszeile_aktiv=true)',
            [targetId, row.werkstufe_typ]
          )
          if (exists.rows.length) continue
        }
        await client.query(
          `INSERT INTO kopf_fusszeilen_defaults
             (produktion_id, werkstufe_typ, kopfzeile_content, fusszeile_content,
              kopfzeile_aktiv, fusszeile_aktiv, erste_seite_kein_header,
              erste_seite_kein_footer, seiten_layout)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (produktion_id, werkstufe_typ) DO UPDATE SET
             kopfzeile_content=EXCLUDED.kopfzeile_content,
             fusszeile_content=EXCLUDED.fusszeile_content,
             kopfzeile_aktiv=EXCLUDED.kopfzeile_aktiv,
             fusszeile_aktiv=EXCLUDED.fusszeile_aktiv,
             erste_seite_kein_header=EXCLUDED.erste_seite_kein_header,
             erste_seite_kein_footer=EXCLUDED.erste_seite_kein_footer,
             seiten_layout=EXCLUDED.seiten_layout,
             updated_at=NOW()`,
          [targetId, row.werkstufe_typ,
            row.kopfzeile_content ? JSON.stringify(row.kopfzeile_content) : null,
            row.fusszeile_content ? JSON.stringify(row.fusszeile_content) : null,
            row.kopfzeile_aktiv, row.fusszeile_aktiv,
            row.erste_seite_kein_header, row.erste_seite_kein_footer,
            row.seiten_layout ? JSON.stringify(row.seiten_layout) : null]
        )
      }
    }

    // ── Notiz-Vorlagen ──────────────────────────────────────────────────────
    if (sections.includes('vorlagen')) {
      const src = await client.query('SELECT * FROM dokument_vorlagen WHERE produktion_id = $1 ORDER BY created_at', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM dokument_vorlagen WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query('SELECT id FROM dokument_vorlagen WHERE produktion_id=$1 AND name=$2 AND typ=$3', [targetId, row.name, row.typ])
          if (exists.rows.length) continue
        }
        await client.query(
          `INSERT INTO dokument_vorlagen (produktion_id, name, typ, sektionen, meta_fields, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [targetId, row.name, row.typ, JSON.stringify(row.sektionen), JSON.stringify(row.meta_fields), row.created_by]
        )
      }
    }

    // ── Stockshot-Templates ─────────────────────────────────────────────────
    if (sections.includes('stockshot_templates')) {
      const src = await client.query('SELECT * FROM stockshot_templates WHERE produktion_id = $1 ORDER BY kategorie, sortierung', [source_produktion_id])
      if (!merge) await client.query('DELETE FROM stockshot_templates WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query(
            'SELECT id FROM stockshot_templates WHERE produktion_id=$1 AND kategorie=$2 AND name=$3',
            [targetId, row.kategorie, row.name]
          )
          if (exists.rows.length) continue
        }
        await client.query(
          `INSERT INTO stockshot_templates
             (produktion_id, kategorie, name, oneliner_vorlage, sortierung,
              stoppzeit_sek, innen_aussen, stimmung, bodytext)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [targetId, row.kategorie, row.name, row.oneliner_vorlage, row.sortierung,
            row.stoppzeit_sek ?? null, row.innen_aussen ?? null,
            row.stimmung ?? null, row.bodytext ?? null]
        )
      }
    }

    // ── Autorenplan Job-Kategorien ──────────────────────────────────────────
    if (sections.includes('autorenplan_kategorien')) {
      const srcProd = await client.query('SELECT produktion_db_id FROM produktionen WHERE id = $1', [source_produktion_id])
      const tgtProd = await client.query('SELECT produktion_db_id FROM produktionen WHERE id = $1', [targetId])
      if (srcProd.rows[0]?.produktion_db_id && tgtProd.rows[0]?.produktion_db_id) {
        const srcDbId = srcProd.rows[0].produktion_db_id
        const tgtDbId = tgtProd.rows[0].produktion_db_id
        const src = await client.query(
          'SELECT * FROM autorenplan_job_kategorien WHERE produktion_db_id = $1 ORDER BY sortierung',
          [srcDbId]
        )
        if (!merge) await client.query('DELETE FROM autorenplan_job_kategorien WHERE produktion_db_id = $1', [tgtDbId])
        for (const row of src.rows) {
          if (merge) {
            const exists = await client.query(
              'SELECT id FROM autorenplan_job_kategorien WHERE produktion_db_id=$1 AND label=$2',
              [tgtDbId, row.label]
            )
            if (exists.rows.length) continue
          }
          await client.query(
            `INSERT INTO autorenplan_job_kategorien
               (produktion_db_id, label, beschreibung, vertragsdb_taetigkeit_id,
                gage_betrag, gage_waehrung, abrechnungstyp, lst_rg,
                max_slots, slots_gleich_folgen, dauer_wochen, bezugseinheit,
                praesenz_wochen, farbe, sortierung, erstellt_von)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [tgtDbId, row.label, row.beschreibung, row.vertragsdb_taetigkeit_id,
              row.gage_betrag, row.gage_waehrung, row.abrechnungstyp, row.lst_rg,
              row.max_slots, row.slots_gleich_folgen, row.dauer_wochen, row.bezugseinheit,
              row.praesenz_wochen, row.farbe, row.sortierung, row.erstellt_von]
          )
        }
      }
    }

    // ── Freie-Dok-Labels ─────────────────────────────────────────────────────
    if (sections.includes('freie_dok_labels')) {
      const src = await client.query(
        'SELECT * FROM freie_dokument_labels WHERE produktion_id = $1 ORDER BY sort_order, id',
        [source_produktion_id]
      )
      if (!merge) await client.query('DELETE FROM freie_dokument_labels WHERE produktion_id = $1', [targetId])
      for (const row of src.rows) {
        await client.query(
          `INSERT INTO freie_dokument_labels (produktion_id, label_name, sort_order)
           VALUES ($1, $2, $3) ON CONFLICT (produktion_id, label_name) DO NOTHING`,
          [targetId, row.label_name, row.sort_order]
        )
      }
    }

    // ── Inhaltskennzeichnungs-Vorlagen ────────────────────────────────────────
    if (sections.includes('inhaltskennzeichnung')) {
      const src = await client.query(
        'SELECT * FROM deskriptor_vorlagen WHERE production_id = $1 ORDER BY sort_order, id',
        [source_produktion_id]
      )
      if (!merge) await client.query('DELETE FROM deskriptor_vorlagen WHERE production_id = $1', [targetId])
      for (const row of src.rows) {
        await client.query(
          `INSERT INTO deskriptor_vorlagen (production_id, name, sort_order)
           VALUES ($1, $2, $3) ON CONFLICT (production_id, name) DO NOTHING`,
          [targetId, row.name, row.sort_order]
        )
      }
    }

    // ── Tageszeit-Stimmungen ─────────────────────────────────────────────────
    if (sections.includes('stimmungen')) {
      const src = await client.query(
        'SELECT * FROM tageszeit_stimmungen WHERE production_id = $1 ORDER BY position',
        [source_produktion_id]
      )
      if (!merge) await client.query('DELETE FROM tageszeit_stimmungen WHERE production_id = $1', [targetId])
      for (const row of src.rows) {
        if (merge) {
          const exists = await client.query(
            'SELECT id FROM tageszeit_stimmungen WHERE production_id=$1 AND name=$2',
            [targetId, row.name]
          )
          if (exists.rows.length) continue
        }
        await client.query(
          'INSERT INTO tageszeit_stimmungen (production_id, name, kuerzel, position) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.kuerzel, row.position]
        )
      }
      // Stimmungen-Changed auslösen damit App-Context neu lädt
    }

    // ── Rollen-Freigabe-Konfiguration ─────────────────────────────────────────
    if (sections.includes('rollen_freigabe_config')) {
      const src = await client.query(
        'SELECT * FROM rollen_freigabe_konfiguration WHERE production_id = $1',
        [source_produktion_id]
      )
      if (src.rows.length) {
        const r = src.rows[0]
        await client.query(
          `INSERT INTO rollen_freigabe_konfiguration
             (production_id, freigabe_aktiv, erinnerung_nach_tagen,
              deckt_rollen, deckt_motive, deckt_neue_szenen,
              quorum, lock_trigger_fassungslabel, lock_trigger_werkstufen_typ,
              lock_trigger_version_nummer, lock_override_aktiv, lock_override_rollen,
              ot_obergrenze_pro_block)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (production_id) DO UPDATE SET
             freigabe_aktiv=$2, erinnerung_nach_tagen=$3,
             deckt_rollen=$4, deckt_motive=$5, deckt_neue_szenen=$6,
             quorum=$7, lock_trigger_fassungslabel=$8,
             lock_trigger_werkstufen_typ=$9, lock_trigger_version_nummer=$10,
             lock_override_aktiv=$11, lock_override_rollen=$12,
             ot_obergrenze_pro_block=$13, geaendert_am=NOW()`,
          [targetId, r.freigabe_aktiv, r.erinnerung_nach_tagen,
            r.deckt_rollen, r.deckt_motive, r.deckt_neue_szenen,
            r.quorum, r.lock_trigger_fassungslabel, r.lock_trigger_werkstufen_typ,
            r.lock_trigger_version_nummer, r.lock_override_aktiv,
            JSON.stringify(r.lock_override_rollen ?? []),
            r.ot_obergrenze_pro_block]
        )
      }
    }

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('copy-settings error:', err)
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/produktionen/sync — called by Produktionsdatenbank on production sync
router.post('/sync', async (req, res) => {
  const { production_id, title, staffelnummer, projektnummer } = req.body
  if (!production_id || !title) {
    return res.status(400).json({ error: 'production_id und title erforderlich' })
  }
  try {
    const label = staffelnummer ? `${title} Staffel ${staffelnummer}` : title
    await query(
      `INSERT INTO produktionen (id, titel, produktion_db_id)
       VALUES ($1, $2, $3::uuid)
       ON CONFLICT (id) DO UPDATE SET titel = $2, produktion_db_id = $3::uuid, updated_at = NOW()`,
      [production_id, label, production_id]
    )
    res.json({ ok: true, produktion_id: production_id })
  } catch (err) {
    console.error('produktionen/sync error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
