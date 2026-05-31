// useWuensche.ts — API-Hook für das Wünsche-Feature
import { useState, useCallback, useEffect } from 'react';

export interface Wunsch {
  id: string;
  titel: string;
  beschreibung?: string;
  app_kontext?: string;
  status: 'offen' | 'erfuellt' | 'abgelehnt';
  votes: number;
  eingereicht_am: string;
  ist_eigener?: boolean;
  hat_gevoted?: boolean;
}

export interface WunschNotification {
  notification_id: string;
  wunsch_id: string;
  titel: string;
  beschreibung?: string;
  ki_zusammenfassung?: string;
  admin_beschreibung?: string;
  wo_zu_finden?: string;
  erfuellt_am: string;
  anhaenge: Array<{ typ: string; dateiname: string; pfad: string }>;
}

export interface WunschDialoge {
  alle: Record<string, string[]>;
  aktuell: {
    saison?: string;
    ki_check?: string;
    bestaetigung?: string;
  };
}

export interface MistralVorschlag {
  titel: string;
  beschreibung: string;
}

interface UseWuenscheOptions {
  authApiBase: string;
  appKontext: string;
}

export function useWuensche({ authApiBase, appKontext }: UseWuenscheOptions) {
  const [wuensche, setWuensche] = useState<Wunsch[]>([]);
  const [erfuellte, setErfuellte] = useState<Wunsch[]>([]);
  const [notifications, setNotifications] = useState<WunschNotification[]>([]);
  const [dialoge, setDialoge] = useState<WunschDialoge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${authApiBase}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
    return data;
  }, [authApiBase]);

  const loadListe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api('GET', '/api/wuensche');
      setWuensche(d.wuensche || []);
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
    setLoading(false);
  }, [api]);

  const loadErfuellte = useCallback(async () => {
    try {
      const d = await api('GET', '/api/wuensche/erfuellt');
      setErfuellte(d.wuensche || []);
    } catch(e) {}
  }, [api]);

  const loadDialoge = useCallback(async () => {
    try {
      const d = await api('GET', '/api/wuensche/dialoge');
      setDialoge(d);
    } catch(e) {}
  }, [api]);

  const checkNotifications = useCallback(async (): Promise<WunschNotification[]> => {
    try {
      const d = await api('GET', '/api/wuensche/notifications/pending');
      const notifs = d.notifications || [];
      setNotifications(notifs);
      return notifs;
    } catch(e) {
      return [];
    }
  }, [api]);

  const dismissNotification = useCallback(async (notificationId: string) => {
    try {
      await api('POST', `/api/wuensche/notifications/${notificationId}/dismiss`);
      setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
    } catch(e) {}
  }, [api]);

  const submitWunsch = useCallback(async (
    titel: string,
    beschreibung: string,
    kiGeprueft: boolean,
    kiVorschlagText?: string,
    kiVorschlagAngenommen?: boolean
  ): Promise<{ wunsch: Wunsch; spruch: string }> => {
    const d = await api('POST', '/api/wuensche', {
      titel,
      beschreibung,
      app_kontext: appKontext,
      ki_geprueft: kiGeprueft,
      ki_vorschlag_text: kiVorschlagText || null,
      ki_vorschlag_angenommen: kiVorschlagAngenommen ?? null,
    });
    await loadListe();
    return d;
  }, [api, appKontext, loadListe]);

  const vote = useCallback(async (wunschId: string, add: boolean): Promise<number> => {
    const method = add ? 'POST' : 'DELETE';
    const d = await api(method, `/api/wuensche/${wunschId}/vote`, add ? {} : undefined);
    setWuensche(prev => prev.map(w => w.id === wunschId ? { ...w, votes: d.votes, hat_gevoted: add } : w));
    return d.votes;
  }, [api]);

  const deleteWunsch = useCallback(async (wunschId: string) => {
    await api('DELETE', `/api/wuensche/${wunschId}`);
    setWuensche(prev => prev.filter(w => w.id !== wunschId));
  }, [api]);

  const checkMistral = useCallback(async (
    titel: string,
    beschreibung: string
  ): Promise<{ vorschlag: MistralVorschlag | null; fehler?: string }> => {
    const d = await api('POST', '/api/wuensche/mistral-check', { titel, beschreibung });
    return d;
  }, [api]);

  return {
    wuensche,
    erfuellte,
    notifications,
    dialoge,
    loading,
    error,
    loadListe,
    loadErfuellte,
    loadDialoge,
    checkNotifications,
    dismissNotification,
    submitWunsch,
    vote,
    deleteWunsch,
    checkMistral,
  };
}
