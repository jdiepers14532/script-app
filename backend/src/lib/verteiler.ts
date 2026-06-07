/**
 * Verteiler-System — gemeinsame Helfer (Schritt 2).
 *
 * Bündelt Config (Feature-Flags, TTL, URLs, Secrets), Token-Erzeugung/-Hashing,
 * die Cross-App-Auflösung gegen vertraege.app (E-Mail + Besetzung) sowie die
 * Ableitung des Anzeige-Status (§10).
 *
 * Mailversand wird hier NICHT verdrahtet — das passiert in Schritt 3.
 */
import * as crypto from 'crypto'

// ── Config ──────────────────────────────────────────────────────────────────
/** Öffentliche Basis-URL der Script-App (für Token-Links). */
export const APP_URL = process.env.APP_URL || 'https://script.serienwerft.studio'

/** Token-Gültigkeit in Tagen (Default 14, analog DSGVO-Self-Service). */
export const TOKEN_TTL_TAGE = parseInt(process.env.VERTEILER_TOKEN_TTL_TAGE || '14', 10) || 14

/**
 * Feature-Flag für den gesamten "Ausdrucken"-Pfad (Büro-Agent, Druckvarianten,
 * Abholort). In Schritt 2 deaktiviert ausgeliefert — Routen existieren als Stub.
 */
export const DRUCK_FEATURE_ENABLED = process.env.VERTEILER_DRUCK_ENABLED === 'true'

/**
 * Shared Secret für eingehende mail-status-Callbacks von der auth.app.
 * MUSS in Schritt 3 mit dem Wert auf auth-Seite übereinstimmen (Header
 * X-Mail-Service-Secret).
 */
export const MAIL_SERVICE_SECRET = process.env.MAIL_SERVICE_SECRET || 'SerienwerftMailService2026'

// vertraege.app — Adressbuch + Besetzung (Source of Truth). Muster aus
// routes/autorenplan.ts (VERTRAEGE_INTERNAL_URL + PROD_INTERNAL_SECRET, Header
// X-Internal-Secret).
const VERTRAEGE_URL = process.env.VERTRAEGE_INTERNAL_URL || 'http://127.0.0.1:3003'
const VERTRAEGE_SECRET = process.env.PROD_INTERNAL_SECRET || 'prod-internal-2026'

// ── Token ───────────────────────────────────────────────────────────────────
/**
 * Erzeugt ein sicheres Zugriffstoken. Klartext (`token`) wird AUSSCHLIESSLICH
 * für den Link zurückgegeben und nie gespeichert; abgelegt wird nur `hash`.
 */
export function generateToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

/** SHA-256-Hash (hex) eines Klartext-Tokens — Basis für den Lookup. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Baut den öffentlichen Portal-Link aus einem Klartext-Token. */
export function portalLink(token: string): string {
  return `${APP_URL}/v/${token}`
}

/** Ablaufzeitpunkt ab jetzt + TTL. */
export function tokenAblauf(): Date {
  return new Date(Date.now() + TOKEN_TTL_TAGE * 24 * 60 * 60 * 1000)
}

// ── Cross-App vertraege.app ───────────────────────────────────────────────────
async function vertraegeGet(path: string): Promise<any | null> {
  try {
    const r = await fetch(`${VERTRAEGE_URL}${path}`, {
      headers: { 'X-Internal-Secret': VERTRAEGE_SECRET },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/**
 * Löst die E-Mail (+ Anzeigename) zu einer kontakt_id aus vertraege.app auf.
 * Kontaktdaten werden NICHT kopiert, sondern erst zum Versandzeitpunkt
 * referenziert (vertraege = Source of Truth + Feldgruppen/DSGVO).
 *
 * Gibt null zurück, wenn nicht auflösbar (Aufrufer überspringt den Empfänger
 * und meldet das — kein stiller Fehlschlag, keine NULL-Verletzung).
 *
 * TODO Schritt 3: Den exakten vertraege-Internal-Endpoint bestätigen
 * (Pfad/Response-Shape sind hier eine dokumentierte Annahme).
 */
export async function resolveKontaktEmail(
  kontaktId: string
): Promise<{ email: string; name: string | null } | null> {
  const data = await vertraegeGet(`/api/internal/kontakt/${kontaktId}`)
  const email: string | undefined = data?.email || data?.e_mail || data?.kontakt?.email
  if (!email) return null
  const name: string | null = data?.name || data?.anzeigename || data?.kontakt?.name || null
  return { email, name }
}

export interface BesetzungInfo {
  ist_schauspieler: boolean
  figuren: Array<{ character_id: string; name: string | null }>
  /** true, wenn die Besetzung gegen vertraege nicht aufgelöst werden konnte. */
  nicht_aufloesbar?: boolean
}

/**
 * Löst Schauspieler:in-Status + gespielte Figur(en) zu einer kontakt_id live aus
 * der Besetzungsmatrix (vertraege.app) auf. Die Verknüpfung Kontakt↔Figur liegt
 * NICHT in script_db, daher Cross-App.
 *
 * Bei Crew / freier E-Mail ohne Zuordnung → ist_schauspieler=false (Sides
 * ausgegraut). Wenn vertraege nicht antwortet → nicht_aufloesbar=true.
 *
 * TODO Schritt 3: vertraege-Besetzungs-Endpoint + Mapping der Figuren-IDs auf
 * script_db.characters.id bestätigen.
 */
export async function resolveBesetzung(
  kontaktId: string | null,
  produktionId: string
): Promise<BesetzungInfo> {
  if (!kontaktId) return { ist_schauspieler: false, figuren: [] }
  const data = await vertraegeGet(
    `/api/internal/besetzung?kontakt_id=${encodeURIComponent(kontaktId)}&produktion_id=${encodeURIComponent(produktionId)}`
  )
  if (!data) return { ist_schauspieler: false, figuren: [], nicht_aufloesbar: true }
  const figuren = Array.isArray(data.figuren)
    ? data.figuren
        .map((f: any) => ({ character_id: f.character_id || f.figur_id || f.id, name: f.name ?? null }))
        .filter((f: any) => f.character_id)
    : []
  return { ist_schauspieler: figuren.length > 0, figuren }
}

// ── Anzeige-Status (§10) ──────────────────────────────────────────────────────
export interface EmpfaengerStatusFelder {
  zustellung: string
  gesendet_am?: any
  zugestellt_am?: any
  opened_at?: any
  downloaded_at?: any
  printed_at?: any
  picked_up_at?: any
}

/**
 * Abgeleiteter Anzeige-Status nach Priorität (§10):
 * gebounced → abgeholt → gedruckt → geladen → geöffnet → zugestellt →
 * versendet → in Warteschlange → abgelaufen.
 */
export function deriveAnzeigeStatus(e: EmpfaengerStatusFelder): string {
  if (e.zustellung === 'bounced') return 'gebounced'
  if (e.picked_up_at) return 'abgeholt'
  if (e.printed_at) return 'gedruckt'
  if (e.downloaded_at) return 'geladen'
  if (e.opened_at) return 'geoeffnet'
  if (e.zustellung === 'delivered' || e.zugestellt_am) return 'zugestellt'
  if (e.zustellung === 'sent' || e.gesendet_am) return 'versendet'
  if (e.zustellung === 'queued') return 'in_warteschlange'
  if (e.zustellung === 'expired') return 'abgelaufen'
  return e.zustellung
}

// ── Mailversand über die zentrale auth send-mail (Schritt 3) ──────────────────
const AUTH_URL = process.env.AUTH_INTERNAL_URL || 'http://127.0.0.1:3002'
const INTERNAL_SECRET_KEY = process.env.INTERNAL_SECRET_KEY || 'SerienwerftInternalKey2026xQzP'

/** Message-ID = Basis für die Bounce-Zuordnung (correlation_id = distribution_empfaenger.id). */
export function correlationMessageId(empfaengerId: string): string {
  return `<${empfaengerId}@script.serienwerft.studio>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface VerteilerMailCtx {
  to: string
  name?: string | null
  betreff?: string | null
  text?: string | null
  link: string
  produktion?: string | null
  folge?: string | number | null
  werkstufe?: string | null
  version?: string | number | null
  correlationId: string   // = distribution_empfaenger.id
}

const DEFAULT_BETREFF = 'Neue Fassung: {Produktion} – {Folge} ({Werkstufe} v{Version})'
const DEFAULT_TEXT =
  'Hallo {Name},\n\nes liegt eine neue Fassung vor ({Werkstufe} v{Version}). ' +
  'Über den folgenden Link kannst du sie ansehen und herunterladen:\n\n{Link}\n\nViele Grüße\nDrehbuchkoordination'

function fillSubject(tpl: string, c: VerteilerMailCtx): string {
  return tpl
    .replace(/\{Name\}/g, c.name ?? '')
    .replace(/\{Produktion\}/g, c.produktion ?? '')
    .replace(/\{Folge\}/g, c.folge != null ? String(c.folge) : '')
    .replace(/\{Werkstufe\}/g, c.werkstufe ?? '')
    .replace(/\{Version\}/g, c.version != null ? String(c.version) : '')
    .replace(/\{Link\}/g, c.link)
}

// HTML-Body: erst escapen, dann Werte (escaped) + {Link} als Anchor einsetzen, \n -> <br>
function fillHtmlBody(rawText: string, c: VerteilerMailCtx): string {
  return escapeHtml(rawText)
    .replace(/\{Name\}/g, escapeHtml(c.name ?? ''))
    .replace(/\{Produktion\}/g, escapeHtml(c.produktion ?? ''))
    .replace(/\{Folge\}/g, escapeHtml(c.folge != null ? String(c.folge) : ''))
    .replace(/\{Werkstufe\}/g, escapeHtml(c.werkstufe ?? ''))
    .replace(/\{Version\}/g, escapeHtml(c.version != null ? String(c.version) : ''))
    .replace(/\{Link\}/g, `<a href="${c.link}">${escapeHtml(c.link)}</a>`)
    .replace(/\n/g, '<br>')
}

/**
 * Sendet die Verteiler-Mail über die zentrale auth send-mail (Link-first, body-only).
 * message_id = <correlation_id@script.serienwerft.studio> für Bounce-Zuordnung.
 * Wirft NICHT — gibt { ok, error? } zurück; der Aufrufer behandelt Fehler explizit
 * (kein stilles Verschlucken).
 */
export async function sendVerteilerMail(c: VerteilerMailCtx): Promise<{ ok: boolean; error?: string }> {
  try {
    const subject = fillSubject((c.betreff && c.betreff.trim()) ? c.betreff : DEFAULT_BETREFF, c)
    const rawText = (c.text && c.text.trim()) ? c.text : DEFAULT_TEXT
    const html = `<div style="font-size:14px;line-height:1.6">${fillHtmlBody(rawText, c)}</div>`
    const r = await fetch(`${AUTH_URL}/api/internal/send-mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_SECRET_KEY },
      body: JSON.stringify({ to: c.to, subject, html, message_id: correlationMessageId(c.correlationId) }),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, error: `send-mail HTTP ${r.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
