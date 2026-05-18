import { useState } from "react";
import {
  Lock, Shield, Key, Cookie, RefreshCw, Users, FileText, AlertTriangle,
  CheckCircle, Globe, Server, Database, Zap, Eye, ChevronDown, ChevronRight,
  Info, ExternalLink, Clock, Layers
} from "lucide-react";

function Section({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-card-dark border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left">
        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1">{title}</h2>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

function Bdg({ children, color = "gray" }) {
  const map = {
    green:  "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700",
    blue:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700",
    amber:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700",
    red:    "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700",
    purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-700",
    gray:   "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  };
  return <span className={"inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border " + (map[color] || map.gray)}>{children}</span>;
}

function IBox({ type = "info", children }) {
  const s = {
    info:    { c: "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200", I: Info },
    warning: { c: "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200", I: AlertTriangle },
    success: { c: "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200", I: CheckCircle },
  }[type];
  return (
    <div className={"flex gap-3 p-3.5 rounded-lg border " + s.c}>
      <s.I className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed m-0">{children}</p>
    </div>
  );
}

function Flow({ steps }) {
  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: s.color || "#6366f1" }}>{i + 1}</div>
            {i < steps.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 my-1" />}
          </div>
          <div className="pb-4 flex-1 last:pb-0">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-0.5">{s.title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{s.desc}</div>
            {s.code && <code className="mt-1.5 block text-xs bg-gray-900 text-green-400 rounded px-3 py-2 font-mono">{s.code}</code>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <tbody>
          {rows.map(([k, v, d], i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-gray-50 dark:bg-gray-800/30" : ""}>
              <td className="px-3 py-2 font-mono font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap border-b border-gray-100 dark:border-gray-700/50 w-36">{k}</td>
              <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap border-b border-gray-100 dark:border-gray-700/50 w-36">{v}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/50">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LayerDiagram() {
  const L = [
    { l: "Internet / Client-Browser",    s: "HTTPS TLS 1.2/1.3",                                           bg: "#e5e7eb", tc: "#374151" },
    { l: "nginx 1.24 (Reverse Proxy)",   s: "TLS-Termination · Security-Header · robots: noindex",          bg: "#dbeafe", tc: "#1e40af" },
    { l: "Auth-Backend (Node.js :3002)", s: "JWT-Verifikation · Rollen · 2FA · Audit-Log",                  bg: "#ede9fe", tc: "#5b21b6" },
    { l: "PostgreSQL :5432",             s: "Benutzerdaten · Passwort-Hash (bcrypt 12) · Audit-Tabellen",    bg: "#dcfce7", tc: "#15803d" },
    { l: "Redis :6379",                  s: "Token-Blacklist · Session-Cache",                               bg: "#fef9c3", tc: "#854d0e" },
  ];
  return (
    <div className="space-y-1">
      {L.map((x, i) => (
        <div key={i}>
          <div className="rounded-lg px-4 py-2.5 border" style={{ background: x.bg + "40", borderColor: x.bg, borderLeftWidth: 4, borderLeftColor: x.tc + "80" }}>
            <div className="text-xs font-semibold" style={{ color: x.tc }}>{x.l}</div>
            <div className="text-xs opacity-70 mt-0.5" style={{ color: x.tc }}>{x.s}</div>
          </div>
          {i < L.length - 1 && (
            <div className="flex justify-center my-0.5">
              <svg width="14" height="10" viewBox="0 0 14 10"><path d="M7 0 L7 6 M4 4 L7 8 L10 4" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: "arch",    label: "Architektur",    I: Layers },
  { id: "auth",    label: "Auth & JWT",     I: Key },
  { id: "cookies", label: "Cookies",        I: Cookie },
  { id: "session", label: "Sessions",       I: Clock },
  { id: "rollen",  label: "Rollen & Apps",  I: Users },
  { id: "headers", label: "Nginx & Header", I: Globe },
  { id: "audit",   label: "Audit-Log",      I: FileText },
  { id: "check",   label: "Checkliste",     I: CheckCircle },
];

export default function Sicherheit() {
  const [tab, setTab] = useState("arch");
  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sicherheits-Handbuch</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Vollständige Dokumentation der Sicherheitsarchitektur für Administratoren</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[["TLS 1.3","green"],["JWT HS256","blue"],["2FA TOTP","purple"],["bcrypt·12","amber"],["HttpOnly Cookie","green"],["Redis Blacklist","gray"],["Audit-Log","blue"]].map(([b,c]) => (
            <Bdg key={b} color={c}>{b}</Bdg>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 flex-wrap mb-5 border-b border-gray-200 dark:border-gray-700">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={"flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors -mb-px border border-transparent " +
                (active
                  ? "bg-white dark:bg-card-dark text-gray-900 dark:text-white border-gray-200 dark:border-gray-700 border-b-white dark:border-b-card-dark"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300")}>
              <t.I className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">

        {/* ── ARCHITEKTUR ── */}
        {tab === "arch" && <>
          <Section icon={Layers} title="Schichtenmodell — Überblick">
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Die Serienwerft-Apps sind in Schichten gesichert. Jede Schicht hat eine dedizierte Aufgabe — fällt eine aus, schützt die nächste.
            </p>
            <LayerDiagram />
            <IBox type="info">
              Kein App-Port ist direkt aus dem Internet erreichbar. Ports 3001–3020 sind auf <strong>127.0.0.1</strong> gebunden.
              nginx ist der einzige öffentliche Endpunkt (Port 443). SSH-Zugang: Port 2222 (Port 22 geschlossen).
            </IBox>
          </Section>

          <Section icon={Globe} title="Netzwerk-Topologie">
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                {["Schicht","Protokoll/Port","Sichtbarkeit","Schutz"].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{h}</th>)}
              </tr></thead>
              <tbody>{[
                ["Internet → nginx",   "HTTPS :443",      "Öffentlich",   "TLS 1.3, HSTS, Let's Encrypt"],
                ["SSH-Zugang",         "SSH :2222",        "Öffentlich",   "Passwort-Auth (Root + Deploy-User)"],
                ["nginx → Backend",    "HTTP :3001–3020",  "Nur localhost", "Kein TLS nötig (loopback)"],
                ["Backend → Postgres", "TCP :5432",        "Nur localhost", "Passwort-Auth, kein pg_hba public"],
                ["Backend → Redis",    "TCP :6379",        "Nur localhost", "Kein Passwort (loopback only)"],
              ].map(([l,p,v,s],i) => (
                <tr key={i} className={i%2===0?"bg-gray-50 dark:bg-gray-800/30":""}>
                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">{l}</td>
                  <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">{p}</td>
                  <td className="px-3 py-2"><Bdg color={v==="Öffentlich"?"amber":"green"}>{v}</Bdg></td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{s}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </Section>

          <Section icon={Shield} title="Bedrohungsmodell — Was schützen wir?">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ["Session-Hijacking",      "HttpOnly-Cookie, kein JS-Zugriff auf Token"],
                ["CSRF-Angriff",           "SameSite=Lax Cookie, CORS-Konfiguration"],
                ["XSS → Token-Diebstahl",  "HttpOnly-Cookie nicht per JS lesbar"],
                ["Replay nach Logout",     "Redis-Blacklist mit JTI (UUID)"],
                ["Brute-Force Login",      "Rate-Limiting via nginx + express-rate-limit"],
                ["Schwaches Passwort",     "bcrypt cost 12 + Passwort-Policy + Ablaufdatum"],
                ["Kompromittiertes Konto", "2FA TOTP als zweiter Faktor"],
                ["Man-in-the-Middle",      "TLS 1.3, HSTS (1 Jahr)"],
                ["Web-Crawler/Indexierung","X-Robots-Tag: noindex in nginx snippet"],
                ["Clickjacking",           "X-Frame-Options: DENY"],
              ].map(([threat, mitigation]) => (
                <div key={threat} className="flex gap-2 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">{threat}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{mitigation}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>}

        {/* ── AUTH & JWT ── */}
        {tab === "auth" && <>
          <Section icon={Key} title="Login-Flow — Schritt für Schritt">
            <Flow steps={[
              { title: "POST /api/auth/login", color: "#6366f1",
                desc: "Credentials per HTTPS. Niemals im Klartext in Logs.",
                code: "{ username, password, rememberMe? }" },
              { title: "Passwort-Verifikation via bcrypt.compare()", color: "#8b5cf6",
                desc: "bcrypt-Hash (cost 12) vs. Eingabe. Zeitkonstanter Vergleich verhindert Timing-Angriffe." },
              { title: "2FA-Prüfung (wenn aktiviert)", color: "#a78bfa",
                desc: "Redirect auf /verify-2fa. TOTP-Code (6-stellig, 30s-Fenster, Google Authenticator-kompatibel)." },
              { title: "JWT-Generierung (Access + Refresh)", color: "#7c3aed",
                desc: "Access-Token: HS256, 15 Minuten. Refresh-Token: HS256, 7 Tage (30 Tage mit Angemeldet-bleiben).",
                code: "jwt.sign(payload, JWT_SECRET, { expiresIn: '15m', jwtid: uuid() })" },
              { title: "Cookie setzen (HttpOnly, Secure, SameSite=Lax)", color: "#5b21b6",
                desc: "Beide Token als HttpOnly-Cookies. Domain=.serienwerft.studio — alle Subdomains.",
                code: "Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax; Domain=.serienwerft.studio" },
            ]} />
          </Section>

          <Section icon={Key} title="JWT Access-Token — Struktur">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="bg-gray-900 px-4 py-2 text-xs text-gray-400 font-semibold">JWT Payload (dekodiert, Beispiel)</div>
              <pre className="bg-gray-950 text-gray-300 p-4 m-0 overflow-x-auto leading-relaxed text-xs">{`{
  "sub":      "42",            // user_id
  "username": "jan.diepers",
  "email":    "jan@...",
  "app":      "script",        // Ziel-App
  "type":     "access",
  "jti":      "uuid-v4",       // Blacklist-ID
  "iat":      1716000000,
  "exp":      1716000900       // +15 Minuten
}`}</pre>
            </div>
            <PTable rows={[
              ["Algorithmus", "HS256",       "HMAC-SHA256, serverseitiges Secret"],
              ["Access-TTL",  "15 Minuten",  "Kurze Lebensdauer minimiert Missbrauchsfenster"],
              ["Refresh-TTL", "7 / 30 Tage", "Standard / Angemeldet-bleiben"],
              ["jti",         "UUID v4",     "Einmalige Token-ID für Blacklisting bei Logout"],
            ]} />
          </Section>

          <Section icon={Lock} title="Passwort-Sicherheit (bcrypt)">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[["Cost Factor","12","2¹² = 4096 Runden, ~200ms pro Hash"],["Algorithmus","bcrypt","Resistent gegen GPU-Angriffe"],["Salt","per-Hash","Kein Rainbow-Table möglich"]].map(([l,v,d]) => (
                <div key={l} className="text-center p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{v}</div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{l}</div>
                  <div className="text-xs text-gray-400">{d}</div>
                </div>
              ))}
            </div>
            <IBox type="warning">Reset-Token werden mit bcrypt cost 10 gehasht und in der DB gespeichert (nie im Klartext). Ablauf: 60 Minuten.</IBox>
          </Section>

          <Section icon={Shield} title="2-Faktor-Authentifizierung (TOTP)">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["TOTP (RFC 6238)", "6-stelliger Code, erneuert alle 30 Sekunden."],
                ["QR-Code Setup",   "Beim Aktivieren: QR-Code mit geheimem Seed → Authenticator-App scannen."],
                ["Zeitfenster",     "±1 Schritt (30s) Toleranz für Uhrsynchronisation."],
                ["Admin-Reset",     "Admins können 2FA zurücksetzen unter Benutzer → Bearbeiten."],
              ].map(([t,d]) => (
                <div key={t} className="p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1">{t}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{d}</div>
                </div>
              ))}
            </div>
          </Section>
        </>}

        {/* ── COOKIES ── */}
        {tab === "cookies" && <>
          <Section icon={Cookie} title="Cookie-Konfiguration">
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                {["Cookie","Inhalt","TTL","Zweck"].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{h}</th>)}
              </tr></thead>
              <tbody>{[
                ["access_token",  "JWT HS256", "15 Minuten",   "API-Auth bei jedem Request"],
                ["refresh_token", "JWT HS256", "7 / 30 Tage",  "Stilles Erneuern des Access-Tokens"],
              ].map(([n,c,t,z],i) => (
                <tr key={i} className={i%2===0?"bg-gray-50 dark:bg-gray-800/30":""}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-purple-600 dark:text-purple-400">{n}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-600 dark:text-gray-400">{c}</td>
                  <td className="px-3 py-2.5">{t}</td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{z}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </Section>

          <Section icon={Shield} title="Cookie-Flags — was sie bedeuten">
            <div className="space-y-3">
              {[
                ["HttpOnly",                   "green",  "JavaScript kann den Cookie nicht lesen (kein document.cookie). Verhindert XSS-Token-Diebstahl."],
                ["Secure",                     "blue",   "Cookie wird nur über HTTPS übertragen. Im Browser nie über HTTP sichtbar."],
                ["SameSite=Lax",               "purple", "Cookie bei Top-Level-Navigationen, aber nicht bei Cross-Site-Requests (CSRF-Schutz)."],
                ["Domain=.serienwerft.studio", "amber",  "Cookie gilt für alle Subdomains (*.serienwerft.studio) — ein Login, alle Apps."],
                ["Path=/",                     "gray",   "Cookie gilt für alle Pfade der Domain."],
              ].map(([f,c,d]) => (
                <div key={f} className="flex gap-3 items-start">
                  <Bdg color={c}>{f}</Bdg>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed m-0 flex-1">{d}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={Globe} title="Single-Sign-On via Subdomain-Cookie">
            <Flow steps={[
              { title: "Login auf auth.serienwerft.studio", color: "#3b82f6",
                desc: "User meldet sich einmal an. Cookie für .serienwerft.studio gesetzt." },
              { title: "Öffnet andere App (z.B. script.serienwerft.studio)", color: "#8b5cf6",
                desc: "Browser sendet Cookie automatisch. App prüft intern: POST http://127.0.0.1:3002/api/internal/validate",
                code: "POST /api/internal/validate  { token } → { user_id, roles, productions }" },
              { title: "Validierung erfolgreich", color: "#10b981",
                desc: "Auth-Backend validiert JWT, gibt user_id + roles zurück. Kein Login-Redirect nötig." },
            ]} />
            <IBox type="info">Jede App ruft intern <strong>POST /api/internal/validate</strong> auf (Port 3002, loopback). Token wird niemals clientseitig ausgelesen.</IBox>
          </Section>
        </>}

        {/* ── SESSION ── */}
        {tab === "session" && <>
          <Section icon={Clock} title="Token-Lebenszyklus">
            <div className="relative mb-4">
              <div className="h-10 rounded-lg overflow-hidden flex border border-gray-200 dark:border-gray-700">
                <div className="flex-1 flex items-center justify-center text-xs font-semibold" style={{background:"#dcfce7",color:"#15803d"}}>Token gültig (0–10 min)</div>
                <div className="w-24 flex items-center justify-center text-xs font-semibold border-l-2 border-dashed border-amber-400" style={{background:"#fef9c3",color:"#854d0e"}}>Refresh (10 min)</div>
                <div className="w-16 flex items-center justify-center text-xs font-semibold border-l-2 border-dashed border-red-400" style={{background:"#fee2e2",color:"#b91c1c"}}>Ablauf</div>
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-gray-400">
                <span>0 min</span><span>→ stiller Refresh 5 min vor Ablauf</span><span>15 min</span>
              </div>
            </div>
            <Flow steps={[
              { title: "App-Start: GET /api/auth/me", color: "#3b82f6",
                desc: "AppShell liest exp-Timestamp. Setzt Timer für (exp − 5 min).",
                code: "GET /api/auth/me → { user, exp }" },
              { title: "Stiller Refresh (5 min vor Ablauf)", color: "#8b5cf6",
                desc: "Timer feuert → POST /api/auth/refresh. Browser sendet refresh_token-Cookie. Neuer access_token-Cookie.",
                code: "POST /api/auth/refresh → neuer access_token Cookie" },
              { title: "Bei Fehler: Auth-Redirect", color: "#ef4444",
                desc: "Refresh-Token abgelaufen → Redirect zu auth.serienwerft.studio. Aktuelle URL in sessionStorage (auth_redirect_after_login) gesichert." },
              { title: "Nach Login: zurück zur ursprünglichen URL", color: "#10b981",
                desc: "AppShell prüft sessionStorage. Falls Redirect-Ziel vorhanden + authentifiziert → navigate(url). Key wird gelöscht." },
            ]} />
          </Section>

          <Section icon={Zap} title="Logout & Token-Blacklist">
            <Flow steps={[
              { title: "POST /api/auth/logout", color: "#ef4444",
                desc: "Frontend sendet Logout-Request." },
              { title: "JTI-Blacklisting in Redis", color: "#dc2626",
                desc: "Einmalige Token-ID (jti) in Redis mit TTL = verbleibende Token-Laufzeit. Danach wird das Token abgelehnt.",
                code: "redis.setex('blacklist:' + jti, remainingSeconds, '1')" },
              { title: "Cookie löschen", color: "#9ca3af",
                desc: "Beide Cookies mit Max-Age=0 gecleart. Domain=.serienwerft.studio → alle Apps gleichzeitig." },
            ]} />
            <IBox type="success">Gestohlene Access-Tokens sind nach einem Logout sofort ungültig — auch wenn sie noch nicht abgelaufen sind.</IBox>
          </Section>

          <Section icon={RefreshCw} title="Passwort-Ablauf">
            <PTable rows={[
              ["password_expires_at", "TIMESTAMP",     "Ablaufdatum in der DB (users-Tabelle)"],
              ["expires_soon",        "14 Tage vorher","Login-Response enthält password_expires_soon: true"],
              ["Reset-Link TTL",      "60 Minuten",    "Passwort-Reset-Link läuft nach 1h ab"],
            ]} />
          </Section>
        </>}

        {/* ── ROLLEN & APPS ── */}
        {tab === "rollen" && <>
          <Section icon={Users} title="Rollen-System">
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                {["Ebene","Rollen (Beispiele)","Geltungsbereich","Besonderheit"].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{h}</th>)}
              </tr></thead>
              <tbody>{[
                ["Tier 1 (global)",       "superadmin, geschaeftsfuehrung, herstellungsleitung, hauptbuchhaltung", "Alle Produktionen",          "Immer global sichtbar"],
                ["Tier 2 (prod-gebunden)","produktionsleitung, buchhaltung_produktion, hr_manager, aufnahmeleitung","Nur zugewiesene Prod.",     "productions[] im JWT"],
                ["Auth-Admin",            "admin (Level 1–3)",                                                     "Auth-App Adminbereich",      "Separates administrators-Flag"],
              ].map(([e,r,g,b],i) => (
                <tr key={i} className={i%2===0?"bg-gray-50 dark:bg-gray-800/30":""}>
                  <td className="px-3 py-2.5 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{e}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">{r}</td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{g}</td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{b}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <IBox type="info">Rollen werden <strong>serverseitig</strong> geprüft (fail-closed). JWT via /api/internal/validate verifiziert. Frontend-Checks sind nur UI-Hilfe, nicht Sicherheitsgrenze.</IBox>
          </Section>

          <Section icon={Eye} title="App-Zugriff & AdminGuard">
            <Flow steps={[
              { title: "User öffnet /admin Route", color: "#3b82f6",
                desc: "AdminGuard-Komponente prüft: Ist der User eingeloggt und hat das administrators-Flag?" },
              { title: "GET /api/auth/my-apps", color: "#8b5cf6",
                desc: "Gibt is_admin + apps-Liste zurück. Nur freigeschaltete Apps erscheinen im App-Switcher." },
              { title: "Weiterleitung bei fehlendem Zugriff", color: "#ef4444",
                desc: "Kein Admin-Flag → Redirect zu /login. Backend wirft HTTP 403 bei allen /api/admin/* Endpunkten." },
            ]} />
            <IBox type="warning"><strong>Wichtig:</strong> Das administrators-Flag ist getrennt vom Rollen-System der Fachanwendungen. Ein Auth-Admin kann trotzdem keine Produktionsleiter-Rolle haben — und umgekehrt.</IBox>
          </Section>

          <Section icon={Database} title="Feldgruppen-Zugriffsmatrix (Beispiel Vertragsdb)">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Jede App implementiert eigene Feldgruppen-Zugriffsrechte, serverseitig durchgesetzt.</p>
            <div className="text-xs bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700 p-3 font-mono space-y-1 overflow-x-auto">
              <div className="text-gray-400">// production_access_overrides — pro Produktion überschreibbar</div>
              {[
                ["G1  Basiskontakt",       "✅ superadmin · GF · Prodltg · Prodbüro",       "👁 Aufnahme · HR · Redaktion"],
                ["G11 Gage Schauspieler",  "✅ superadmin · GF · Prodltg · Vertragserst.",  "👁 Drehplanung · ❌ alle anderen"],
                ["G18 Steuer & Bank",      "✅ superadmin · GF · Buchh.Prod.",              "❌ alle anderen"],
              ].map(([g,rw,r]) => (
                <div key={g} className="grid gap-2" style={{gridTemplateColumns:"10rem 1fr 1fr"}}>
                  <span className="text-purple-400">{g}</span>
                  <span className="text-green-400">{rw}</span>
                  <span className="text-gray-400">{r}</span>
                </div>
              ))}
            </div>
          </Section>
        </>}

        {/* ── NGINX & HEADER ── */}
        {tab === "headers" && <>
          <Section icon={Globe} title="TLS & HTTPS-Konfiguration">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[["TLS-Versionen","TLS 1.2 + 1.3","TLS 1.0/1.1 deaktiviert"],["Zertifikat","Let's Encrypt","Auto-Renewal via certbot"],["HSTS","1 Jahr","max-age=31536000"]].map(([l,v,d]) => (
                <div key={l} className="text-center p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="text-lg font-bold text-gray-900 dark:text-white mb-1">{v}</div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{l}</div>
                  <div className="text-xs text-gray-400">{d}</div>
                </div>
              ))}
            </div>
            <IBox type="info">HSTS mit <code className="text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">max-age=31536000</code> zwingt Browser für 1 Jahr zu HTTPS — auch wenn der User manuell http:// eingibt.</IBox>
          </Section>

          <Section icon={Shield} title="Security-Header Snippet">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Alle Vhosts includen <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">/etc/nginx/snippets/security-headers.conf</code>.
              Bei Location-Blöcken mit eigenem <code className="text-xs">add_header</code> muss der Snippet erneut included werden (nginx Vererbungsregel).
            </p>
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="bg-gray-900 px-4 py-2 text-xs text-gray-400 font-semibold">/etc/nginx/snippets/security-headers.conf</div>
              <pre className="bg-gray-950 text-green-400 p-4 text-xs font-mono m-0 overflow-x-auto leading-relaxed">{`# Crawler-Schutz
add_header X-Robots-Tag "noindex, nofollow" always;

# Kein Framing (Clickjacking-Schutz)
add_header X-Frame-Options "DENY" always;

# MIME-Sniffing verhindern
add_header X-Content-Type-Options "nosniff" always;

# Referrer-Leak verhindern
add_header Referrer-Policy "no-referrer" always;

# HTTPS erzwingen (1 Jahr)
add_header Strict-Transport-Security "max-age=31536000" always;`}</pre>
            </div>
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mt-3">
              <div className="bg-gray-900 px-4 py-2 text-xs text-gray-400 font-semibold">/etc/nginx/snippets/robots-noindex.conf</div>
              <pre className="bg-gray-950 text-green-400 p-4 text-xs font-mono m-0">{`location = /robots.txt {
  return 200 "User-agent: *\\nDisallow: /\\n";
}`}</pre>
            </div>
            <IBox type="warning"><strong>nginx add_header Vererbung:</strong> Header auf Server-Ebene werden NICHT in Location-Blöcke vererbt, die eigene <code className="text-xs">add_header</code>-Direktiven haben. Immer den Snippet in jedem solchen Block erneut includen.</IBox>
          </Section>

          <Section icon={Server} title="nginx Vhost-Muster (Pflichtvorlage)">
            <pre className="bg-gray-950 text-green-400 p-4 text-xs font-mono m-0 rounded-lg border border-gray-700 overflow-x-auto leading-relaxed">{`server {
    listen 443 ssl;
    server_name meine-app.serienwerft.studio;

    ssl_certificate     /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

    # 1. Security Headers (Pflicht)
    include /etc/nginx/snippets/security-headers.conf;

    # 2. robots.txt (kein Crawling)
    include /etc/nginx/snippets/robots-noindex.conf;

    root /var/www/meine-app/frontend/dist;

    # Location mit eigenem add_header: Snippet erneut includen!
    location = /index.html {
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "no-cache" always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3XXX;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`}</pre>
          </Section>
        </>}

        {/* ── AUDIT-LOG ── */}
        {tab === "audit" && <>
          <Section icon={FileText} title="Was wird protokolliert?">
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                {["Ereignis","action-Wert","Metadaten"].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400">{h}</th>)}
              </tr></thead>
              <tbody>{[
                ["Erfolgreicher Login",       "login_success",         "IP, User-Agent, App"],
                ["Fehlgeschlagener Login",    "login_failed",          "IP, eingegebener Username"],
                ["Logout",                   "logout",                "IP, Token-JTI"],
                ["2FA aktiviert",            "2fa_enabled",           "User-ID"],
                ["2FA deaktiviert",          "2fa_disabled",          "Wer hat deaktiviert?"],
                ["Passwort geändert",        "password_changed",      "User-ID, IP"],
                ["Passwort-Reset angefragt", "password_reset_request","IP, E-Mail"],
                ["Rolle zugewiesen",         "role_assigned",         "Welche Rolle, welche Produktion"],
                ["Rolle entfernt",           "role_removed",          "Welche Rolle, wer hat entfernt"],
                ["User angelegt",            "user_created",          "Admin-User-ID"],
                ["User deaktiviert",         "user_deactivated",      "Admin-User-ID"],
                ["API-Token erstellt",       "token_created",         "Scope, Ablaufdatum"],
                ["API-Token widerrufen",     "token_revoked",         "Token-Name"],
              ].map(([e,a,m],i) => (
                <tr key={i} className={i%2===0?"bg-gray-50 dark:bg-gray-800/30":""}>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{e}</td>
                  <td className="px-3 py-2 font-mono text-purple-600 dark:text-purple-400 whitespace-nowrap">{a}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{m}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </Section>

          <Section icon={Database} title="DB-Schema — audit_log">
            <PTable rows={[
              ["id",            "SERIAL PK",   "Interne ID"],
              ["user_id",       "INT FK",      "Wer hat die Aktion ausgeführt (NULL bei fehlgeschl. Login)"],
              ["action",        "TEXT",        "Aktionstyp (login_success, role_assigned, ...)"],
              ["resource_type", "TEXT",        "z.B. user, role, token"],
              ["resource_id",   "TEXT",        "ID des betroffenen Objekts"],
              ["ip_address",    "INET",        "Client-IP (X-Real-IP via nginx)"],
              ["metadata",      "JSONB",       "Zusatzinfos (User-Agent, alte/neue Werte)"],
              ["created_at",    "TIMESTAMPTZ", "Zeitstempel (UTC)"],
              ["expires_at",    "TIMESTAMPTZ", "Optionales Löschdatum (DSGVO)"],
            ]} />
          </Section>

          <Section icon={AlertTriangle} title="Retention & DSGVO">
            <IBox type="warning">
              Fehlgeschlagene Login-Versuche enthalten den eingegebenen Usernamen. Wenn ein User versehentlich sein Passwort im Username-Feld eingibt, könnte dies im Log sichtbar sein. Audit-Logs dürfen daher nur Administratoren einsehen.
            </IBox>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Audit-Log-Einträge haben ein optionales <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs">expires_at</code>-Feld.
              Einträge ohne Ablaufdatum werden dauerhaft aufbewahrt. Der DSGVO-Worker löscht Einträge mit Ablaufdatum automatisch.
            </p>
          </Section>
        </>}

        {/* ── CHECKLISTE ── */}
        {tab === "check" && <>
          <Section icon={CheckCircle} title="Admin-Checkliste — regelmäßige Prüfungen">
            {[
              { freq: "Täglich", color: "red", items: [
                "Audit-Log auf fehlgeschlagene Logins prüfen (Admin → Audit Log)",
                "PM2-Status: Alle Backends online? (Dashboard → Server-Status)",
              ]},
              { freq: "Wöchentlich", color: "amber", items: [
                "Abgelaufene API-Tokens widerrufen (Admin → API Tokens)",
                "Inaktive Benutzer prüfen — ggf. deaktivieren",
                "Offene Onboarding-Queue leeren (Admin → Onboarding)",
                "Backup-Status prüfen (Admin → Backup)",
              ]},
              { freq: "Monatlich", color: "blue", items: [
                "SSL-Zertifikat-Ablaufdaten prüfen (certbot renew --dry-run)",
                "Rollenverteilung überprüfen — haben alle noch die richtigen Rollen?",
                "Nicht mehr benötigte Benutzer deaktivieren",
                "2FA-Aktivierungsrate prüfen — Schulung bei niedriger Rate",
                "nginx error.log auf ungewöhnliche Muster prüfen",
              ]},
              { freq: "Bei Bedarf", color: "purple", items: [
                "Passwort-Reset für User mit verlorenem 2FA-Gerät",
                "JWT_SECRET rotieren (erfordert Re-Login aller User)",
                "Security-Header testen: securityheaders.com",
                "TLS-Konfiguration testen: ssllabs.com/ssltest",
                "Neuen Vhost immer mit nginx -t prüfen vor reload",
              ]},
            ].map(g => (
              <div key={g.freq}>
                <div className="flex items-center gap-2 mb-2"><Bdg color={g.color}>{g.freq}</Bdg></div>
                <div className="space-y-1.5 ml-1 mb-5">
                  {g.items.map((item,i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <CheckCircle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <Section icon={ExternalLink} title="Externe Referenzen">
            <div className="space-y-2">
              {[
                ["OWASP Authentication Cheat Sheet", "Best Practices für Auth & Session Management", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html"],
                ["RFC 7519 — JSON Web Token",        "Offizielle JWT-Spezifikation",                "https://datatracker.ietf.org/doc/html/rfc7519"],
                ["RFC 6238 — TOTP (2FA)",            "Time-Based One-Time Password Algorithmus",    "https://datatracker.ietf.org/doc/html/rfc6238"],
                ["OWASP Cookie Security",            "HttpOnly, Secure, SameSite — Erklärungen",   "https://owasp.org/www-community/HttpOnly"],
                ["Mozilla Web Security Guidelines",  "Referenz aller Security-Header",              "https://infosec.mozilla.org/guidelines/web_security"],
                ["SSL Labs Test",                    "TLS-Konfiguration testen",                    "https://www.ssllabs.com/ssltest/"],
                ["SecurityHeaders.com",              "Security-Header der eigenen Domain prüfen",   "https://securityheaders.com"],
              ].map(([t,d,u]) => (
                <a key={t} href={u} target="_blank" rel="noopener noreferrer"
                  className="flex gap-3 items-start p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors no-underline group">
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 flex-shrink-0 mt-0.5 transition-colors" />
                  <div>
                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{t}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{d}</div>
                  </div>
                </a>
              ))}
            </div>
          </Section>
        </>}

      </div>
    </div>
  );
}
