import React, { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanyAddress {
  street: string;
  zip: string;
  city: string;
  country: string;
}

interface CompanyData {
  company_name: string;
  company_legal_form: string;
  company_address: CompanyAddress;
  company_register_court: string;
  company_register_number: string;
  company_vat_id: string;
  company_tax_id: string;
  company_email: string;
  company_phone: string;
  logos: {
    light: string | null;
    dark: string | null;
    light2?: string | null;
    dark2?: string | null;
  };
}

interface EdvContact {
  id: number;
  name: string;
  rufname: string | null;
  email: string | null;
  ms_teams: string | null;
  telefon: string | null;
}

export interface CompanyInfoModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Base URL of the auth service.
   * Fetches: GET {authUrl}/api/public/company-info
   *          GET {authUrl}/api/public/edv-contacts
   *          GET {authUrl}/api/public/logo-file?variant=light|dark|light2|dark2
   */
  authUrl?: string;
  /**
   * Base URL of the Vertragsdatenbank service.
   * Fetches: GET {vertraegeUrl}/api/public/edv-person-foto/{id}
   */
  vertraegeUrl?: string;
  dark?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEGAL_FORMS: Record<string, string> = {
  gmbh: 'GmbH', ag: 'AG', ug: 'UG (haftungsbeschränkt)',
  gbr: 'GbR', kg: 'KG', ohg: 'OHG', einzelunternehmen: 'Einzelunternehmen',
};
function legalLabel(lf: string) { return LEGAL_FORMS[lf] || lf.toUpperCase(); }

const LOGO_VARIANTS = ['light', 'dark', 'light2', 'dark2'] as const;
type LogoVariant = typeof LOGO_VARIANTS[number];

/** Copy an image URL as a PNG file to clipboard via Canvas API */
async function copyImageToClipboard(imageUrl: string): Promise<void> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// ─── SVG Icons (inline, no lucide dependency) ─────────────────────────────────

const icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  building: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 22V12h6v10" /><path d="M9 7h1m4 0h1M9 12h1m4 0h1" />
    </svg>
  ),
  mapPin: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  receipt: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><rect x="4" y="7" width="16" height="13" rx="2" />
    </svg>
  ),
  fileCheck: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="9 15 11 17 15 13" />
    </svg>
  ),
  mail: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  phone: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.09 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  user: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  image: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  // Teams icon (simplified T shape)
  teamsMsg: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  teamsCall: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.09 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  teamsVideo: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  ),
  check: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  copy: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyRow({ icon, label, value, copied, onCopy, s }: {
  icon: React.ReactNode; label: string; value: string; copied: boolean; onCopy: () => void; s: Styles;
}) {
  return (
    <button onClick={onCopy} title="Kopieren" style={s.copyRow}>
      <span style={s.copyIcon}>{icon}</span>
      <span style={s.copyLabel}>{label}</span>
      <span style={s.copyBtn}>{copied ? icons.check : icons.copy}</span>
    </button>
  );
}

// ─── Logo Grid Panel ──────────────────────────────────────────────────────────

function LogoPanel({
  authUrl, logos, s, isDark,
}: {
  authUrl: string;
  logos: CompanyData['logos'];
  s: Styles;
  isDark: boolean;
}) {
  const [copiedVariant, setCopiedVariant] = useState<LogoVariant | null>(null);
  const [copyError, setCopyError] = useState<LogoVariant | null>(null);

  // Filter to variants that have a value
  const available = LOGO_VARIANTS.filter(v => logos[v]);
  if (available.length === 0) return null;

  const handleCopy = async (variant: LogoVariant) => {
    const fileUrl = `${authUrl}/api/public/logo-file?variant=${variant}`;
    try {
      await copyImageToClipboard(fileUrl);
      setCopiedVariant(variant);
      setTimeout(() => setCopiedVariant(null), 1800);
    } catch {
      setCopyError(variant);
      setTimeout(() => setCopyError(null), 1800);
    }
  };

  const variantLabel: Record<LogoVariant, string> = {
    light: 'Logo hell',
    dark: 'Logo dunkel',
    light2: 'Logo 2 hell',
    dark2: 'Logo 2 dunkel',
  };

  const variantBg: Record<LogoVariant, string> = {
    light: '#ffffff',
    dark: '#111111',
    light2: '#ffffff',
    dark2: '#111111',
  };

  return (
    <div style={s.logoPanel}>
      <div style={s.logoPanelLabel}>Logos — klick zum Kopieren</div>
      <div style={s.logoGrid}>
        {available.map(variant => {
          const fileUrl = `${authUrl}/api/public/logo-file?variant=${variant}`;
          const bg = variantBg[variant];
          const isCopied = copiedVariant === variant;
          const isError = copyError === variant;
          return (
            <button
              key={variant}
              onClick={() => handleCopy(variant)}
              title={`${variantLabel[variant]} als PNG kopieren`}
              style={{ ...s.logoGridItem, background: bg }}
            >
              <img
                src={fileUrl}
                alt={variantLabel[variant]}
                style={{ maxWidth: '100%', maxHeight: 48, objectFit: 'contain', display: 'block' }}
              />
              {isCopied && (
                <span style={s.logoGridBadge}>
                  {icons.check} Kopiert
                </span>
              )}
              {isError && (
                <span style={{ ...s.logoGridBadge, color: '#FF3B30' }}>
                  Fehler
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── EDV Contact Card ─────────────────────────────────────────────────────────

function EdvContactCard({
  contact, vertraegeUrl, s, isDark,
}: {
  contact: EdvContact;
  vertraegeUrl: string;
  s: Styles;
  isDark: boolean;
}) {
  const teamsTarget = contact.ms_teams || contact.email;
  const teamsBase = teamsTarget ? encodeURIComponent(teamsTarget) : '';

  const displayName = contact.rufname
    ? `${contact.rufname} ${contact.name.split(' ').slice(-1)[0]}`
    : contact.name;

  const avatarUrl = `${vertraegeUrl}/api/public/edv-person-foto/${contact.id}`;

  return (
    <div style={s.contactCard}>
      {/* Avatar */}
      <div style={s.contactAvatar}>
        <img
          src={avatarUrl}
          alt={displayName}
          style={s.contactAvatarImg}
          onError={e => {
            const el = e.currentTarget;
            el.style.display = 'none';
            const fallback = el.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div style={{ ...s.contactAvatarFallback, display: 'none' }}>
          {icons.user}
        </div>
      </div>

      {/* Info */}
      <div style={s.contactInfo}>
        <div style={s.contactName}>{displayName}</div>

        {/* Phone */}
        {contact.telefon ? (
          <div style={s.contactDetail}>
            <span style={s.contactDetailIcon}>{icons.phone}</span>
            <span>{contact.telefon}</span>
          </div>
        ) : (
          <div style={{ ...s.contactDetail, ...s.contactPlaceholder }}>
            <span style={s.contactDetailIcon}>{icons.phone}</span>
            <span>Keine Telefonnummer hinterlegt</span>
          </div>
        )}

        {/* Email */}
        {contact.email ? (
          <div style={s.contactDetail}>
            <span style={s.contactDetailIcon}>{icons.mail}</span>
            <span>{contact.email}</span>
          </div>
        ) : (
          <div style={{ ...s.contactDetail, ...s.contactPlaceholder }}>
            <span style={s.contactDetailIcon}>{icons.mail}</span>
            <span>Keine E-Mail hinterlegt</span>
          </div>
        )}

        {/* Teams buttons */}
        {teamsBase ? (
          <div style={s.teamsButtons}>
            <a
              href={`https://teams.microsoft.com/l/chat/0/0?users=${teamsBase}`}
              target="_blank" rel="noreferrer"
              style={s.teamsBtn}
              title="Nachricht in Teams"
            >
              {icons.teamsMsg}
              <span>Nachricht</span>
            </a>
            <a
              href={`https://teams.microsoft.com/l/call/0/0?users=${teamsBase}`}
              target="_blank" rel="noreferrer"
              style={s.teamsBtn}
              title="Anruf in Teams"
            >
              {icons.teamsCall}
              <span>Anruf</span>
            </a>
            <a
              href={`https://teams.microsoft.com/l/call/0/0?users=${teamsBase}&withVideo=true`}
              target="_blank" rel="noreferrer"
              style={s.teamsBtn}
              title="Videocall in Teams"
            >
              {icons.teamsVideo}
              <span>Video</span>
            </a>
          </div>
        ) : (
          <div style={{ ...s.contactDetail, ...s.contactPlaceholder }}>
            <span style={s.contactDetailIcon}>{icons.mail}</span>
            <span>Kein Teams-Kontakt hinterlegt</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CompanyInfoModal({
  open,
  onClose,
  authUrl = 'https://auth.serienwerft.studio',
  vertraegeUrl = 'https://vertraege.serienwerft.studio',
  dark,
}: CompanyInfoModalProps) {
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [edvContacts, setEdvContacts] = useState<EdvContact[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [showLogos, setShowLogos] = useState(false);

  // Dark mode detection
  useEffect(() => {
    if (dark !== undefined) { setIsDark(dark); return; }
    const detect = () => setIsDark(
      document.documentElement.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark'
    );
    detect();
    const obs = new MutationObserver(detect);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => obs.disconnect();
  }, [dark]);

  // Fetch data when first opened
  useEffect(() => {
    if (!open || company) return;
    fetch(`${authUrl}/api/public/company-info`)
      .then(r => r.json()).then(setCompany).catch(() => {});
    fetch(`${authUrl}/api/public/edv-contacts`)
      .then(r => r.json()).then(d => setEdvContacts(d.contacts || [])).catch(() => {});
  }, [open, authUrl, company]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const copy = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }, []);

  if (!open) return null;

  const s = makeStyles(isDark);

  const addr = company?.company_address;
  const addrStr = addr?.street ? `${addr.street}, ${addr.zip} ${addr.city}` : '';
  const regNum = company?.company_register_number || '';
  const hrbLabel = regNum
    ? `${/^hrb\s/i.test(regNum) ? '' : 'HRB '}${regNum}${company?.company_register_court ? ` · ${company.company_register_court}` : ''}`
    : '';
  const hrbValue = regNum ? `${/^hrb\s/i.test(regNum) ? '' : 'HRB '}${regNum}` : '';

  // Check if any logos exist
  const logos = company?.logos;
  const hasLogos = logos && (logos.light || logos.dark || logos.light2 || logos.dark2);

  return (
    <>
      <div onClick={onClose} style={s.overlay} />
      <div style={s.modal} role="dialog" aria-modal="true">

        {/* Header */}
        <div style={s.header}>
          {company?.logos?.light ? (
            <img
              src={company.logos.light}
              alt={company.company_name || 'Logo'}
              style={{ height: 36, maxWidth: 200, objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <span style={s.logoFallback}>{company?.company_name || 'Serienwerft'}</span>
          )}
          <div style={{ flex: 1 }} />
          {hasLogos && (
            <button
              onClick={() => setShowLogos(v => !v)}
              style={{ ...s.iconBtn, color: showLogos ? '#6264a7' : undefined }}
              title="Logos anzeigen"
            >
              {icons.image}
            </button>
          )}
          <button onClick={onClose} style={s.iconBtn} title="Schließen">{icons.close}</button>
        </div>

        {/* Logo panel (inline, toggleable) */}
        {showLogos && company && logos && (
          <LogoPanel authUrl={authUrl} logos={logos} s={s} isDark={isDark} />
        )}

        <div style={s.body}>
          {/* Pflichtangaben */}
          <div style={s.sectionLabel}>Pflichtangaben</div>
          <div style={s.rows}>
            {company?.company_name && (
              <CopyRow s={s} icon={icons.building}
                label={`${company.company_name}${company.company_legal_form ? ' · ' + legalLabel(company.company_legal_form) : ''}`}
                value={`${company.company_name} ${legalLabel(company.company_legal_form || '')}`}
                copied={copiedKey === 'name'} onCopy={() => copy('name', `${company!.company_name} ${legalLabel(company!.company_legal_form || '')}`)}
              />
            )}
            {addrStr && (
              <CopyRow s={s} icon={icons.mapPin} label={addrStr} value={addrStr}
                copied={copiedKey === 'addr'} onCopy={() => copy('addr', addrStr)}
              />
            )}
            {company?.company_vat_id && (
              <CopyRow s={s} icon={icons.receipt} label={`USt-ID: ${company.company_vat_id}`} value={company.company_vat_id}
                copied={copiedKey === 'vat'} onCopy={() => copy('vat', company!.company_vat_id)}
              />
            )}
            {company?.company_tax_id && (
              <CopyRow s={s} icon={icons.receipt} label={`Steuernummer: ${company.company_tax_id}`} value={company.company_tax_id}
                copied={copiedKey === 'tax'} onCopy={() => copy('tax', company!.company_tax_id)}
              />
            )}
            {hrbLabel && (
              <CopyRow s={s} icon={icons.fileCheck} label={hrbLabel} value={hrbValue}
                copied={copiedKey === 'hrb'} onCopy={() => copy('hrb', hrbValue)}
              />
            )}
            {company?.company_email && (
              <CopyRow s={s} icon={icons.mail} label={company.company_email} value={company.company_email}
                copied={copiedKey === 'email'} onCopy={() => copy('email', company!.company_email)}
              />
            )}
            {company?.company_phone && (
              <CopyRow s={s} icon={icons.phone} label={company.company_phone} value={company.company_phone}
                copied={copiedKey === 'phone'} onCopy={() => copy('phone', company!.company_phone)}
              />
            )}
          </div>

          {/* EDV Ansprechpartner */}
          <div style={s.divider} />
          <div style={s.sectionLabel}>EDV Ansprechpartner</div>
          <div style={s.rows}>
            {edvContacts.length > 0 ? edvContacts.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <div style={s.contactDivider} />}
                <EdvContactCard
                  contact={c}
                  vertraegeUrl={vertraegeUrl}
                  s={s}
                  isDark={isDark}
                />
              </React.Fragment>
            )) : (
              <div style={s.emptyNote}>Nicht konfiguriert · Auth-App → Firmenstammdaten → EDV</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Styles factory ───────────────────────────────────────────────────────────

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(dark: boolean) {
  const bg = dark ? '#141414' : '#ffffff';
  const border = dark ? '#2a2a2a' : '#eeeeee';
  const text = dark ? '#ffffff' : '#000000';
  const textSec = dark ? '#a0a0a0' : '#757575';
  const textMuted = dark ? '#6b6b6b' : '#9e9e9e';
  const teamsColor = '#6264a7';

  return {
    overlay: {
      position: 'fixed' as const, inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
    },
    modal: {
      position: 'fixed' as const, top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)', zIndex: 9001,
      width: 440, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)',
      overflowY: 'auto' as const,
      background: bg, border: `1px solid ${border}`, borderRadius: 14,
      boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      fontSize: 13, color: text,
    },
    header: {
      display: 'flex' as const, alignItems: 'center', gap: 6,
      padding: '12px 12px 10px 16px', borderBottom: `1px solid ${border}`,
      position: 'sticky' as const, top: 0, background: bg, zIndex: 1,
    },
    logoFallback: {
      fontSize: 15, fontWeight: 700, color: text, letterSpacing: '-0.01em',
    },
    iconBtn: {
      width: 28, height: 28, borderRadius: 6, border: 'none',
      background: 'transparent', color: textSec,
      display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0,
    },
    // Logo panel
    logoPanel: {
      borderBottom: `1px solid ${border}`,
      padding: '10px 16px 12px',
      background: dark ? '#111111' : '#fafafa',
    },
    logoPanelLabel: {
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
      letterSpacing: '0.5px', color: textMuted, marginBottom: 8,
    },
    logoGrid: {
      display: 'grid' as const,
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 8,
    },
    logoGridItem: {
      position: 'relative' as const,
      border: `1px solid ${border}`,
      borderRadius: 8, padding: '10px 12px',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 64, overflow: 'hidden',
      transition: 'opacity 0.15s',
    } as React.CSSProperties,
    logoGridBadge: {
      position: 'absolute' as const, bottom: 4, right: 6,
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, color: '#00C853',
      background: 'rgba(0,200,83,0.1)', padding: '2px 5px', borderRadius: 999,
    },
    // Body
    body: { padding: '12px 0 8px' },
    sectionLabel: {
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
      letterSpacing: '0.5px', color: textMuted, padding: '4px 16px 6px',
    },
    rows: { display: 'flex', flexDirection: 'column' as const, marginBottom: 4 },
    divider: { height: 1, background: border, margin: '8px 16px' },
    contactDivider: { height: 1, background: border, margin: '4px 16px' },
    // Copy rows
    copyRow: {
      display: 'flex', alignItems: 'center', gap: 9,
      width: '100%', padding: '7px 16px',
      background: 'transparent', border: 'none', color: textSec,
      fontFamily: 'inherit', fontSize: 12, textAlign: 'left' as const,
      cursor: 'pointer',
    },
    copyIcon: { flexShrink: 0, color: textMuted, display: 'flex', alignItems: 'center' },
    copyLabel: { flex: 1, minWidth: 0, color: textSec },
    copyBtn: { width: 20, height: 20, borderRadius: 4, display: 'grid', placeItems: 'center', flexShrink: 0, color: textMuted },
    // Contact card
    contactCard: {
      display: 'flex' as const, gap: 12, padding: '10px 16px', alignItems: 'flex-start',
    },
    contactAvatar: {
      width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
      flexShrink: 0, border: `1px solid ${border}`,
      background: dark ? '#222' : '#f0f0f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative' as const,
    },
    contactAvatarImg: {
      width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block',
    },
    contactAvatarFallback: {
      position: 'absolute' as const, inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: textMuted,
    },
    contactInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 3 },
    contactName: { fontSize: 13, fontWeight: 600, color: text, marginBottom: 2 },
    contactDetail: {
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textSec,
    },
    contactDetailIcon: { color: textMuted, display: 'flex', alignItems: 'center', flexShrink: 0 },
    contactPlaceholder: { color: textMuted, fontStyle: 'italic' as const },
    // Teams buttons row
    teamsButtons: {
      display: 'flex' as const, gap: 6, marginTop: 4,
    },
    teamsBtn: {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, color: teamsColor,
      background: 'rgba(98,100,167,0.1)', border: `1px solid rgba(98,100,167,0.2)`,
      borderRadius: 5, padding: '3px 8px',
      textDecoration: 'none', cursor: 'pointer', flexShrink: 0,
      transition: 'background 0.15s',
    },
    emptyNote: {
      padding: '8px 16px 4px', fontSize: 11, color: textMuted, fontStyle: 'italic' as const,
    },
  } as const;
}
