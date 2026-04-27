/**
 * AnnotationBadge (sw-ui)
 *
 * Zeigt die Anzahl Annotations an einem Datensatz/Feld als kleines Badge.
 * Klick öffnet ein Slide-over Panel mit Zeitstrahl + Eingabefeld.
 *
 * Usage:
 *   <AnnotationBadge
 *     anchorApp="vertraege"
 *     anchorRecordId="uuid-des-vertrags"
 *     anchorField="gage_betrag"   // optional
 *     productionId="uuid"
 *     anchorUrl="https://script.serienwerft.studio?scene=123"  // optional
 *   />
 */
import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Lock, Eye, AlertTriangle, Send, Loader2, ExternalLink } from 'lucide-react';

const MESSENGER_API = 'https://messenger.serienwerft.studio/api';

export interface AnnotationBadgeProps {
  anchorApp: string;
  anchorRecordId: string;
  anchorField?: string;
  productionId: string;
  currentVersion?: number;
  /** Optional deep-link back to source record (e.g. Script-App scene URL) */
  anchorUrl?: string;
  /** Label for the deep-link button. Default: "In App öffnen" */
  anchorUrlLabel?: string;
  className?: string;
}

interface Annotation {
  id: string;
  content_html: string;
  content_text: string;
  author_username: string;
  author_display_name?: string;
  author_avatar?: string;
  visibility: 'all' | 'private';
  created_at: string;
  anchor_version?: number;
  outdated?: boolean;
  current_version?: number;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${MESSENGER_API}${path}`, {
    credentials: 'include',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function AnnotationBadge({
  anchorApp,
  anchorRecordId,
  anchorField,
  productionId,
  currentVersion,
  anchorUrl,
  anchorUrlLabel = 'In App öffnen',
  className = '',
}: AnnotationBadgeProps) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({ app: anchorApp, record_id: anchorRecordId });
    if (anchorField) params.set('field', anchorField);
    apiFetch(`/annotations/count?${params}`)
      .then((d) => setCount(d.count))
      .catch(() => setCount(null));
  }, [anchorApp, anchorRecordId, anchorField]);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
    loadAnnotations();
  }

  async function loadAnnotations() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ app: anchorApp, record_id: anchorRecordId });
      if (anchorField) params.set('field', anchorField);
      if (currentVersion != null) params.set('current_version', String(currentVersion));
      const data = await apiFetch(`/annotations?${params}`);
      setAnnotations(data.annotations ?? []);
    } catch {
      setError('Annotations konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleTextChange(val: string) {
    if (/@privat\b/i.test(val)) {
      setIsPrivate(true);
      setText(val.replace(/@privat\b\s*/gi, ''));
    } else {
      setText(val);
    }
  }

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: any = {
        content: text.trim(),
        content_html: `<p>${text.trim()}</p>`,
        anchor_app: anchorApp,
        anchor_record_id: anchorRecordId,
        production_id: productionId,
        visibility: isPrivate ? 'private' : 'all',
      };
      if (anchorField) body.anchor_field = anchorField;
      if (currentVersion != null) body.anchor_version = currentVersion;

      const created = await apiFetch('/annotations', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setText('');
      setIsPrivate(false);
      setAnnotations((prev) => [...prev, created]);
      setCount((c) => (c ?? 0) + 1);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch {
      setError('Annotation konnte nicht gespeichert werden.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    try {
      await apiFetch(`/annotations/${id}/archive`, { method: 'POST' });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      setCount((c) => Math.max((c ?? 1) - 1, 0));
    } catch {
      setError('Archivieren fehlgeschlagen.');
    }
  }

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        onClick={handleOpen}
        title={`Annotations ${anchorField ? `für Feld "${anchorField}"` : 'für diesen Datensatz'}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium
          bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-slate-400
          hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400
          border border-slate-200 dark:border-[#2a2a2a] hover:border-blue-200 dark:hover:border-blue-800
          transition-all cursor-pointer select-none"
        aria-label={`${count ?? 0} Annotations`}
      >
        <MessageSquare size={10} />
        {count != null && count > 0 && (
          <span className="font-semibold text-blue-600 dark:text-blue-400">{count}</span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute z-[9999] bg-white dark:bg-[#111] border border-slate-200 dark:border-[#222]
            rounded-xl shadow-2xl w-[360px] max-h-[520px] flex flex-col"
          style={{ top: '120%', right: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#1f1f1f]">
            <span className="text-sm font-semibold text-black dark:text-white flex items-center gap-1.5">
              <MessageSquare size={14} />
              Annotations
              {anchorField && (
                <span className="text-xs font-normal text-slate-400 dark:text-slate-600">
                  · {anchorField}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {anchorUrl && (
                <a
                  href={anchorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400
                    hover:underline font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                  {anchorUrlLabel}
                </a>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-black dark:hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Zeitstrahl */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-slate-400" />
              </div>
            )}
            {!loading && annotations.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4">
                Noch keine Annotations. Schreibe die erste!
              </p>
            )}
            {annotations.map((a) => (
              <div
                key={a.id}
                className="bg-slate-50 dark:bg-[#1a1a1a] rounded-lg p-3 border border-slate-100 dark:border-[#2a2a2a]"
              >
                {a.outdated && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400
                    bg-orange-50 dark:bg-orange-900/20 rounded-md px-2.5 py-1.5 mb-2">
                    <AlertTriangle size={12} />
                    Bezieht sich auf Version {a.anchor_version}. Aktuelle Version: {a.current_version}.
                  </div>
                )}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-black dark:text-white">
                    {a.author_display_name || a.author_username}
                  </span>
                  <span className="text-[10px] text-slate-400">{fmt(a.created_at)}</span>
                </div>
                <div
                  className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: a.content_html || '' }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    {a.visibility === 'private'
                      ? <><Lock size={9} className="text-orange-400" /> Nur du</>
                      : <><Eye size={9} /> Sichtbar für alle</>
                    }
                  </span>
                  <button
                    onClick={() => handleArchive(a.id)}
                    className="text-[10px] text-slate-300 dark:text-slate-700 hover:text-slate-500
                      dark:hover:text-slate-400 transition-colors"
                    title="Archivieren"
                  >
                    archivieren
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Eingabebereich */}
          <div className="border-t border-slate-100 dark:border-[#1f1f1f] px-4 py-3">
            {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
            {isPrivate && (
              <div className="flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 mb-1.5">
                <Lock size={10} /> Nur für dich sichtbar
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  handleTextChange(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Annotation schreiben… (@privat = nur für dich)"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-[#2a2a2a]
                  bg-white dark:bg-[#0a0a0a] text-sm text-black dark:text-white px-3 py-2
                  placeholder:text-slate-400 dark:placeholder:text-slate-600
                  focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600
                  transition-all overflow-hidden"
                style={{ minHeight: '38px' }}
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setIsPrivate((p) => !p)}
                  title={isPrivate ? 'Privat — Klick für öffentlich' : 'Klick für privat'}
                  className={`p-2 rounded-lg border transition-colors ${
                    isPrivate
                      ? 'border-orange-300 dark:border-orange-700 text-orange-500 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-slate-200 dark:border-[#2a2a2a] text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Lock size={14} />
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || submitting}
                  className="p-2 rounded-lg bg-black dark:bg-white text-white dark:text-black
                    hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-40
                    disabled:cursor-not-allowed transition-colors"
                  title="Senden (Cmd/Ctrl + Enter)"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-300 dark:text-slate-700 mt-1.5">
              Cmd/Ctrl + Enter zum Senden
            </p>
          </div>
        </div>
      )}
    </span>
  );
}

export default AnnotationBadge;
