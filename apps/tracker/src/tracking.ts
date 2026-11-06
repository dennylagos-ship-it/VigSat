import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Timestamp, collection, doc, writeBatch } from 'firebase/firestore';

import { db, waitForUser } from './firebase';

export const LOCATION_TASK = 'vigsat-location';
const DEVICE_KEY = 'vigsat.deviceId';

/** Cada cuánto se envía la ubicación (lo que ocurra primero). */
const TIME_INTERVAL_MS = 15_000;
const DISTANCE_INTERVAL_M = 25;

export async function saveDeviceId(deviceId: string) {
  await AsyncStorage.setItem(DEVICE_KEY, deviceId);
}

export async function clearDeviceId() {
  await AsyncStorage.removeItem(DEVICE_KEY);
}

type Listener = (info: { at: Date; count: number } | { error: string }) => void;
const listeners = new Set<Listener>();
export function onSend(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = (info: Parameters<Listener>[0]) => listeners.forEach((l) => l(info));

function toPosition(loc: Location.LocationObject, batteryPct: number | null) {
  const { latitude, longitude, speed, heading, accuracy } = loc.coords;
  const position: Record<string, unknown> = {
    lat: latitude,
    lng: longitude,
    recordedAt: Timestamp.fromMillis(loc.timestamp),
  };
  // El GPS devuelve -1 o null cuando no conoce el valor.
  if (speed != null && speed >= 0) position.speedKmh = Math.round(speed * 3.6 * 10) / 10;
  if (heading != null && heading >= 0 && heading < 360) position.heading = heading;
  if (accuracy != null && accuracy >= 0) position.accuracyM = accuracy;
  if (batteryPct != null) position.batteryPct = batteryPct;
  return position;
}

async function readBattery(): Promise<number | null> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}

/** Guarda las posiciones y actualiza la última posición del dispositivo en un solo batch. */
export async function sendLocations(locations: Location.LocationObject[]) {
  if (locations.length === 0) return;
  const deviceId = await AsyncStorage.getItem(DEVICE_KEY);
  const user = await waitForUser();
  if (!deviceId || !user) return;

  const battery = await readBattery();
  const sorted = [...locations].sort((a, b) => a.timestamp - b.timestamp);
  const batch = writeBatch(db);
  const positions = collection(db, 'devices', deviceId, 'positions');
  for (const loc of sorted) {
    batch.set(doc(positions), toPosition(loc, battery));
  }
  batch.update(doc(db, 'devices', deviceId), { last: toPosition(sorted[sorted.length - 1], battery) });
  await batch.commit();
  notify({ at: new Date(), count: sorted.length });
}

// La tarea debe definirse al cargar la app (index.ts importa este archivo).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    notify({ error: error.message });
    return;
  }
  try {
    await sendLocations(data?.locations ?? []);
  } catch (e) {
    notify({ error: e instanceof Error ? e.message : String(e) });
  }
});

export type PermissionResult = 'background' | 'foreground-only' | 'denied';

export async function requestPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'background' : 'foreground-only';
}

// Respaldo cuando el segundo plano no está disponible (por ejemplo en Expo Go):
// se envía la ubicación solo mientras la app está abierta.
let foregroundWatch: Location.LocationSubscription | null = null;

export type TrackingMode = 'background' | 'foreground';

export async function isTracking() {
  if (foregroundWatch) return true;
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

export async function startTracking(): Promise<TrackingMode> {
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: TIME_INTERVAL_MS,
      distanceInterval: DISTANCE_INTERVAL_M,
      pausesUpdatesAutomatically: false,
      activityType: Location.LocationActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'VigSat activo',
        notificationBody: 'Enviando la ubicación de este vehículo',
        notificationColor: '#0F766E',
      },
    });
    return 'background';
  } catch {
    foregroundWatch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: TIME_INTERVAL_MS, distanceInterval: DISTANCE_INTERVAL_M },
      (loc) => {
        sendLocations([loc]).catch((e) => notify({ error: e instanceof Error ? e.message : String(e) }));
      },
    );
    return 'foreground';
  }
}

export async function stopTracking() {
  foregroundWatch?.remove();
  foregroundWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
