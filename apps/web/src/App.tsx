import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

import { routeDistanceKm, useRoute, useAccounts, useDevices, type Device, type RoutePoint } from './data';
import { CONTACT } from './contact';
import { auth } from './firebase';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="center muted">Cargando…</div>;
  if (!user) return <Login />;
  return <Dashboard user={user} />;
}

// ---------------------------------------------------------------- Inicio de sesión

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand">
        <svg className="auth-orbits" viewBox="0 0 600 600" aria-hidden>
          <circle cx="300" cy="300" r="180" />
          <circle cx="300" cy="300" r="250" />
          <ellipse cx="300" cy="300" rx="290" ry="120" transform="rotate(-25 300 300)" />
          <circle className="sat" cx="530" cy="170" r="5" />
          <circle className="sat" cx="120" cy="420" r="4" />
          <circle className="sat" cx="410" cy="520" r="3" />
        </svg>
        <div className="auth-brand-inner">
          <div className="auth-logo">
            <img src="/icon.png" alt="" />
            <span>VigSat</span>
          </div>
          <h1>Sabe dónde están tus vehículos, en todo momento.</h1>
          <p className="auth-lead">Rastreo GPS en tiempo real para flotas de empresas y vehículos particulares.</p>
          <ul className="auth-features">
            <li><Icon name="pin" /><span><b>Ubicación en vivo</b>Mira cada vehículo moverse en el mapa al instante.</span></li>
            <li><Icon name="route" /><span><b>Historial de recorridos</b>Consulta por día la ruta, los kilómetros y la velocidad.</span></li>
            <li><Icon name="fleet" /><span><b>Flotas y particulares</b>Desde un carro hasta toda tu empresa, en un solo panel.</span></li>
          </ul>
          <ContactBlock />
        </div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-form-logo"><img src="/icon.png" alt="" /><span>VigSat</span></div>
          <h2>Bienvenido</h2>
          <p className="muted">Entra con el mismo usuario de la app del celular.</p>
          <label className="field">
            <span>Correo</span>
            <span className="input-wrap">
              <Icon name="mail" />
              <input type="email" autoComplete="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </span>
          </label>
          <label className="field">
            <span>Contraseña</span>
            <span className="input-wrap">
              <Icon name="lock" />
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar al panel'}</button>
          <p className="muted small center-text">¿Aún no tienes usuario? Regístrate desde la app VigSat en tu celular.</p>
        </form>
        <footer className="auth-footer muted">© {YEAR} VigSat · Rastreo satelital</footer>
      </section>
    </div>
  );
}

const YEAR = new Date().getFullYear();

function ContactBlock() {
  const c = CONTACT;
  const items = [
    c.phone && { icon: 'phone' as const, label: c.phone, href: `tel:${c.phone.replace(/[^+\d]/g, '')}` },
    c.whatsapp && { icon: 'chat' as const, label: 'WhatsApp', href: `https://wa.me/${c.whatsapp}` },
    c.email && { icon: 'mail' as const, label: c.email, href: `mailto:${c.email}` },
    (c.address || c.city) && { icon: 'pin' as const, label: [c.address, c.city].filter(Boolean).join(', ') },
    c.instagram && { icon: 'at' as const, label: `@${c.instagram}`, href: `https://instagram.com/${c.instagram}` },
    c.facebook && { icon: 'at' as const, label: 'Facebook', href: c.facebook },
  ].filter(Boolean) as { icon: IconName; label: string; href?: string }[];
  if (items.length === 0) return null;
  return (
    <div className="auth-contact">
      <h3>Contáctanos</h3>
      <ul>
        {items.map((it) => (
          <li key={it.label}>
            <Icon name={it.icon} />
            {it.href ? <a href={it.href} target="_blank" rel="noreferrer">{it.label}</a> : <span>{it.label}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

type IconName = 'pin' | 'route' | 'fleet' | 'mail' | 'lock' | 'phone' | 'chat' | 'at';
const ICON_PATHS: Record<IconName, string> = {
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  fleet: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  chat: 'M4 20l1.5-4A8 8 0 1 1 9 19.5L4 20Z',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5',
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------- Tema claro / oscuro

type ThemeMode = 'auto' | 'light' | 'dark';
const THEME_KEY = 'vigsat.theme';
const THEME_LABEL: Record<ThemeMode, string> = { auto: '◐ Auto', light: '☀ Claro', dark: '☾ Oscuro' };

function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);
  const media = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [systemDark, setSystemDark] = useState(media.matches);

  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [media]);

  useEffect(() => {
    if (mode === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* sin almacenamiento: solo esta sesión */ }
  }, [mode]);

  const resolved: 'light' | 'dark' = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;
  const cycle = () => setMode((m) => (m === 'auto' ? 'dark' : m === 'dark' ? 'light' : 'auto'));
  return { mode, resolved, cycle };
}

// ---------------------------------------------------------------- Panel

type Status = 'online' | 'recent' | 'offline';

function statusOf(d: Device, now: number): Status {
  if (!d.last) return 'offline';
  const age = now - d.last.recordedAt.toMillis();
  if (age < 2 * 60_000) return 'online';
  if (age < 30 * 60_000) return 'recent';
  return 'offline';
}

const STATUS_LABEL: Record<Status, string> = { online: 'En línea', recent: 'Reciente', offline: 'Sin señal' };

function timeAgo(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return new Date(ms).toLocaleDateString();
}

function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Dashboard({ user }: { user: User }) {
  const { accounts, error } = useAccounts(user.uid);
  const accountIds = useMemo(() => (accounts ?? []).map((a) => a.id), [accounts]);
  const devices = useDevices(accountIds);
  const now = useNow();
  const { mode: themeMode, resolved: theme, cycle: cycleTheme } = useTheme();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [day, setDay] = useState(todayInput);
  const [showRoute, setShowRoute] = useState(true);
  const { key: routeKey, route: routePoints, error: routeError, loading: routeLoading } = useRoute(selectedId, day);
  const route = showRoute ? routePoints : null;
  const live = day === todayInput();

  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.name ?? '';

  function select(id: string | null) {
    setSelectedId(id);
    setDay(todayInput());
    setShowRoute(true);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-head">
          <span className="brand small">VigSat</span>
          <span className="head-actions">
            <button className="link" onClick={cycleTheme} title="Cambiar tema">{THEME_LABEL[themeMode]}</button>
            <button className="link" onClick={() => signOut(auth)} title={user.email ?? ''}>Salir</button>
          </span>
        </header>

        {error && <p className="error">No se pudieron cargar tus cuentas: {error}</p>}
        {accounts && accounts.length === 0 && (
          <p className="muted pad">Aún no tienes vehículos. Registra uno desde la app del celular.</p>
        )}
        {!accounts && !error && <p className="muted pad">Cargando vehículos…</p>}

        <ul className="devices">
          {devices.map((d) => {
            const st = statusOf(d, now);
            return (
              <li key={d.id}>
                <button className={`device ${d.id === selectedId ? 'active' : ''}`} onClick={() => select(d.id === selectedId ? null : d.id)}>
                  <span className={`dot ${st}`} aria-hidden />
                  <span className="device-main">
                    <strong>{d.name}</strong>
                    <span className="muted">
                      {[d.plate, accounts && accounts.length > 1 ? accountName(d.accountId) : null].filter(Boolean).join(' · ') || ' '}
                    </span>
                  </span>
                  <span className="device-side">
                    <span className={`badge ${st}`}>{STATUS_LABEL[st]}</span>
                    <span className="muted">
                      {d.last ? `${Math.round(d.last.speedKmh ?? 0)} km/h · ${timeAgo(d.last.recordedAt.toMillis(), now)}` : 'sin datos'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected && (
          <section className="history">
            <h2>
              Recorrido de {selected.name}
              {live && <span className="live">● En vivo</span>}
            </h2>
            <div className="row">
              <input type="date" value={day} max={todayInput()} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <button className="secondary" onClick={() => setShowRoute((v) => !v)}>{showRoute ? 'Ocultar' : 'Mostrar'}</button>
            </div>
            {routeError && <p className="error">No se pudo cargar el recorrido: {routeError}</p>}
            {showRoute && routeLoading && <p className="muted">Cargando recorrido…</p>}
            {route && (
              route.length === 0
                ? <p className="muted">No hay recorrido ese día.</p>
                : (
                  <p className="muted">
                    {route.length} puntos · {routeDistanceKm(route).toFixed(1)} km ·{' '}
                    {route[0].at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                    {route[route.length - 1].at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}máx. {Math.round(Math.max(...route.map((p) => p.speedKmh ?? 0)))} km/h
                  </p>
                )
            )}
          </section>
        )}
      </aside>

      <main className={theme === 'dark' ? 'map map-dark' : 'map'}>
        <FleetMap theme={theme} devices={devices} selected={selected} route={route} routeKey={routeKey} live={live} now={now} onSelect={select} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- Mapa

// Mapa base gratuito y sin clave (OpenStreetMap). En modo oscuro se oscurece con un filtro CSS.
const TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
} as const;

const STATUS_COLOR: Record<Status, string> = { online: '#16a34a', recent: '#d97706', offline: '#64748b' };

function vehicleIcon(name: string, status: Status, selected: boolean) {
  const safe = name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return L.divIcon({
    className: '',
    html: `<div class="pin ${selected ? 'selected' : ''}" style="--c:${STATUS_COLOR[status]}"><span></span><b>${safe}</b></div>`,
    iconSize: [0, 0],
  });
}

function FleetMap({ theme, devices, selected, route, routeKey, live, now, onSelect }: {
  theme: 'light' | 'dark'; devices: Device[]; selected: Device | null; route: RoutePoint[] | null;
  routeKey: string; live: boolean; now: number; onSelect: (id: string) => void;
}) {
  const routeColor = theme === 'dark' ? '#2dd4bf' : '#0f766e';
  const located = devices.filter((d) => d.last);
  return (
    <MapContainer center={[10.5, -66.9]} zoom={5} className="leaflet" zoomControl>
      <TileLayer {...TILES} />
      {located.map((d) => (
        <Marker
          key={d.id}
          position={[d.last!.lat, d.last!.lng]}
          icon={vehicleIcon(d.name, statusOf(d, now), d.id === selected?.id)}
          eventHandlers={{ click: () => onSelect(d.id) }}
        />
      ))}
      {route && route.length > 0 && (
        <>
          <Polyline positions={route.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: routeColor, weight: 4 }} />
          <CircleMarker center={[route[0].lat, route[0].lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }}>
            <Tooltip>Inicio {route[0].at.toLocaleTimeString()}</Tooltip>
          </CircleMarker>
          <CircleMarker center={[route[route.length - 1].lat, route[route.length - 1].lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#b91c1c', fillOpacity: 1, weight: 2 }}>
            <Tooltip>Fin {route[route.length - 1].at.toLocaleTimeString()}</Tooltip>
          </CircleMarker>
        </>
      )}
      <FitView devices={located} selected={selected} route={route} routeKey={routeKey} live={live} />
    </MapContainer>
  );
}

/**
 * Encuadra el mapa: toda la flota al entrar; el recorrido al elegir un vehículo o día;
 * y, en vivo, mueve el mapa solo si el vehículo se sale de la vista.
 */
function FitView({ devices, selected, route, routeKey, live }: {
  devices: Device[]; selected: Device | null; route: RoutePoint[] | null; routeKey: string; live: boolean;
}) {
  const map = useMap();
  const fittedFleet = useRef(false);
  const fittedRouteKey = useRef('');
  const lastLat = selected?.last?.lat;
  const lastLng = selected?.last?.lng;

  useEffect(() => {
    if (fittedFleet.current || devices.length === 0) return;
    map.fitBounds(L.latLngBounds(devices.map((d) => [d.last!.lat, d.last!.lng])), { padding: [60, 60], maxZoom: 15 });
    fittedFleet.current = true;
  }, [map, devices]);

  useEffect(() => {
    if (!routeKey || fittedRouteKey.current === routeKey) return;
    if (route && route.length > 0) {
      map.fitBounds(L.latLngBounds(route.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 17, animate: false });
      fittedRouteKey.current = routeKey;
    } else if (route && lastLat != null && lastLng != null) {
      map.setView([lastLat, lastLng], Math.max(map.getZoom(), 15), { animate: false });
      fittedRouteKey.current = routeKey;
    }
  }, [map, route, routeKey, lastLat, lastLng]);

  useEffect(() => {
    if (!live || lastLat == null || lastLng == null || fittedRouteKey.current !== routeKey) return;
    if (!map.getBounds().pad(-0.1).contains([lastLat, lastLng])) map.panTo([lastLat, lastLng]);
  }, [map, live, routeKey, lastLat, lastLng]);

  return null;
}
