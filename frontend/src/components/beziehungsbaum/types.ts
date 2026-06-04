export interface Beziehungstyp {
  key: string
  label: string
  kategorie: 'familie' | 'romantik' | 'sozial' | 'konflikt' | 'beruflich'
  gerichtet: boolean
  farbe: string
  linienstil: 'solid' | 'dashed' | 'dotted'
  sortierung: number
}

export interface BaumNodeData extends Record<string, unknown> {
  charId: string
  name: string
  darsteller_name?: string
  kategorie_name?: string
  kategorie_typ?: string
  foto_dateiname?: string
}

export interface BaumEdgeData extends Record<string, unknown> {
  kanteId: number
  character_id: string
  related_character_id: string
  beziehungstyp: string
  edgeLabel?: string
  status: string
  gueltig_ab_staffel: number
  gueltig_bis_staffel?: number | null
  staerke?: number | null
  notiz?: string | null
  seit_block?: string | null
  bis_block?: string | null
  herkunft: string
  reihen_id?: string
  typ_label?: string
  typ_kategorie?: string
  gerichtet?: boolean
  farbe?: string
  linienstil?: string
  diffStatus?: 'neu' | 'geaendert' | 'entfallen'
}

export interface Staffel {
  id: string | null  // null für historische Staffeln ohne Produktionszeile in produktion.DB
  staffelnummer: number
  title: string | null
  slug?: string
}

export interface Reihe {
  id: string
  name: string
  typ?: string
}

export interface SeedKandidat {
  id: string
  batch_id: string
  quell_url: string
  quell_abruf_am: string
  roh_quelle_name: string
  roh_ziel_name: string
  match_quelle_id?: string | null
  match_ziel_id?: string | null
  match_konfidenz?: number | null
  typ_key?: string | null
  staffel_hinweis?: number | null
  gueltig_ab_staffel?: number | null
  gueltig_bis_staffel?: number | null
  evidenz_zitat?: string | null
  ki_konfidenz?: number | null
  status: 'neu' | 'bestaetigt' | 'abgelehnt' | 'braucht_klaerung'
  erzeugt_quelle_figur?: boolean
  erzeugt_ziel_figur?: boolean
  reviewer?: string | null
  reviewed_am?: string | null
  erstellt_am: string
  rolle?: string | null
  methode?: 'regel_parser' | 'fliesstext' | 'llm' | null
  ziel_verstorben?: boolean
}
