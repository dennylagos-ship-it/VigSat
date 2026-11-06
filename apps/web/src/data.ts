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

/** Recorrido de un dispositivo en un día (hora local). */
export async function loadRoute(deviceId: string, day: Date): Promise<RoutePoint[]> {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const snap = await getDocs(query(
    collection(db, 'devices', deviceId, 'positions'),
    where('recordedAt', '>=', Timestamp.fromDate(start)),
    where('recordedAt', '<', Timestamp.fromDate(end)),
    orderBy('recordedAt'),
  ));
  return snap.docs.map((d) => {
    const p = d.data();
    return { lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, at: (p.recordedAt as Timestamp).toDate() };
  });
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
