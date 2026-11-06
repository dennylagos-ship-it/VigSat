import {
  addDoc, arrayUnion, collection, doc, getDocs, limit, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';

import { db } from './firebase';

export type AccountKind = 'fleet' | 'personal';

export type MyDevice = {
  id: string;
  accountId: string;
  name: string;
  plate?: string;
};

/** Busca el dispositivo asignado a este usuario (su celular). */
export async function findMyDevice(uid: string): Promise<MyDevice | null> {
  const snap = await getDocs(
    query(collection(db, 'devices'), where('assignedUserId', '==', uid), limit(1)),
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return { id: d.id, accountId: data.accountId, name: data.name, plate: data.plate };
}

/**
 * Primer uso: crea la cuenta (flota o particular), deja al usuario como dueño
 * y registra este celular como dispositivo asignado a él.
 */
export async function createAccountWithDevice(params: {
  uid: string;
  accountName: string;
  kind: AccountKind;
  deviceName: string;
  plate?: string;
}): Promise<MyDevice> {
  const accountRef = doc(collection(db, 'accounts'));
  const batch = writeBatch(db);
  batch.set(accountRef, {
    name: params.accountName,
    kind: params.kind,
    ownerId: params.uid,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'accounts', accountRef.id, 'members', params.uid), { role: 'owner' });
  // Lista de cuentas del usuario, que el panel web usa para encontrarlas.
  batch.set(doc(db, 'users', params.uid), { accountIds: arrayUnion(accountRef.id) }, { merge: true });
  await batch.commit();

  // Se crea después del batch: la regla verifica que el usuario ya sea dueño de la cuenta.
  const plate = params.plate?.trim() || null;
  const deviceRef = await addDoc(collection(db, 'devices'), {
    accountId: accountRef.id,
    name: params.deviceName,
    plate,
    kind: 'phone',
    assignedUserId: params.uid,
    createdAt: serverTimestamp(),
  });
  return { id: deviceRef.id, accountId: accountRef.id, name: params.deviceName, plate: plate ?? undefined };
}
