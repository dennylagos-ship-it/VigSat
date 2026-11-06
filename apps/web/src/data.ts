import {
  Timestamp, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from './firebase';

export type LastPosition = {
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
  batteryPct?: number;
  recordedAt: Timestamp;
};

export type Device = {
  id: string;
  accountId: string;
  name: string;
  plate?: string | null;
  kind: 'phone' | 'gps_tracker';
  last?: LastPosition;
};

export type Account = { id: string; name: string; kind: 'fleet' | 'personal' };

export type RoutePoint = { lat: number; lng: number; speedKmh?: number; at: Date };

/**
 * Cuentas del usuario: las que tiene registradas en users/{uid}.accountIds
 * más las de los dispositivos que tiene asignados (usuarios anteriores a users/{uid}).
 */
async function loadAccountIds(uid: string): Promise<string[]> {
  const ids = new Set<string>();
  const userSnap = await getDoc(doc(db, 'users', uid)).catch(() => null);
  for (const id of (userSnap?.data()?.accountIds as string[] | undefined) ?? []) ids.add(id);
  const assigned = await getDocs(query(collection(db, 'devices'), where('assignedUserId', '==', uid)));
  assigned.forEach((d) => ids.add(d.data().accountId));
  return [...ids];
}

export function useAccounts(uid: string) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await loadAccountIds(uid);
        const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'accounts', id)).catch(() => null)));
        const list = snaps
          .filter((s) => s?.exists())
          .map((s) => ({ id: s!.id, ...(s!.data() as Omit<Account, 'id'>) }));
        if (!cancelled) setAccounts(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  return { accounts, error };
}

/** Dispositivos de las cuentas, actualizados en tiempo real. */
export function useDevices(accountIds: string[]) {
  const [byAccount, setByAccount] = useState<Record<string, Device[]>>({});
  const key = accountIds.join(',');

  useEffect(() => {
    const unsubs = accountIds.map((accountId) =>
      onSnapshot(query(collection(db, 'devices'), where('accountId', '==', accountId)), (snap) => {
        setByAccount((prev) => ({
          ...prev,
          [accountId]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Device, 'id'>) })),
        }));
      }),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return Object.values(byAccount).flat().sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recorrido de un dispositivo en un día (hora local, formato AAAA-MM-DD), en tiempo real:
 * si el día es hoy, la línea se alarga sola con cada nueva posición.
 */
export function useRoute(deviceId: string | null, day: string) {
  const [state, setState] = useState<{ key: string; points: RoutePoint[] | null; error: string | null }>({
    key: '', points: null, error: null,
  });
  const key = deviceId ? `${deviceId}|${day}` : '';

  useEffect(() => {
    if (!deviceId) return;
    const [y, m, d] = day.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const end = new Date(y, m - 1, d + 1);
    return onSnapshot(
      query(
        collection(db, 'devices', deviceId, 'positions'),
        where('recordedAt', '>=', Timestamp.fromDate(start)),
        where('recordedAt', '<', Timestamp.fromDate(end)),
        orderBy('recordedAt'),
      ),
      (snap) => setState({
        key: `${deviceId}|${day}`,
        error: null,
        points: snap.docs.map((doc) => {
          const p = doc.data();
          return { lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, at: (p.recordedAt as Timestamp).toDate() };
        }),
      }),
      (e) => setState({ key: `${deviceId}|${day}`, points: null, error: e.message }),
    );
  }, [deviceId, day]);

  // Mientras llega la primera respuesta del nuevo vehículo o día, no se muestra el recorrido anterior.
  const current = state.key === key;
  return { key, route: current ? state.points : null, error: current ? state.error : null, loading: !!key && !current };
}

/** Distancia total del recorrido en km (fórmula de haversine). */
export function routeDistanceKm(points: RoutePoint[]): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(h));
  }
  return total;
}
