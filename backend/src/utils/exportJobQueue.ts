/**
 * Export Job Queue — In-Process
 *
 * Einfache In-Memory-Queue für Export-Jobs ohne externe Abhängigkeiten.
 * Jobs werden nach JOB_TTL_MS automatisch entfernt.
 */

import { randomUUID } from 'crypto'

export type ExportFormat = 'pdf' | 'docx' | 'fountain' | 'fdx'
export type JobStatus = 'pending' | 'running' | 'done' | 'error'

export interface ExportJobOptions {
  /** IDs der Notiz-Werkstufen die vor dem Hauptdokument eingefügt werden */
  notizWerkstufIds?: string[]
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
