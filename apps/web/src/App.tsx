import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

import { loadRoute, routeDistanceKm, useAccounts, useDevices, type Device, type RoutePoint } from './data';
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
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <img src="/icon.png" alt="" className="logo" />
        <h1 className="brand">VigSat</h1>
        <p className="muted">Entra con el mismo usuario de la app del celular.</p>
        <label>Correo<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [day, setDay] = useState(todayInput);
  const [route, setRoute] = useState<RoutePoint[] | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.name ?? '';

  function select(id: string | null) {
    setSelectedId(id);
    setRoute(null);
    setRouteError(null);
  }

  async function showRoute() {
    if (!selected) return;
    setRouteBusy(true);
    setRouteError(null);
    try {
      const [y, m, d] = day.split('-').map(Number);
      setRoute(await loadRoute(selected.id, new Date(y, m - 1, d)));
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : 'No se pudo cargar el recorrido.');
    } finally {
      setRouteBusy(false);
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-head">
          <span className="brand small">VigSat</span>
          <button className="link" onClick={() => signOut(auth)} title={user.email ?? ''}>Salir</button>
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
            <h2>Recorrido de {selected.name}</h2>
            <div className="row">
              <input type="date" value={day} max={todayInput()} onChange={(e) => setDay(e.target.value)} />
              <button className="primary" onClick={showRoute} disabled={routeBusy}>{routeBusy ? 'Cargando…' : 'Ver'}</button>
            </div>
            {routeError && <p className="error">{routeError}</p>}
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
            {route && <button className="link" onClick={() => setRoute(null)}>Ocultar recorrido</button>}
          </section>
        )}
      </aside>

      <main className="map">
        <FleetMap devices={devices} selected={selected} route={route} now={now} onSelect={select} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- Mapa

const STATUS_COLOR: Record<Status, string> = { online: '#16a34a', recent: '#d97706', offline: '#64748b' };

function vehicleIcon(name: string, status: Status, selected: boolean) {
  const safe = name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return L.divIcon({
    className: '',
    html: `<div class="pin ${selected ? 'selected' : ''}" style="--c:${STATUS_COLOR[status]}"><span></span><b>${safe}</b></div>`,
    iconSize: [0, 0],
  });
}

function FleetMap({ devices, selected, route, now, onSelect }: {
  devices: Device[]; selected: Device | null; route: RoutePoint[] | null; now: number; onSelect: (id: string) => void;
}) {
  const located = devices.filter((d) => d.last);
  return (
    <MapContainer center={[10.5, -66.9]} zoom={5} className="leaflet" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
          <Polyline positions={route.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#0f766e', weight: 4 }} />
          <CircleMarker center={[route[0].lat, route[0].lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }}>
            <Tooltip>Inicio {route[0].at.toLocaleTimeString()}</Tooltip>
          </CircleMarker>
          <CircleMarker center={[route[route.length - 1].lat, route[route.length - 1].lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#b91c1c', fillOpacity: 1, weight: 2 }}>
            <Tooltip>Fin {route[route.length - 1].at.toLocaleTimeString()}</Tooltip>
          </CircleMarker>
        </>
      )}
      <FitView devices={located} selected={selected} route={route} />
    </MapContainer>
  );
}

/** Encuadra el mapa: el recorrido, el vehículo elegido o toda la flota. */
function FitView({ devices, selected, route }: { devices: Device[]; selected: Device | null; route: RoutePoint[] | null }) {
  const map = useMap();
  const fittedFleet = useRef(false);

  useEffect(() => {
    if (route && route.length > 0) {
      map.fitBounds(L.latLngBounds(route.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 17, animate: false });
    }
  }, [map, route]);

  useEffect(() => {
    if (selected?.last && !route) map.setView([selected.last.lat, selected.last.lng], Math.max(map.getZoom(), 15), { animate: false });
  }, [map, selected?.id, selected?.last, route]);

  useEffect(() => {
    if (fittedFleet.current || devices.length === 0) return;
    map.fitBounds(L.latLngBounds(devices.map((d) => [d.last!.lat, d.last!.lng])), { padding: [60, 60], maxZoom: 15 });
    fittedFleet.current = true;
  }, [map, devices]);

  return null;
}
