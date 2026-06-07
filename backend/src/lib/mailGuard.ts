/**
 * Mail-Guard — Staging-Schutz für ausgehende E-Mails.
 *
 * Wenn die Env-Variable MAIL_OVERRIDE_TO gesetzt ist (nur in Staging/Beta-Test-
 * Umgebungen), gehen ALLE E-Mails an genau diese eine Adresse statt an die echten
 * Empfänger. So lässt sich der Versand voll testen, ohne dass echte Personen aus
 * einer Prod-Daten-Kopie angeschrieben werden.
 *
 * In Produktion ist MAIL_OVERRIDE_TO nicht gesetzt → no-op (Originaladresse).
 */
export function guardMailTo(original: string): string {
  return process.env.MAIL_OVERRIDE_TO || original
}

/** True, wenn ein Override aktiv ist (z. B. für Wege, die per user_id statt to senden). */
export function mailOverrideActive(): boolean {
  return !!process.env.MAIL_OVERRIDE_TO
}
