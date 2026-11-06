import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth, getAuth, type Auth, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import { firebaseConfig } from './firebaseConfig';

const isFirstInit = getApps().length === 0;
export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

// La sesión se guarda en el teléfono para que la tarea en segundo plano siga autenticada.
export const auth: Auth = isFirstInit
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app);

export const db = getFirestore(app);

/** Espera a que Firebase restaure la sesión guardada (útil en la tarea de segundo plano). */
export function waitForUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}
