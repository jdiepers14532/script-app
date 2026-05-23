import { useState, useEffect, useRef } from 'react'
import { C, Badge, Tag, TableCard, Section, FaqItem, FieldBox, InfoBox, WarnBox } from './_shared'

function NetzplanDiagram() {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.42)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const dragMovedRef = useRef(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  const TW = 330, FH = 16, HH = 24, GAP = 22
  type F = [string, string, string, string?] // [name, type, desc, fk_target?]
  type T = { id: string; g: string; f: F[] }

  const defs: T[] = [
    { id:'produktionen', g:'core', f:[['id','TEXT PK','Produktions-ID'],['titel','TEXT','Anzeigename'],['produktion_db_id','UUID','FK zur Prod-DB'],['meta_json','JSONB','Flexible Metadaten'],['seitenformat','TEXT','a4 (default)'],['created_at','TSTZ','Erstellt'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'folgen', g:'core', f:[['id','SERIAL PK','Episoden-Key'],['produktion_id','TEXT FK','Produktion','produktionen'],['folge_nummer','INT','Episodennummer (UNIQUE)'],['folgen_titel','TEXT','Arbeitstitel'],['air_date','DATE','Sendedatum'],['synopsis','TEXT','Synopsis'],['produktion_db_id','UUID','Link zur Prod-DB'],['erstellt_von','TEXT','user_id'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'scene_identities', g:'core', f:[['id','UUID PK','Stabile Szenen-UUID'],['folge_id','INT FK','Episode','folgen'],['created_by','TEXT','Ersteller'],['created_at','TSTZ','Erstellt']]},
    { id:'werkstufen', g:'core', f:[['id','UUID PK','Werkstufen-ID'],['folge_id','INT FK','Episode','folgen'],['typ','TEXT','drehbuch|storyline|notiz'],['version_nummer','INT','Version (1,2,3...)'],['label','TEXT','z.B. Blaue Seiten'],['sichtbarkeit','TEXT','privat|team|alle'],['abgegeben','BOOL','Eingefroren?'],['bearbeitung_status','TEXT','entwurf|in_review|approved'],['erstellt_von','TEXT','user_id'],['erstellt_am','TSTZ','Erstellt'],['stand_datum','DATE','Stand-Datum']]},
    { id:'dokument_szenen', g:'core', f:[['id','UUID PK','Szenen-Instanz'],['werkstufe_id','UUID FK','Werkstufe','werkstufen'],['scene_identity_id','UUID FK','Stabile SZ-ID','scene_identities'],['sort_order','INT','Reihenfolge'],['scene_nummer','INT','Szenennummer'],['scene_nummer_suffix','VARCHAR','a, b (WGA)'],['ort_name','TEXT','Motivname'],['int_ext','TEXT','INT|EXT|INT/EXT'],['tageszeit','TEXT','TAG|NACHT|ABEND'],['spieltag','INT','Drehtag-Index'],['spielzeit','TEXT','Spielzeit-Info'],['zusammenfassung','TEXT','Kurzbeschreibung'],['szeneninfo','TEXT','Redaktionelle Hinweise'],['seiten','TEXT','Seitenzahl (2 5/8)'],['dauer_min','INT','Dauer Min (Legacy)'],['dauer_sek','INT','Dauer Sek (Legacy)'],['is_wechselschnitt','BOOL','Legacy WS-Flag'],['sondertyp','TEXT','wechselschnitt|stockshot|flashback'],['stockshot_kategorie','TEXT','ortswechsel|zeit_vergeht|stimmungswechsel'],['stockshot_stimmung','TEXT','Stimmungswert'],['stockshot_neu_drehen','BOOL','Neu zu drehen?'],['flashback_referenz_id','UUID FK','Ursprungsszene','scene_identities'],['content','JSONB','ProseMirror JSON'],['format','TEXT','Editor-Typ'],['stoppzeit_sek','INT','Spieldauer Sek'],['geloescht','BOOL','Soft-Delete'],['yjs_state','BYTEA','Yjs Collab State'],['updated_by','TEXT','Letzter Bearbeiter'],['updated_at','TSTZ','Letzte Änderung']]},
    { id:'wechselschnitt_partner', g:'core', f:[['id','UUID PK','Partner-ID'],['dokument_szene_id','UUID FK','WS-Szene','dokument_szenen'],['partner_identity_id','UUID FK','Partner-Szene','scene_identities'],['position','INT','Reihenfolge']]},
    { id:'stockshot_archiv', g:'core', f:[['id','UUID PK','Archiv-ID'],['produktion_id','TEXT','Staffel'],['motiv_name','TEXT','Motivname'],['motiv_id','UUID FK','Motiv','motive'],['lichtstimmung','TEXT','z.B. TAG, NACHT'],['quelle_folge_nr','INT','Gefilmt in Folge'],['quelle_szene_id','UUID FK','Quell-Szene','scene_identities'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'stockshot_templates', g:'core', f:[['id','UUID PK','Template-ID'],['produktion_id','TEXT','Staffel'],['kategorie','TEXT','ortswechsel|zeit_vergeht|stimmungswechsel'],['name','TEXT','Template-Name'],['oneliner_vorlage','TEXT','Text mit {motiv}/{stimmung}'],['sortierung','INT','Reihenfolge'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'characters', g:'char', f:[['id','UUID PK','Globale Charakter-ID'],['name','TEXT','z.B. Ben Lohmann'],['meta_json','JSONB','Erweiterte Daten'],['created_at','TSTZ','Erstellt']]},
    { id:'character_productions', g:'char', f:[['character_id','UUID FK','Charakter','characters'],['produktion_id','TEXT FK','Produktion','produktionen'],['rollen_nummer','INT','Rollenblatt-Nr.'],['komparsen_nummer','INT','Komparsen-Nr.'],['kategorie_id','INT FK','Kategorie','character_kategorien'],['updated_at','TSTZ','Aktualisiert'],['is_active','BOOL','Aktiv?'],['darsteller_name','TEXT','Schauspieler-Name']]},
    { id:'character_kategorien', g:'char', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','z.B. Hauptrolle'],['typ','TEXT','rolle|komparse'],['sort_order','INT','Reihenfolge']]},
    { id:'scene_characters', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Charakter','characters'],['kategorie_id','INT FK','Kategorie','character_kategorien'],['anzahl','INT','Bei Gruppen'],['ist_gruppe','BOOL','Gruppen-Eintrag?'],['scene_identity_id','UUID FK','Szene (stabil)','scene_identities'],['spiel_typ','TEXT','o.t.|spiel|text'],['repliken_anzahl','INT','Anzahl Repliken'],['header_o_t','BOOL','Im Header als o.T.'],['werkstufe_id','UUID FK','Werkstufe','werkstufen']]},
    { id:'charakter_beziehungen', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Quell-Charakter','characters'],['related_character_id','UUID FK','Ziel-Charakter','characters'],['beziehungstyp','TEXT','parent|spouse|...'],['label','TEXT','Freies Label']]},
    { id:'charakter_fotos', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Charakter','characters'],['dateiname','TEXT','Server-Dateiname'],['originalname','TEXT','Upload-Name'],['label','TEXT','Beschriftung'],['sort_order','INT','Reihenfolge'],['ist_primaer','BOOL','Primärfoto?'],['hochgeladen_am','TSTZ','Upload-Datum'],['media_typ','TEXT','image|video'],['thumbnail_dateiname','TEXT','Thumbnail']]},
    { id:'charakter_felder_config', g:'char', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Feldname'],['typ','TEXT','text|richtext|select|ref'],['optionen','JSONB','Select-Optionen'],['sort_order','INT','Reihenfolge'],['gilt_fuer','TEXT','alle|rolle|komparse']]},
    { id:'charakter_feldwerte', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Charakter','characters'],['motiv_id','UUID FK','Motiv','motive'],['feld_id','INT FK','Feld-Config','charakter_felder_config'],['wert_text','TEXT','Text-Wert'],['wert_json','JSONB','Rich-Text/Struktur']]},
    { id:'charakter_feld_links', g:'char', f:[['id','SERIAL PK','Interne ID'],['source_character_id','UUID FK','Quell-Charakter','characters'],['feld_id','INT FK','Feld-Config','charakter_felder_config'],['linked_character_id','UUID FK','Ziel-Charakter','characters'],['created_at','TSTZ','Erstellt']]},
    { id:'drehorte', g:'motiv', f:[['id','UUID PK','Drehort-ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['label','TEXT','z.B. Stu. 01'],['sort_order','INT','Reihenfolge'],['created_at','TSTZ','Erstellt']]},
    { id:'motive', g:'motiv', f:[['id','UUID PK','Motiv-ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['motiv_nummer','TEXT','z.B. M01'],['name','TEXT','Motivname'],['typ','TEXT','interior|exterior'],['meta_json','JSONB','Metadaten'],['created_at','TSTZ','Erstellt'],['drehort_id','UUID FK','Phys. Drehort','drehorte'],['parent_id','UUID FK','Hauptmotiv','motive']]},
    { id:'motiv_fotos', g:'motiv', f:[['id','SERIAL PK','Interne ID'],['motiv_id','UUID FK','Motiv','motive'],['dateiname','TEXT','Server-Dateiname'],['originalname','TEXT','Upload-Name'],['label','TEXT','Beschriftung'],['sort_order','INT','Reihenfolge'],['ist_primaer','BOOL','Primärfoto?'],['hochgeladen_am','TSTZ','Upload-Datum'],['media_typ','TEXT','image|video'],['thumbnail_dateiname','TEXT','Thumbnail']]},
    { id:'szenen_revisionen', g:'rev', f:[['id','SERIAL PK','Interne ID'],['dokument_szene_id','UUID FK NOT NULL','Szene','dokument_szenen'],['field_type','TEXT','header|content_block'],['field_name','TEXT','ort_name, spieltag...'],['block_index','INT','Content-Block-Idx'],['block_type','TEXT','action|dialogue|...'],['speaker','TEXT','Sprecher'],['old_value','TEXT','Vorheriger Wert'],['new_value','TEXT','Neuer Wert'],['created_at','TSTZ','Änderungszeitpunkt']]},
    { id:'szenen_vorstopp', g:'rev', f:[['id','SERIAL PK','Interne ID'],['scene_identity_id','UUID FK','Szene (stabil)','scene_identities'],['stage','TEXT','drehbuch|vorber.|dreh|schnitt'],['user_id','TEXT','Wer hat gemessen'],['user_name','TEXT','Anzeigename'],['dauer_sekunden','INT','Gemessene Zeit'],['methode','TEXT','manuell|auto_*'],['created_at','TSTZ','Erstellt'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'vorstopp_einstellungen', g:'rev', f:[['produktion_id','TEXT PK/FK','Produktion','produktionen'],['methode','TEXT','seiten|zeichen|woerter'],['menge','NUMERIC','Einheiten/Dauer'],['dauer_sekunden','INT','Sek/Mengeneinheit'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'stage_labels', g:'rev', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Label-Name'],['sort_order','INT','Reihenfolge'],['is_produktionsfassung','BOOL','Produktionsfassung?']]},
    { id:'revision_colors', g:'rev', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','z.B. Blaue Seiten'],['color','TEXT','Hex (#4A90D9)'],['sort_order','INT','Reihenfolge']]},
    { id:'revision_export_einstellungen', g:'rev', f:[['produktion_id','TEXT PK/FK','Produktion','produktionen'],['memo_schwellwert_zeichen','INT','Memo-Schwelle (100)'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'dokument_colab_gruppen', g:'collab', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Gruppenname'],['typ','TEXT','colab|produktion'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'dokument_colab_gruppe_mitglieder', g:'collab', f:[['gruppe_id','INT FK','Gruppe','dokument_colab_gruppen'],['user_id','TEXT','Benutzer-ID'],['user_name','TEXT','Anzeigename']]},
    { id:'dokument_benachrichtigungen', g:'collab', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['ereignis','TEXT','version_submitted|...'],['empfaenger_user_ids','TEXT[]','Empfänger'],['aktiv','BOOL','An/Aus']]},
    { id:'dokument_typ_definitionen', g:'collab', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','z.B. Drehbuch'],['editor_modus','TEXT','screenplay|richtext'],['sort_order','INT','Reihenfolge'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'editor_format_templates', g:'editor', f:[['id','SERIAL PK','Interne ID'],['name','TEXT','z.B. Final Draft Std.'],['ist_standard','BOOL','Default?'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'editor_format_elemente', g:'editor', f:[['id','SERIAL PK','Interne ID'],['template_id','INT FK','Template','editor_format_templates'],['element_typ','TEXT','scene_heading|action|...'],['einrueckung_links','INT','Einrückung L (%)'],['einrueckung_rechts','INT','Einrückung R (%)'],['ausrichtung','TEXT','left|center|right'],['grossbuchstaben','BOOL','Uppercase?'],['tab_folge_element','TEXT','Tab -> nächstes'],['enter_folge_element','TEXT','Enter -> nächstes'],['sort_order','INT','Reihenfolge']]},
    { id:'episode_locks', g:'lock', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['folge_nummer','INT','Gesperrte Folge'],['user_id','TEXT','Wer hat gesperrt'],['user_name','TEXT','Anzeigename'],['lock_type','TEXT','exclusive|contract'],['expires_at','TSTZ','Ablauf'],['contract_ref','TEXT','Vertragsreferenz'],['created_at','TSTZ','Erstellt']]},
    { id:'entities', g:'lock', f:[['id','SERIAL PK','Interne ID'],['entity_type','TEXT','charakter|prop|location'],['external_id','TEXT','ID in externer App'],['external_app','TEXT','z.B. kostuem-app'],['name','TEXT','Anzeigename'],['meta_json','JSONB','Metadaten'],['produktion_id','TEXT FK','Produktion','produktionen'],['created_at','TSTZ','Erstellt']]},
    { id:'export_logs', g:'lock', f:[['id','UUID PK','Export-ID'],['user_id','TEXT','Exportierer'],['user_name','TEXT','Anzeigename'],['stage_label','TEXT','Fassungs-Label'],['staffel_id','TEXT','Produktions-ID (Legacy)'],['werkstufe_id','UUID FK','Werkstufe','werkstufen'],['format','TEXT','fountain|fdx|pdf'],['exported_at','TSTZ','Exportzeitpunkt']]},
    { id:'statistik_vorlagen', g:'stat', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Vorlagen-Name'],['abfrage_typ','TEXT','character-repliken|...'],['parameter','JSONB','Filter-Parameter'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt'],['sortierung','INT','Reihenfolge']]},
    { id:'app_settings', g:'settings', f:[['key','TEXT PK','Einstellungs-Key'],['value','TEXT','Wert'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'user_settings', g:'settings', f:[['user_id','TEXT PK','Benutzer-ID'],['selected_production_id','UUID','Letzte Produktion'],['updated_at','TSTZ','Aktualisiert'],['ui_settings','JSONB','Theme, Sidebar...']]},
    { id:'production_app_settings', g:'settings', f:[['id','SERIAL PK','Interne ID'],['production_id','TEXT','Produktion'],['key','TEXT','Einstellungs-Key'],['value','TEXT','Wert'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'ki_settings', g:'settings', f:[['id','SERIAL PK','Interne ID'],['funktion','TEXT UNIQUE','scene_summary|...'],['provider','TEXT','ollama|mistral|openai'],['model_name','TEXT','z.B. llama3.2'],['enabled','BOOL','An/Aus'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'ki_providers', g:'settings', f:[['provider','TEXT PK','Provider-Name'],['api_key','TEXT','API-Schluessel'],['is_active','BOOL','Aktiv?'],['dsgvo_level','TEXT','gruen|orange|rot'],['tokens_in','BIGINT','Verbrauch IN'],['tokens_out','BIGINT','Verbrauch OUT'],['cost_eur','NUMERIC','Kosten EUR'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'dk_settings_access', g:'settings', f:[['id','SERIAL PK','Interne ID'],['production_id','TEXT','Produktion'],['access_type','TEXT','rolle|user'],['identifier','TEXT','Rollenname/user_id'],['created_at','TSTZ','Erstellt'],['created_by','TEXT','Ersteller']]},
    { id:'scene_comment_events', g:'comment', f:[['id','SERIAL PK','Interne ID'],['scene_id','INT','Szenen-ID'],['messenger_annotation_id','TEXT UNIQUE','Messenger UUID'],['created_at','TSTZ','Erstellt'],['deleted_at','TSTZ','Soft-Delete']]},
    { id:'scene_comment_read_state', g:'comment', f:[['scene_id','INT PK','Szenen-ID'],['user_id','TEXT PK','Benutzer-ID'],['last_read_at','TSTZ','Letzter Lesezeitpunkt']]},
    { id:'schema_migrations', g:'system', f:[['name','TEXT PK','Migrations-Dateiname'],['applied_at','TSTZ','Ausfuehrungszeitpunkt']]},
  ]

  // Column assignments: [x_offset, table_ids[]]
  const cols: [number, string[]][] = [
    [20, ['charakter_beziehungen','charakter_fotos','charakter_feld_links']],
    [380, ['characters','character_productions','character_kategorien','charakter_felder_config','charakter_feldwerte']],
    [740, ['dokument_colab_gruppen','dokument_colab_gruppe_mitglieder','dokument_benachrichtigungen','dokument_typ_definitionen','episode_locks','scene_characters']],
    [1100, ['produktionen','folgen','scene_identities','werkstufen','dokument_szenen','wechselschnitt_partner','stockshot_archiv','stockshot_templates','export_logs']],
    [1460, ['entities','statistik_vorlagen','stage_labels','revision_colors','revision_export_einstellungen','vorstopp_einstellungen','szenen_vorstopp','szenen_revisionen']],
    [1820, ['drehorte','motive','motiv_fotos']],
    [2180, ['editor_format_templates','editor_format_elemente','app_settings','user_settings','production_app_settings','ki_settings','ki_providers','dk_settings_access','scene_comment_events','scene_comment_read_state','schema_migrations']],
  ]

  // Build table map + compute positions
  const tMap = new Map(defs.map(t => [t.id, t]))
  const tH = (t: T) => HH + t.f.length * FH
  const pos: Record<string, { x: number; y: number }> = {}
  const placed = new Set<string>()
  for (const [cx, ids] of cols) {
    let y = 20
    for (const id of ids) {
      if (placed.has(id)) continue
      const t = tMap.get(id)
      if (!t) continue
      pos[id] = { x: cx, y }
      placed.add(id)
      y += tH(t) + GAP
    }
  }

  // Collect FK edges with field-level positions
  const fkEdges: { fromId: string; toId: string; fromFi: number; sx: number; sy: number; tx: number; ty: number }[] = []
  for (const t of defs) {
    const p = pos[t.id]
    if (!p) continue
    t.f.forEach((f, fi) => {
      if (!f[3]) return
      const targetId = f[3]
      const target = tMap.get(targetId)
      const tp = pos[targetId]
      if (!target || !tp) return
      const sy = p.y + HH + fi * FH + FH / 2
      const ty = tp.y + HH + FH / 2 // always point to PK (first field)
      const goRight = p.x < tp.x || (p.x === tp.x && p.y < tp.y)
      const sx = goRight ? p.x + TW : p.x
      const tx2 = goRight ? tp.x : tp.x + TW
      fkEdges.push({ fromId: t.id, toId: targetId, fromFi: fi, sx, sy, tx: tx2, ty })
    })
  }

  // Channel-Offset-Spreading: group edges by column pair, assign spread index
  const SPREAD = 6
  const edgeChannelKey = (e: typeof fkEdges[0]) => `${Math.round(e.sx)}-${Math.round(e.tx)}`
  const edgesByChannel = new Map<string, typeof fkEdges>()
  for (const e of fkEdges) {
    const key = edgeChannelKey(e)
    if (!edgesByChannel.has(key)) edgesByChannel.set(key, [])
    edgesByChannel.get(key)!.push(e)
  }
  const edgeSpreadIdx = new Map<typeof fkEdges[0], number>()
  const edgeSpreadCount = new Map<typeof fkEdges[0], number>()
  for (const [, group] of edgesByChannel) {
    group.forEach((e, i) => {
      edgeSpreadIdx.set(e, i)
      edgeSpreadCount.set(e, group.length)
    })
  }

  // Manhattan routing: H → V → H with channel spreading
  function route(e: typeof fkEdges[0]): string {
    const { sx, sy, tx, ty, fromId, toId } = e
    const idx = edgeSpreadIdx.get(e) ?? 0
    const count = edgeSpreadCount.get(e) ?? 1
    const offset = (idx - (count - 1) / 2) * SPREAD

    const sameCol = Math.abs(sx - tx) < TW
    if (sameCol && fromId === toId) {
      // Self-reference (e.g. motive → motive)
      const ox = Math.max(sx, tx) + 30 + offset
      return `M ${sx},${sy} H ${ox} V ${ty} H ${tx}`
    }
    if (Math.abs(sx - tx) < 5) {
      // Same X edge — offset through side
      const ox = sx + (sx > 1000 ? 25 : -25) + offset
      return `M ${sx},${sy} H ${ox} V ${ty} H ${tx}`
    }
    const midX = sx + (tx - sx) * 0.5 + offset
    return `M ${sx},${sy} H ${midX} V ${ty} H ${tx}`
  }

  const groupColors: Record<string, string> = {
    core: '#007AFF', char: '#FF9500', motiv: '#00C853', rev: '#FF3B30',
    collab: '#AF52DE', editor: '#8E8E93', settings: '#8E8E93', lock: '#FF3B30',
    stat: '#FF9500', comment: '#FFCC00', system: '#8E8E93',
  }

  const canvasRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      setZoom(z => Math.min(2.5, Math.max(0.15, z + delta)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      dragMovedRef.current = false
    }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - (dragStart.x + pan.x)
      const dy = e.clientY - (dragStart.y + pan.y)
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMovedRef.current = true
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }
  const handleMouseUp = () => setDragging(false)

  // Canvas size
  const canvasW = 2550, canvasH = 1400

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5 }}>
          ER-DIAGRAMM — 42 TABELLEN, 43 FK-BEZIEHUNGEN
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
          <span style={{ fontSize: 10, color: C.muted, minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(0.15, z - 0.15))} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>-</button>
          <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(0.42) }} style={{ height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 10, padding: '0 8px' }}>Reset</button>
        </div>
      </div>
      <div
        ref={canvasRef}
        style={{
          width: '100%', height: 600, overflow: 'hidden',
          border: `1px solid ${C.border}`, borderRadius: 12, background: '#fdfdfd',
          cursor: dragging ? 'grabbing' : 'grab', position: 'relative', userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg width="100%" height="100%" style={{ display: 'block' }}
          viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${canvasW / zoom} ${600 / zoom}`}
        >
          <defs>
            <marker id="fk-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#999" />
            </marker>
          </defs>

          {/* FK Connection Lines */}
          {fkEdges.map((e, i) => {
            const isHighlight = hovered === e.fromId || hovered === e.toId
            const dimmed = hovered != null && !isHighlight
            const gColor = groupColors[tMap.get(e.fromId)?.g ?? ''] || '#999'
            return <path key={`e${i}`} d={route(e)}
              fill="none"
              stroke={isHighlight ? '#007AFF' : gColor}
              strokeWidth={isHighlight ? 2 : 1}
              opacity={dimmed ? 0.08 : isHighlight ? 1 : 0.45}
              markerEnd="url(#fk-arrow)"
              style={{ transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s' }} />
          })}

          {/* Table Cards */}
          {defs.map(t => {
            const p = pos[t.id]
            if (!p) return null
            const color = groupColors[t.g] || '#8E8E93'
            const h = tH(t)
            const isHov = hovered === t.id
            return (
              <g key={t.id} onMouseEnter={() => setHovered(t.id)} onMouseLeave={() => setHovered(null)}>
                {/* Shadow */}
                <rect x={p.x + 1} y={p.y + 1} width={TW} height={h} rx={5} fill="#00000008" />
                {/* Card bg */}
                <rect x={p.x} y={p.y} width={TW} height={h} rx={5}
                  fill="#fff" stroke={isHov ? color : '#ddd'} strokeWidth={isHov ? 2 : 1} />
                {/* Header */}
                <rect x={p.x} y={p.y} width={TW} height={HH} rx={5} fill={color} />
                <rect x={p.x} y={p.y + HH - 5} width={TW} height={5} fill={color} />
                <text x={p.x + 8} y={p.y + 16} fontSize={10} fontWeight={700} fontFamily="monospace" fill="#fff"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { if (!dragMovedRef.current) { e.stopPropagation(); copyToClipboard(t.id) } }}>
                  {t.id}
                </text>
                <text x={p.x + TW - 8} y={p.y + 16} fontSize={8} fontWeight={500} fill="#ffffff99" textAnchor="end">
                  {t.f.length}
                </text>
                {/* Fields */}
                {t.f.map((f, fi) => {
                  const fy = p.y + HH + fi * FH
                  const isFK = !!f[3]
                  const isPK = f[1].includes('PK')
                  return (
                    <g key={fi}>
                      {fi % 2 === 1 && <rect x={p.x} y={fy} width={TW} height={FH} fill="#f8f8f8" />}
                      {/* PK/FK indicator */}
                      {isPK && <text x={p.x + 3} y={fy + 12} fontSize={7} fill={color} fontWeight={700}>PK</text>}
                      {isFK && !isPK && <text x={p.x + 3} y={fy + 12} fontSize={7} fill="#999" fontWeight={600}>FK</text>}
                      {/* Field name */}
                      <text x={p.x + 22} y={fy + 12} fontSize={8.5} fontWeight={isFK || isPK ? 600 : 400}
                        fontFamily="monospace" fill={isFK ? '#555' : '#333'}
                        clipPath={`inset(0 ${TW - 115}px 0 0)`}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          if (dragMovedRef.current) return
                          e.stopPropagation()
                          copyToClipboard(e.ctrlKey ? f[0] : `${t.id}.${f[0]}`)
                        }}>
                        {f[0].length > 14 ? f[0].slice(0, 13) + '..' : f[0]}
                      </text>
                      {/* Type */}
                      <text x={p.x + 120} y={fy + 12} fontSize={7.5} fontFamily="monospace" fill="#999">
                        {f[1].replace(' NOT NULL', '!').length > 12 ? f[1].slice(0, 11) + '..' : f[1].replace(' NOT NULL', '!')}
                      </text>
                      {/* Description */}
                      <text x={p.x + 195} y={fy + 12} fontSize={7.5} fill="#aaa">
                        {f[2].length > 20 ? f[2].slice(0, 19) + '..' : f[2]}
                      </text>
                    </g>
                  )
                })}
                {/* Bottom border */}
                <rect x={p.x} y={p.y + h - 1} width={TW} height={1} fill="#eee" />
              </g>
            )
          })}
        </svg>
        {/* Hover tooltip */}
        {hovered && !copied && (
          <div style={{
            position: 'absolute', top: 8, right: 8, background: '#111', color: '#fff',
            fontSize: 11, padding: '6px 10px', borderRadius: 6, pointerEvents: 'none', maxWidth: 260,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{hovered}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {tMap.get(hovered)?.f.length} Felder
              {fkEdges.filter(e => e.fromId === hovered).length > 0 && ` · ${fkEdges.filter(e => e.fromId === hovered).length} FK`}
              {fkEdges.filter(e => e.toId === hovered).length > 0 && ` · ${fkEdges.filter(e => e.toId === hovered).length} referenziert`}
            </div>
          </div>
        )}
        {/* Copied toast */}
        {copied && (
          <div style={{
            position: 'absolute', top: 8, right: 8, background: '#00C853', color: '#fff',
            fontSize: 11, padding: '6px 10px', borderRadius: 6, pointerEvents: 'none',
            fontFamily: 'monospace', fontWeight: 600,
          }}>
            ✓ {copied}
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 9, color: C.muted, background: '#fdfdfdcc', padding: '2px 6px', borderRadius: 4 }}>
          Scrollen = Zoom · Ziehen = Verschieben · Hover = Beziehungen · Klick Tabellenname = kopieren · Klick Feldname = tabelle.feld · Strg+Klick = nur Feld
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
        {[
          { label: 'Kern (5)', color: '#007AFF' },
          { label: 'Characters (9)', color: '#FF9500' },
          { label: 'Motive (3)', color: '#00C853' },
          { label: 'Revision (6)', color: '#FF3B30' },
          { label: 'Kollaboration (4)', color: '#AF52DE' },
          { label: 'Locks/Export (3)', color: '#FF3B30' },
          { label: 'Statistik (1)', color: '#FF9500' },
          { label: 'Settings (6)', color: '#8E8E93' },
          { label: 'Editor (2)', color: '#8E8E93' },
          { label: 'Kommentare (2)', color: '#FFCC00' },
          { label: 'System (1)', color: '#8E8E93' },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color + '30', border: `1px solid ${l.color}` }} />
            <span style={{ color: C.muted }}>{l.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}


function DatenmodellTab() {
  const [expandedGroup, setExpandedGroup] = useState<string | null>('core')

  const toggle = (id: string) => setExpandedGroup(expandedGroup === id ? null : id)

  const GroupHeader = ({ id, title, count, color }: { id: string; title: string; count: number; color: string }) => (
    <button
      onClick={() => toggle(id)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', border: `1px solid ${color}44`, borderRadius: 10,
        background: expandedGroup === id ? color + '12' : C.surface,
        cursor: 'pointer', textAlign: 'left', marginBottom: expandedGroup === id ? 0 : 8,
        borderBottomLeftRadius: expandedGroup === id ? 0 : 10,
        borderBottomRightRadius: expandedGroup === id ? 0 : 10,
      }}
    >
      <span style={{ fontSize: 16, transition: 'transform 0.15s', transform: expandedGroup === id ? 'rotate(90deg)' : 'rotate(0)' }}>&#9654;</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: C.text, flex: 1 }}>{title}</span>
      <Badge color={color}>{count} Tabellen</Badge>
    </button>
  )

  const GroupBody = ({ id, children }: { id: string; children: React.ReactNode }) => {
    if (expandedGroup !== id) return null
    return (
      <div style={{
        border: `1px solid ${C.border}`, borderTop: 'none',
        borderRadius: '0 0 10px 10px', padding: 20,
        marginBottom: 8, background: C.surface,
      }}>
        {children}
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0' }}>Datenmodell — Script-App</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 4px 0' }}>
          PostgreSQL <code>script_db</code> — 51 Migrationen (v1–v51), 42 aktive Tabellen in 7 Gruppen.
        </p>
        <p style={{ color: C.muted, fontSize: 12, margin: '0 0 16px 0', lineHeight: 1.6 }}>
          <strong style={{ color: C.text }}>v51 (2026-05-04):</strong> Alle Legacy-Tabellen (szenen, stages, folgen_dokumente, folgen_dokument_fassungen,
          szenen_versionen, kommentare, annotationen, autoren, audit) wurden endgültig <code>DROP TABLE</code> entfernt.
          Das Datenmodell besteht jetzt ausschließlich aus dem neuen 5-Tabellen-Kern:
          <code> produktionen → folgen → werkstufen + scene_identities → dokument_szenen</code>.
        </p>

        {/* Interactive Network Diagram */}
        <NetzplanDiagram />

        {/* ER Overview Diagram (compact) */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 20, overflowX: 'auto', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 12, letterSpacing: 0.5 }}>
            ER-UEBERSICHT — KERNBEZIEHUNGEN
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 700 }}>
            <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: '8px 12px', background: C.blue + '0a', minWidth: 100, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.blue }}>produktionen</div>
              <div style={{ fontSize: 9, color: C.muted }}>Produktion (Hub)</div>
            </div>
            <div style={{ alignSelf: 'center', color: C.muted, fontSize: 11, lineHeight: 1 }}>1:n</div>
            <div style={{ border: `2px solid ${C.purple}`, borderRadius: 8, padding: '8px 12px', background: C.purple + '0a', minWidth: 80, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.purple }}>folgen</div>
              <div style={{ fontSize: 9, color: C.muted }}>Episode</div>
            </div>
            <div style={{ alignSelf: 'center', color: C.muted, fontSize: 11 }}>1:n</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ border: `2px solid ${C.orange}`, borderRadius: 8, padding: '6px 10px', background: C.orange + '0a', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.orange }}>werkstufen</div>
                <div style={{ fontSize: 9, color: C.muted }}>Typ + Version</div>
              </div>
              <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: '6px 10px', background: C.blue + '0a', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.blue }}>scene_identities</div>
                <div style={{ fontSize: 9, color: C.muted }}>Stabile UUID</div>
              </div>
            </div>
            <div style={{ alignSelf: 'center', color: C.muted, fontSize: 11 }}>N:M</div>
            <div style={{ border: `2px solid ${C.green}`, borderRadius: 8, padding: '8px 12px', background: C.green + '0a', minWidth: 110, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.green }}>dokument_szenen</div>
              <div style={{ fontSize: 9, color: C.muted }}>Content (N:M)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.muted }}>42 Tabellen, 43 FK-Beziehungen, 0 Legacy-Tabellen</span>
          </div>
        </div>
      </div>

      {/* ── Gruppe 1: Kern ── */}
      <GroupHeader id="core" title="1. Kern — Produktion, Folgen, Werkstufen, Szenen" count={5} color={C.blue} />
      <GroupBody id="core">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="produktionen" color={C.blue} note="Produktion (v47: umbenannt von staffeln)" fields={[
            { name: 'id', type: 'TEXT PK', desc: 'UUID aus Produktionsdatenbank' },
            { name: 'titel', type: 'TEXT', desc: 'Anzeigename (z.B. "Rote Rosen Staffel 25")' },
            { name: 'produktion_db_id', type: 'UUID', desc: 'FK zur Produktionsdatenbank' },
            { name: 'seitenformat', type: 'TEXT', desc: 'a4 (default) — globale Seitenformat-Einstellung' },
            { name: 'meta_json', type: 'JSONB', desc: 'Erweiterbare Metadaten (staffelnummer, projektnummer)' },
          ]} />
          <TableCard title="folgen" color={C.purple} note="Episode (v43 Merge, v47: meta_json entfernt)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interner Episoden-Key' },
            { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            { name: 'folge_nummer', type: 'INT', desc: 'Episodennummer (UNIQUE mit produktion_id)' },
            { name: 'folgen_titel', type: 'TEXT', desc: 'Arbeitstitel' },
            { name: 'air_date', type: 'DATE', desc: 'Sendedatum' },
            { name: 'synopsis', type: 'TEXT', desc: 'Episoden-Synopsis' },
            { name: 'produktion_db_id', type: 'UUID', desc: 'Direkter Link zur Produktionsdatenbank' },
            { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
            { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
          ]} />
          <TableCard title="scene_identities" color={C.blue} note="Stabile Szenen-UUID (v47: produktion_id entfernt — via folge_id ableitbar)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Global stabile Szenen-ID' },
            { name: 'folge_id', type: 'INT FK', desc: '-> folgen.id' },
            { name: 'created_by', type: 'TEXT', desc: 'Ersteller' },
            { name: 'created_at', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
          ]} />
          <TableCard title="werkstufen" color={C.orange} note="Dokument-Version auf Folgen-Ebene (ersetzt folgen_dokument_fassungen)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Werkstufen-ID' },
            { name: 'folge_id', type: 'INT FK', desc: '-> folgen.id' },
            { name: 'typ', type: 'TEXT', desc: 'drehbuch | storyline | notiz | abstrakt | custom' },
            { name: 'version_nummer', type: 'INT', desc: 'Versionszaehler (1, 2, 3...)' },
            { name: 'label', type: 'TEXT', desc: 'z.B. "Blaue Seiten", "Drehfassung"' },
            { name: 'sichtbarkeit', type: 'TEXT', desc: 'privat | team | alle' },
            { name: 'abgegeben', type: 'BOOL', desc: 'Eingefroren? (HTTP 409 bei Schreibversuch)' },
            { name: 'bearbeitung_status', type: 'TEXT', desc: 'entwurf | in_review | approved' },
            { name: 'stand_datum', type: 'DATE', desc: '"Stand"-Datum vom PDF-Cover' },
            { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
            { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
          ]} />
          <TableCard title="dokument_szenen" color={C.green} note="Kreuzungstabelle: Content pro Szene pro Werkstufe (N:M)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Eindeutige Szenen-Instanz' },
            { name: 'werkstufe_id', type: 'UUID FK', desc: '-> werkstufen.id' },
            { name: 'scene_identity_id', type: 'UUID FK', desc: '-> scene_identities.id' },
            { name: 'sort_order', type: 'INT', desc: 'Reihenfolge in dieser Werkstufe' },
            { name: 'scene_nummer', type: 'INT', desc: 'Angezeigte Szenennummer' },
            { name: 'scene_nummer_suffix', type: 'VARCHAR', desc: 'z.B. "a", "b" (WGA-Suffix)' },
            { name: 'ort_name', type: 'TEXT', desc: 'Motivname' },
            { name: 'int_ext', type: 'TEXT', desc: 'INT | EXT | INT/EXT' },
            { name: 'tageszeit', type: 'TEXT', desc: 'TAG | NACHT | ABEND | DAEMMERUNG' },
            { name: 'spieltag', type: 'INT', desc: 'Drehtag-Index' },
            { name: 'spielzeit', type: 'TEXT', desc: 'Spielzeit-Info (z.B. "Morgens")' },
            { name: 'zusammenfassung', type: 'TEXT', desc: 'Kurzbeschreibung' },
            { name: 'szeneninfo', type: 'TEXT', desc: 'Redaktionelle Hinweise (z.B. Block-Zuordnung)' },
            { name: 'seiten', type: 'TEXT', desc: 'Seitenzahl (z.B. "2 5/8")' },
            { name: 'dauer_min', type: 'INT', desc: 'Dauer Minuten (Legacy-Feld)' },
            { name: 'dauer_sek', type: 'INT', desc: 'Dauer Sekunden (Legacy-Feld)' },
            { name: 'content', type: 'JSONB', desc: 'ProseMirror/Screenplay JSON (einzige Content-Quelle!)' },
            { name: 'format', type: 'TEXT', desc: 'drehbuch | storyline | notiz (bestimmt Editor-Typ)' },
            { name: 'stoppzeit_sek', type: 'INT', desc: 'Spieldauer in Sekunden (270 = "04:30")' },
            { name: 'geloescht', type: 'BOOL', desc: 'Soft-Delete (bleibt für Diff)' },
            { name: 'is_wechselschnitt', type: 'BOOL', desc: 'Legacy WS-Flag' },
            { name: 'sondertyp', type: 'TEXT', desc: "NULL | 'wechselschnitt' | 'stockshot' | 'flashback'" },
            { name: 'stockshot_kategorie', type: 'TEXT', desc: "'ortswechsel' | 'zeit_vergeht' | 'stimmungswechsel'" },
            { name: 'stockshot_stimmung', type: 'TEXT', desc: 'Stimmungswert (z.B. NACHT)' },
            { name: 'stockshot_neu_drehen', type: 'BOOL', desc: 'Muss neu gefilmt werden' },
            { name: 'flashback_referenz_id', type: 'UUID FK', desc: 'Ursprungsszene (scene_identities)' },
            { name: 'yjs_state', type: 'BYTEA', desc: 'Yjs Binary State (Echtzeit-Kollaboration)' },
            { name: 'updated_by', type: 'TEXT', desc: 'Letzter Bearbeiter (user_id)' },
            { name: 'updated_at', type: 'TSTZ', desc: 'Letzte Änderung' },
          ]} />
          <InfoBox title="UNIQUE(werkstufe_id, scene_identity_id)" color={C.blue}>
            Pro Szene und Werkstufe genau ein Eintrag. Eine Szene existiert in mehreren Werkstufen — N:M aufgeloest durch <code>dokument_szenen</code>.
          </InfoBox>
        </div>
      </GroupBody>

      {/* ── Gruppe 2: Characters & Motive ── */}
      <GroupHeader id="characters" title="2. Characters, Motive, Statistik & Fotos" count={11} color={C.orange} />
      <GroupBody id="characters">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="characters" color={C.blue} note="Globaler Charakter (produktionsübergreifend)" fields={[
              { name: 'id', type: 'UUID PK', desc: 'Globale Charakter-ID' },
              { name: 'name', type: 'TEXT', desc: 'z.B. "Ben Lohmann"' },
              { name: 'meta_json', type: 'JSONB', desc: 'Erweiterte Daten' },
            ]} />
            <TableCard title="character_productions" color={C.purple} note="Produktionsspezifische Nummer + Darsteller" fields={[
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'rollen_nummer', type: 'INT', desc: 'Rollenblatt-Nr. (UNIQUE pro Staffel)' },
              { name: 'komparsen_nummer', type: 'INT', desc: 'Komparsen-Nr. (UNIQUE pro Staffel)' },
              { name: 'kategorie_id', type: 'INT FK', desc: '-> character_kategorien.id' },
              { name: 'darsteller_name', type: 'TEXT', desc: 'Schauspieler-Name (v48, fuer Statistik-Reports)' },
              { name: 'is_active', type: 'BOOL', desc: 'Aktiv-Flag' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="character_kategorien" color={C.gray} note="Besetzungs-Kategorie pro Staffel" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Hauptrolle, Episoden-Rolle' },
              { name: 'typ', type: 'TEXT', desc: 'rolle | komparse' },
              { name: 'sort_order', type: 'INT', desc: 'Anzeigereihenfolge' },
            ]} />
            <TableCard title="scene_characters" color={C.orange} note="Welche Charaktere in welcher Szene (v45: Komparsen-Spiel, v46: werkstufe_id)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '-> scene_identities.id (stabil!)' },
              { name: 'werkstufe_id', type: 'UUID FK', desc: '-> werkstufen.id (v46, fuer Versionsvergleich)' },
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'kategorie_id', type: 'INT FK', desc: '-> character_kategorien.id' },
              { name: 'anzahl', type: 'INT', desc: 'Bei Komparsen-Gruppen' },
              { name: 'ist_gruppe', type: 'BOOL', desc: 'Gruppen-Eintrag?' },
              { name: 'spiel_typ', type: 'TEXT', desc: 'o.t. | spiel | text (v45, Komparsen-Klassifikation)' },
              { name: 'repliken_anzahl', type: 'INT', desc: 'Anzahl Repliken (v45, auto-gezaehlt)' },
              { name: 'header_o_t', type: 'BOOL', desc: 'Im Szenenkopf als o.T. markiert (v45)' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="charakter_fotos" color={C.blue} note="Fotos & Videos zu Charakteren" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'dateiname', type: 'TEXT', desc: 'Dateiname auf Server' },
              { name: 'ist_primaer', type: 'BOOL', desc: 'Primärfoto-Flag' },
              { name: 'media_typ', type: 'TEXT', desc: 'image | video' },
              { name: 'thumbnail_dateiname', type: 'TEXT', desc: 'Thumbnail-Dateiname' },
            ]} />
            <TableCard title="charakter_beziehungen" color={C.purple} note="Beziehungen zwischen Charakteren" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'character_id', type: 'UUID FK', desc: 'Quell-Charakter' },
              { name: 'related_character_id', type: 'UUID FK', desc: 'Ziel-Charakter' },
              { name: 'beziehungstyp', type: 'TEXT', desc: 'z.B. parent, spouse, colleague' },
              { name: 'label', type: 'TEXT', desc: 'Freies Label' },
            ]} />
          </div>
          <TableCard title="charakter_felder_config" color={C.gray} note="Custom-Felder pro Staffel (Admin-konfigurierbar)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            { name: 'name', type: 'TEXT', desc: 'Feldname (z.B. "Alter", "Charakter")' },
            { name: 'typ', type: 'TEXT', desc: 'text | richtext | character_ref | select' },
            { name: 'optionen', type: 'JSONB', desc: 'Select-Optionen (bei typ=select)' },
            { name: 'gilt_fuer', type: 'TEXT', desc: 'alle | rolle | komparse | motiv' },
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="charakter_feldwerte" color={C.blue} note="Feldwerte (Characters oder Motive)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id (oder NULL)' },
              { name: 'motiv_id', type: 'UUID FK', desc: '-> motive.id (oder NULL)' },
              { name: 'feld_id', type: 'INT FK', desc: '-> charakter_felder_config.id' },
              { name: 'wert_text', type: 'TEXT', desc: 'Text-Wert' },
              { name: 'wert_json', type: 'JSONB', desc: 'Rich-Text oder strukturierter Wert' },
            ]} />
            <TableCard title="charakter_feld_links" color={C.purple} note="Feld-Referenzen zu anderen Charakteren" fields={[
              { name: 'source_character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'feld_id', type: 'INT FK', desc: '-> charakter_felder_config.id' },
              { name: 'linked_character_id', type: 'UUID FK', desc: '-> characters.id (Ziel)' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="drehorte" color={'#00C853'} note="Physische Drehorte (Stu. 01, Außendreh, ...)" fields={[
              { name: 'id', type: 'UUID PK', desc: 'Drehort-ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'label', type: 'TEXT', desc: 'z.B. "Stu. 01", "Außendreh"' },
              { name: 'sort_order', type: 'INT', desc: 'Reihenfolge' },
            ]} />
            <TableCard title="motive" color={'#00C853'} note="Konzeptionelle Motive mit Hierarchie" fields={[
              { name: 'id', type: 'UUID PK', desc: 'Motiv-ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'drehort_id', type: 'UUID FK', desc: '-> drehorte.id (physischer Ort)' },
              { name: 'parent_id', type: 'UUID FK', desc: '-> motive.id (Hauptmotiv)' },
              { name: 'motiv_nummer', type: 'TEXT', desc: 'z.B. "M01"' },
              { name: 'name', type: 'TEXT', desc: 'Motivname (ohne Drehort-Prefix)' },
              { name: 'typ', type: 'TEXT', desc: 'interior | exterior' },
              { name: 'meta_json', type: 'JSONB', desc: 'Flexible Metadaten' },
            ]} />
            <TableCard title="motiv_fotos" color={'#00C853'} note="Fotos zu Motiven" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'motiv_id', type: 'UUID FK', desc: '-> motive.id' },
              { name: 'dateiname', type: 'TEXT', desc: 'Dateiname' },
              { name: 'ist_primaer', type: 'BOOL', desc: 'Primärfoto-Flag' },
              { name: 'media_typ', type: 'TEXT', desc: 'image | video' },
            ]} />
          </div>
          <TableCard title="statistik_vorlagen" color={C.orange} note="Gespeicherte Statistik-Abfragen (v46)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            { name: 'name', type: 'TEXT', desc: 'Vorlagen-Name (z.B. "Hauptrollen Block 28")' },
            { name: 'abfrage_typ', type: 'TEXT', desc: 'character-repliken | motiv-auslastung | ...' },
            { name: 'parameter', type: 'JSONB', desc: 'Gespeicherte Filter-Parameter' },
            { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
            { name: 'sortierung', type: 'INT', desc: 'Anzeigereihenfolge' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 3: Versionen & Revision ── */}
      <GroupHeader id="versions" title="3. Revision, Vorstopp & Fassungs-Labels" count={5} color={C.red} />
      <GroupBody id="versions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="szenen_revisionen" color={C.red} note="Delta-Tracking: Was hat sich geändert? (NOT NULL dokument_szene_id seit v51)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'dokument_szene_id', type: 'UUID FK NOT NULL', desc: '-> dokument_szenen.id (pro Werkstufe)' },
            { name: 'field_type', type: 'TEXT', desc: 'header | content_block' },
            { name: 'field_name', type: 'TEXT', desc: 'ort_name, spieltag, etc.' },
            { name: 'block_index', type: 'INT', desc: 'Content-Block-Index' },
            { name: 'block_type', type: 'TEXT', desc: 'action | dialogue | character | ...' },
            { name: 'speaker', type: 'TEXT', desc: 'Sprecher (bei Dialog-Bloecken)' },
            { name: 'old_value', type: 'TEXT', desc: 'Vorheriger Wert' },
            { name: 'new_value', type: 'TEXT', desc: 'Neuer Wert' },
            { name: 'created_at', type: 'TSTZ', desc: 'Änderungszeitpunkt' },
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="szenen_vorstopp" color={'#00C853'} note="Performance-Zeiten pro Phase" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '-> scene_identities.id (stabil!)' },
              { name: 'stage', type: 'TEXT', desc: 'drehbuch | vorbereitung | dreh | schnitt' },
              { name: 'user_id', type: 'TEXT', desc: 'Wer hat gemessen' },
              { name: 'dauer_sekunden', type: 'INT', desc: 'Gemessene Zeit in Sekunden' },
              { name: 'methode', type: 'TEXT', desc: 'manuell | auto_seiten | auto_zeichen | auto_woerter' },
            ]} />
            <TableCard title="vorstopp_einstellungen" color={'#00C853'} note="Kalkulations-Parameter pro Staffel" fields={[
              { name: 'produktion_id', type: 'TEXT PK/FK', desc: '-> produktionen.id' },
              { name: 'methode', type: 'TEXT', desc: 'seiten | zeichen | woerter' },
              { name: 'menge', type: 'NUMERIC', desc: 'Einheiten pro Dauer (z.B. 0.125)' },
              { name: 'dauer_sekunden', type: 'INT', desc: 'Sekunden pro Mengeneinheit' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="stage_labels" color={C.orange} note="Fassungs-Labels pro Staffel (z.B. Abstrakt, Endfassung)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'Label-Name' },
              { name: 'is_produktionsfassung', type: 'BOOL', desc: 'Produktionsfassung-Flag' },
            ]} />
            <TableCard title="revision_colors" color={C.orange} note="WGA-Standard Revisionsfarben" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Blaue Seiten, Gelbe Seiten' },
              { name: 'color', type: 'TEXT', desc: 'Hex-Farbe (z.B. #4A90D9)' },
            ]} />
          </div>
          <TableCard title="revision_export_einstellungen" color={C.gray} note="Revision-Export Konfiguration" fields={[
            { name: 'produktion_id', type: 'TEXT PK/FK', desc: '-> produktionen.id' },
            { name: 'memo_schwellwert_zeichen', type: 'INT', desc: 'Zeichenschwelle fuer Memo-Seiten (default: 100)' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 4: Kollaboration ── */}
      <GroupHeader id="collab" title="4. Kollaboration & Dokument-System" count={5} color={C.purple} />
      <GroupBody id="collab">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="dokument_colab_gruppen" color={C.purple} note="Kollaborationsgruppen" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'Gruppenname' },
              { name: 'typ', type: 'TEXT', desc: 'colab | produktion' },
              { name: 'erstellt_von', type: 'TEXT', desc: 'Ersteller user_id' },
              { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
            ]} />
            <TableCard title="dokument_colab_gruppe_mitglieder" color={C.purple} note="Gruppen-Mitgliedschaft" fields={[
              { name: 'gruppe_id', type: 'INT FK', desc: '-> dokument_colab_gruppen.id' },
              { name: 'user_id', type: 'TEXT', desc: 'Benutzer-ID' },
              { name: 'user_name', type: 'TEXT', desc: 'Anzeigename' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="dokument_benachrichtigungen" color={C.blue} note="Benachrichtigungs-Routing pro Produktion" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'ereignis', type: 'TEXT', desc: 'version_submitted | approved | ...' },
              { name: 'empfaenger_user_ids', type: 'TEXT[]', desc: 'Empfänger-Liste' },
              { name: 'aktiv', type: 'BOOL', desc: 'An/Aus' },
            ]} />
            <TableCard title="dokument_typ_definitionen" color={C.gray} note="Custom-Dokumenttypen pro Produktion" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Drehbuch, Notizen' },
              { name: 'editor_modus', type: 'TEXT', desc: 'screenplay | richtext' },
              { name: 'sort_order', type: 'INT', desc: 'Anzeigereihenfolge' },
            ]} />
          </div>
          <TableCard title="editor_format_templates + editor_format_elemente" color={C.gray} note="Screenplay-Format-Templates + Regeln pro Element-Typ (7 Typen)" fields={[
            { name: 'templates.id', type: 'SERIAL PK', desc: 'Template-ID' },
            { name: 'templates.name', type: 'TEXT', desc: 'z.B. Final Draft Standard' },
            { name: 'templates.ist_standard', type: 'BOOL', desc: 'Default-Template?' },
            { name: 'elemente.template_id', type: 'INT FK', desc: '-> editor_format_templates.id' },
            { name: 'elemente.element_typ', type: 'TEXT', desc: 'scene_heading | action | character | dialogue | parenthetical | transition | shot' },
            { name: 'elemente.einrueckung_l/r', type: 'INT', desc: 'Zeicheneinrueckung links/rechts' },
            { name: 'elemente.grossbuchstaben', type: 'BOOL', desc: 'Uppercase-Regel' },
            { name: 'elemente.tab_folge', type: 'TEXT', desc: 'Naechstes Element bei Tab' },
            { name: 'elemente.enter_folge', type: 'TEXT', desc: 'Naechstes Element bei Enter' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 5: Kommentare (Messenger-Integration) ── */}
      <GroupHeader id="comments" title="5. Kommentare (Messenger-Integration)" count={2} color={'#FFCC00'} />
      <GroupBody id="comments">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <InfoBox title="Kommentare laufen ueber messenger.app" color={C.blue}>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              Seit v51 gibt es keine lokale Kommentar-Tabelle mehr. Annotationen und Kommentare werden ueber die
              messenger.app verwaltet. Die Script-App speichert nur den Read-State und empfaengt Events via Webhook.
            </div>
          </InfoBox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="scene_comment_read_state" color={C.blue} note="Gelesen-Status (Messenger-Integration)" fields={[
              { name: 'scene_id', type: 'INT PK', desc: 'Szenen-ID (Composite PK mit user_id)' },
              { name: 'user_id', type: 'TEXT PK', desc: 'Benutzer-ID' },
              { name: 'last_read_at', type: 'TSTZ', desc: 'Letzter Lesezeitpunkt' },
            ]} />
            <TableCard title="scene_comment_events" color={C.blue} note="Messenger-Annotation Projektion (Webhook-Empfang)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'scene_id', type: 'INT', desc: 'Szenen-ID' },
              { name: 'messenger_annotation_id', type: 'TEXT UNIQUE', desc: 'Messenger-Annotation UUID' },
              { name: 'created_at', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
              { name: 'deleted_at', type: 'TSTZ', desc: 'Soft-Delete' },
            ]} />
          </div>
        </div>
      </GroupBody>

      {/* ── Gruppe 6: Locking & Entities ── */}
      <GroupHeader id="lock" title="6. Locking, Entities & Export" count={3} color={C.red} />
      <GroupBody id="lock">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="episode_locks" color={C.red} note="Folgen-Sperre (alle Werkstufen betroffen)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'folge_nummer', type: 'INT', desc: 'Gesperrte Folge' },
              { name: 'user_id', type: 'TEXT', desc: 'Wer hat gesperrt' },
              { name: 'lock_type', type: 'TEXT', desc: 'exclusive | contract' },
              { name: 'expires_at', type: 'TSTZ', desc: 'Ablaufzeitpunkt' },
              { name: 'contract_ref', type: 'TEXT', desc: 'Vertragsreferenz (bei contract-lock)' },
            ]} />
            <TableCard title="entities" color={C.purple} note="Generische Entitäten (Props, Fahrzeuge, etc.)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'entity_type', type: 'TEXT', desc: 'charakter | prop | location | kostuem | fahrzeug' },
              { name: 'external_id', type: 'TEXT', desc: 'ID in externer App' },
              { name: 'external_app', type: 'TEXT', desc: 'Quell-App (z.B. kostuem-app)' },
              { name: 'name', type: 'TEXT', desc: 'Anzeigename' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            ]} />
          </div>
          <TableCard title="export_logs" color={C.gray} note="Export-Protokoll (Wasserzeichen-Audit, v51: werkstufe_id statt stage_id)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Export-ID' },
            { name: 'user_id', type: 'TEXT', desc: 'Exportierer' },
            { name: 'user_name', type: 'TEXT', desc: 'Anzeigename' },
            { name: 'stage_label', type: 'TEXT', desc: 'Fassungs-Label (z.B. "Drehbuch V2")' },
            { name: 'staffel_id', type: 'TEXT', desc: 'Produktions-ID (Legacy-Feld)' },
            { name: 'werkstufe_id', type: 'UUID FK', desc: '-> werkstufen.id (v51)' },
            { name: 'format', type: 'TEXT', desc: 'fountain | fdx | pdf' },
            { name: 'exported_at', type: 'TSTZ', desc: 'Exportzeitpunkt' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 7: KI & Einstellungen ── */}
      <GroupHeader id="settings" title="7. KI, Einstellungen & Zugriff" count={6} color={C.green} />
      <GroupBody id="settings">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="ki_settings" color={C.purple} note="KI-Funktions-Konfiguration" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'funktion', type: 'TEXT UNIQUE', desc: 'scene_summary | entity_detect | style_check | ...' },
              { name: 'provider', type: 'TEXT', desc: 'ollama | mistral | openai | claude' },
              { name: 'model_name', type: 'TEXT', desc: 'z.B. llama3.2, mistral-large-latest' },
              { name: 'enabled', type: 'BOOL', desc: 'An/Aus' },
            ]} />
            <TableCard title="ki_providers" color={C.purple} note="Zentralisierte Provider-Verwaltung (v31)" fields={[
              { name: 'provider', type: 'TEXT PK', desc: 'ollama | mistral | openai | claude' },
              { name: 'api_key', type: 'TEXT', desc: 'API-Schluessel (oder ENV-Var)' },
              { name: 'is_active', type: 'BOOL', desc: 'Provider aktiv?' },
              { name: 'dsgvo_level', type: 'TEXT', desc: 'gruen | orange | rot' },
              { name: 'tokens_in / tokens_out', type: 'BIGINT', desc: 'Verbrauchte Tokens' },
              { name: 'cost_eur', type: 'NUMERIC', desc: 'Kumulative Kosten in EUR' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <TableCard title="app_settings" color={C.gray} note="Globale Einstellungen" fields={[
              { name: 'key', type: 'TEXT PK', desc: 'Einstellungs-Key' },
              { name: 'value', type: 'TEXT', desc: 'Wert' },
            ]} />
            <TableCard title="user_settings" color={C.gray} note="Pro-User Praeferenzen" fields={[
              { name: 'user_id', type: 'TEXT PK', desc: 'Benutzer-ID' },
              { name: 'selected_production_id', type: 'UUID', desc: 'Letzte Produktion' },
              { name: 'ui_settings', type: 'JSONB', desc: 'Theme, Sidebar-State, ...' },
            ]} />
            <TableCard title="production_app_settings" color={C.gray} note="Pro-Produktion Overrides" fields={[
              { name: 'production_id', type: 'TEXT', desc: 'Staffel-ID' },
              { name: 'key', type: 'TEXT', desc: 'Einstellungs-Key' },
              { name: 'value', type: 'TEXT', desc: 'Wert' },
            ]} />
          </div>
          <TableCard title="dk_settings_access" color={C.orange} note="Drehbuchkoordinator-Zugriff" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'production_id', type: 'TEXT', desc: 'Staffel-ID' },
            { name: 'access_type', type: 'TEXT', desc: 'rolle | user' },
            { name: 'identifier', type: 'TEXT', desc: 'Rollenname oder user_id' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 7: Migrationshistorie ── */}
      <GroupHeader id="history" title="7. Migrationshistorie & Strukturwandel" count={1} color={C.gray} />
      <GroupBody id="history">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="schema_migrations" color={C.gray} note="Migrations-Tracking (automatisch beim Backend-Start)" fields={[
            { name: 'name', type: 'TEXT PK', desc: 'Migrations-Dateiname (z.B. v51_drop_legacy_tables.sql)' },
            { name: 'applied_at', type: 'TSTZ', desc: 'Ausfuehrungszeitpunkt' },
          ]} />

          <InfoBox title="Strukturwandel v42–v51: Komplette Migration abgeschlossen" color={C.green}>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Altes Modell (v1–v41):</strong> staffeln → bloecke → episoden → stages → szenen.
                Jede Szene gehörte genau einer Stage. Keine stabile Szenen-Identität über Fassungen hinweg.
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Neues Modell (v43+):</strong> produktionen → folgen → werkstufen + scene_identities → dokument_szenen.
                Eine Szene hat eine stabile UUID und existiert in mehreren Werkstufen (N:M via dokument_szenen).
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>v47:</strong> TRUNCATE CASCADE + Rename staffeln → produktionen. Alle Daten neu importiert.
              </p>
              <p style={{ margin: 0 }}>
                <strong>v51 (2026-05-04):</strong> Alle Legacy-Tabellen endgültig per DROP TABLE entfernt.
                Es gibt keine Altlasten mehr — das Datenmodell ist vollständig bereinigt.
              </p>
            </div>
          </InfoBox>

          <WarnBox title="Gedroppte Tabellen (v51 — existieren NICHT mehr in der DB)">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                'szenen', 'stages', 'folgen_dokumente', 'folgen_dokument_fassungen',
                'szenen_versionen', 'kommentare', 'folgen_dokument_annotationen',
                'folgen_dokument_autoren', 'folgen_dokument_audit',
              ].map(t => (
                <span key={t} style={{
                  padding: '3px 8px', borderRadius: 4, textDecoration: 'line-through',
                  background: C.red + '10', border: `1px solid ${C.red}33`,
                  fontSize: 10, fontFamily: 'monospace', color: C.red,
                }}>{t}</span>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: C.muted }}>
              Auch entfernt: <code>bloecke</code>, <code>episoden</code>, <code>folgen_meta</code> (fruehere Migrationen).
              Alle FK-Spalten zu diesen Tabellen (fassung_id, szene_id, stage_id) wurden ebenfalls gedropt.
            </div>
          </WarnBox>
        </div>
      </GroupBody>

      {/* ── Externe Verknuepfungen ── */}
      <Section title="Externe Verknuepfungen">
        <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { from: 'produktionen.produktion_db_id', to: 'Produktionsdatenbank productions.id (UUID)', desc: 'Staffel ↔ Produktion', color: C.blue },
            { from: 'folgen.produktion_db_id', to: 'Produktionsdatenbank episodes.id (UUID)', desc: 'Folge ↔ Episode', color: C.purple },
            { from: 'entities.external_id + external_app', to: 'z.B. kostuem-app, Vertragsdatenbank', desc: 'Generische Cross-App-Referenzen', color: C.orange },
            { from: 'scene_comment_events.messenger_annotation_id', to: 'messenger.app annotations.id', desc: 'Kommentar-Integration via Messenger', color: C.green },
          ].map(r => (
            <div key={r.from} style={{
              border: `1px solid ${r.color}44`, borderLeft: `3px solid ${r.color}`,
              borderRadius: 6, padding: '8px 12px', background: r.color + '08',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 11, color: r.color }}>{r.from}</code>
                <span style={{ color: C.muted }}>→</span>
                <code style={{ fontSize: 11, color: C.muted }}>{r.to}</code>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Import & Komparsen Tab
// ══════════════════════════════════════════════════════════════════════════════


export default DatenmodellTab
