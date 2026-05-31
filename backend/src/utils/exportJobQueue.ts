/**
 * Export Job Queue — In-Process
 *
 * Einfache In-Memory-Queue für Export-Jobs ohne externe Abhängigkeiten.
 * Jobs werden nach JOB_TTL_MS automatisch entfernt.
 */

import { randomUUID } from 'crypto'

export type ExportFormat = 'pdf' | 'docx' | 'fountain' | 'fdx'
export type JobStatus = 'pending' | 'running' | 'done' | 'error'

/** Ein geordnetes Element VOR oder NACH dem Hauptinhalt im PDF */
export interface OrderedExportItem {
  /** 'notiz' = Notiz-Werkstufe oder einzelne Notiz-Zeile, 'statistik' = Statistik-Seite,
   *  'onliner' = Onliner-Tabelle, 'synopse' = Szenenköpfe-Liste,
   *  'fsk' = FSK-Einschätzung + Inhaltsdeskriptoren der aktuellen Folge */
  type: 'notiz' | 'statistik' | 'onliner' | 'synopse' | 'fsk'
  /** Werkstufe-UUID (für type='notiz': gesamte Notiz-Werkstufe) */
  id?: string
  /** dokument_szenen.id als String (für type='notiz': einzelne Notiz-Zeile aus Drehbuch-Werkstufe) */
  szeneId?: string
  /** dokument_vorlagen.id — Vorlage direkt rendern (z.B. Titelseite ohne dazugehörige dokument_szene) */
  vorlageId?: string
  /** Anzeige-Label für UI */
  label?: string
  /** false = Element wird im Export übersprungen */
  enabled: boolean
  /** Nur bei type='statistik': Konfiguration der Statistik-Seite */
  statistikConfig?: {
    /** Liste aller Folge-IDs (eine für Folge-Modus, mehrere für Block-Modus) */
    folge_ids: number[]
    /** Repräsentative Folgen-Nummer für den Anzeige-Titel */
    folge_nummer: number
    mode: 'folge' | 'block'
    sections: string[]
    includedSceneNumbers?: number[] | null
  }
}

export interface ExportJobOptions {
  /** IDs der Notiz-Werkstufen die vor dem Hauptdokument eingefügt werden (Legacy, wird durch preItems ersetzt) */
  notizWerkstufIds?: string[]
  /** Elemente VOR dem Hauptinhalt (DnD-Reihenfolge) — ersetzt notizWerkstufIds */
  preItems?: OrderedExportItem[]
  /** Elemente NACH dem Hauptinhalt (DnD-Reihenfolge) */
  postItems?: OrderedExportItem[]
  /** false = Hauptinhalt (Drehbuch/Szenen) wird nicht exportiert */
  hauptinhaltAktiv?: boolean
  /** true = PDF-Lesezeichen / Inhaltsverzeichnis einbetten (Puppeteer outline+tagged) */
  pdfBookmarks?: boolean
  /** Name des Empfängers für {{persoenlicher_ausdruck}}-Chip */
  persoenlicher_ausdruck?: string
  /** Revisionsbezeichnung für {{revision}}-Chip, z.B. "Blaue Seiten" */
  revision?: string
  /** Hex-Farbe für {{revisions_farbe}}-Chip, z.B. "#4A90D9" */
  revisions_farbe_hex?: string
  /** Vergleichs-Werkstufe für Replacement Pages */
  compareWerkstufId?: string
  /** true = nur geänderte Seiten, false = alle Seiten mit Markierungen */
  revisionNurGeaendert?: boolean
  /** Rohtext-Eingabe für Szenen-Auswahl, z.B. "1,3,5-10,42A" */
  szenenAuswahl?: string
  /** Nur Szenen mit diesen Rollen-Namen (OR-Verknüpfung) */
  filterRollen?: string[]
  /** Nur Szenen mit diesen Motiv-Namen (OR-Verknüpfung) */
  filterMotive?: string[]
  /** Nur Szenen mit diesen Komparsen-Namen (ist_gruppe=true, OR-Verknüpfung) */
  filterKomparsen?: string[]
  /** IANA-Timezone des Users (Browser), z.B. "Europe/Berlin" — Fallback wenn kein Land in ProdDB */
  userTimezone?: string
  /** Offenes Wasserzeichen klein: Pers. Ausdruck zentriert in der Kopfzeile */
  wz_klein_aktiv?: boolean
  /** Offenes Wasserzeichen groß: Pers. Ausdruck diagonal über die Seite */
  wz_gross_aktiv?: boolean
  /** Farbe des großen Wasserzeichens als Hex, z.B. "#CCCCCC" */
  wz_gross_farbe?: string
}

export interface ExportJobParams {
  werkstufId: string
  format: ExportFormat
  userId: string
  userName: string
  options: ExportJobOptions
}

export interface JobResult {
  buffer: Buffer
  mimeType: string
  filename: string
}

export interface ExportJob {
  id: string
  params: ExportJobParams
  status: JobStatus
  progress: number
  error?: string
  result?: JobResult
  createdAt: Date
}

// ── In-Memory Store ───────────────────────────────────────────────────────────

const jobs = new Map<string, ExportJob>()
const JOB_TTL_MS = 10 * 60 * 1000 // 10 Minuten

// ── Public API ────────────────────────────────────────────────────────────────

/** Erstellt einen neuen Job und gibt die ID zurück. */
export function createJob(params: ExportJobParams): string {
  const id = randomUUID()
  jobs.set(id, {
    id,
    params,
    status: 'pending',
    progress: 0,
    createdAt: new Date(),
  })
  // Auto-Cleanup nach TTL
  setTimeout(() => jobs.delete(id), JOB_TTL_MS)
  return id
}

/** Gibt den aktuellen Job-Zustand zurück oder undefined wenn nicht gefunden/abgelaufen. */
export function getJob(id: string): ExportJob | undefined {
  return jobs.get(id)
}

/** Aktualisiert einzelne Felder eines Jobs. */
export function updateJob(id: string, update: Partial<ExportJob>): void {
  const job = jobs.get(id)
  if (job) jobs.set(id, { ...job, ...update })
}

/**
 * Führt einen Job asynchron aus.
 * Der Handler bekommt eine `setProgress(0-100)`-Funktion und gibt ein JobResult zurück.
 * Fehler im Handler werden automatisch als Job-Error gespeichert.
 */
export async function runJob(
  id: string,
  handler: (setProgress: (p: number) => void) => Promise<JobResult>
): Promise<void> {
  const job = jobs.get(id)
  if (!job) return

  updateJob(id, { status: 'running', progress: 5 })

  try {
    const result = await handler((p) => updateJob(id, { progress: Math.min(99, p) }))
    updateJob(id, { status: 'done', progress: 100, result })
  } catch (err: any) {
    updateJob(id, {
      status: 'error',
      error: err?.message ?? 'Unbekannter Fehler beim Export',
    })
  }
}
