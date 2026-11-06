// Pruebas de las reglas de Firestore. Ejecutar con: npm test (usa el emulador local)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, writeBatch, serverTimestamp, Timestamp,
  query, where, orderBy, arrayUnion,
} from 'firebase/firestore';

let env;
const ACC = 'acc1';
const DEV = 'dev1';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vigsat',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'accounts', ACC), { name: 'Flota Uno', kind: 'fleet', ownerId: 'owner', createdAt: Timestamp.now() });
    await setDoc(doc(db, 'accounts', ACC, 'members', 'owner'), { role: 'owner' });
    await setDoc(doc(db, 'accounts', ACC, 'members', 'driver'), { role: 'driver' });
    await setDoc(doc(db, 'devices', DEV), { accountId: ACC, name: 'Camión 1', kind: 'phone', assignedUserId: 'driver' });
  });
});

const pos = () => ({ lat: 10.5, lng: -66.9, speedKmh: 40, recordedAt: Timestamp.now() });
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

test('un usuario crea su cuenta y queda como dueño', async () => {
  const d = db('nuevo');
  const b = writeBatch(d);
  b.set(doc(d, 'accounts', 'acc2'), { name: 'Mi carro', kind: 'personal', ownerId: 'nuevo', createdAt: serverTimestamp() });
  b.set(doc(d, 'accounts', 'acc2', 'members', 'nuevo'), { role: 'owner' });
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(d, 'accounts', 'acc2')));
});

test('no se puede crear una cuenta a nombre de otro', async () => {
  await assertFails(setDoc(doc(db('nuevo'), 'accounts', 'acc3'), { name: 'X', kind: 'fleet', ownerId: 'otro', createdAt: Timestamp.now() }));
});

test('nadie se agrega como dueño de una cuenta ajena', async () => {
  await assertFails(setDoc(doc(db('intruso'), 'accounts', ACC, 'members', 'intruso'), { role: 'owner' }));
});

test('miembros ven su cuenta y dispositivos; extraños no', async () => {
  await assertSucceeds(getDoc(doc(db('driver'), 'devices', DEV)));
  await assertFails(getDoc(doc(db('intruso'), 'devices', DEV)));
  await assertFails(getDoc(doc(db(null), 'accounts', ACC)));
});

test('el celular asignado envía posiciones y actualiza su última posición', async () => {
  const d = db('driver');
  await assertSucceeds(addDoc(collection(d, 'devices', DEV, 'positions'), pos()));
  await assertSucceeds(updateDoc(doc(d, 'devices', DEV), { last: pos() }));
});

test('el celular asignado no puede cambiar otros datos del dispositivo', async () => {
  await assertFails(updateDoc(doc(db('driver'), 'devices', DEV), { name: 'hackeado' }));
});

test('otro usuario no puede enviar posiciones a ese dispositivo', async () => {
  await assertFails(addDoc(collection(db('owner'), 'devices', DEV, 'positions'), pos()));
  await assertFails(addDoc(collection(db('intruso'), 'devices', DEV, 'positions'), pos()));
});

test('posiciones inválidas se rechazan', async () => {
  await assertFails(addDoc(collection(db('driver'), 'devices', DEV, 'positions'), { ...pos(), lat: 200 }));
});

test('el dueño crea dispositivos; un conductor no', async () => {
  await assertSucceeds(setDoc(doc(db('owner'), 'devices', 'dev2'), { accountId: ACC, name: 'Moto', kind: 'phone' }));
  await assertFails(setDoc(doc(db('driver'), 'devices', 'dev3'), { accountId: ACC, name: 'Moto', kind: 'phone' }));
});

test('las posiciones no se pueden editar', async () => {
  let id;
  await env.withSecurityRulesDisabled(async (ctx) => {
    id = (await addDoc(collection(ctx.firestore(), 'devices', DEV, 'positions'), pos())).id;
  });
  await assertFails(updateDoc(doc(db('driver'), 'devices', DEV, 'positions', id), { lat: 1 }));
});

test('la app encuentra su dispositivo asignado; no los de otros', async () => {
  const q = (uid) => query(collection(db(uid), 'devices'), where('assignedUserId', '==', uid));
  await assertSucceeds(getDocs(q('driver')));
  await assertFails(getDocs(query(collection(db('intruso'), 'devices'), where('assignedUserId', '==', 'driver'))));
});

test('primer uso: crear cuenta y luego registrar el celular propio', async () => {
  const d = db('nuevo');
  const b = writeBatch(d);
  b.set(doc(d, 'accounts', 'acc9'), { name: 'Yo', kind: 'personal', ownerId: 'nuevo', createdAt: serverTimestamp() });
  b.set(doc(d, 'accounts', 'acc9', 'members', 'nuevo'), { role: 'owner' });
  b.set(doc(d, 'users', 'nuevo'), { accountIds: arrayUnion('acc9') }, { merge: true });
  await assertSucceeds(b.commit());
  await assertSucceeds(addDoc(collection(d, 'devices'), {
    accountId: 'acc9', name: 'Mi carro', plate: null, kind: 'phone', assignedUserId: 'nuevo', createdAt: serverTimestamp(),
  }));
});

test('el celular envía varias posiciones y su última posición en un batch', async () => {
  const d = db('driver');
  const b = writeBatch(d);
  b.set(doc(collection(d, 'devices', DEV, 'positions')), pos());
  b.set(doc(collection(d, 'devices', DEV, 'positions')), pos());
  b.update(doc(d, 'devices', DEV), { last: pos() });
  await assertSucceeds(b.commit());
});

test('cada usuario lee y escribe solo su propio documento users', async () => {
  await assertSucceeds(setDoc(doc(db('owner'), 'users', 'owner'), { accountIds: [ACC] }));
  await assertSucceeds(getDoc(doc(db('owner'), 'users', 'owner')));
  await assertFails(getDoc(doc(db('intruso'), 'users', 'owner')));
  await assertFails(setDoc(doc(db('intruso'), 'users', 'owner'), { accountIds: [] }));
  await assertFails(setDoc(doc(db('owner'), 'users', 'owner'), { accountIds: [ACC], admin: true }));
});

test('anotar una cuenta ajena en users no da acceso a ella', async () => {
  await setDoc(doc(db('intruso'), 'users', 'intruso'), { accountIds: [ACC] });
  await assertFails(getDoc(doc(db('intruso'), 'accounts', ACC)));
  await assertFails(getDocs(query(collection(db('intruso'), 'devices'), where('accountId', '==', ACC))));
});

test('el panel lista los vehículos de la cuenta y su recorrido del día', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await addDoc(collection(ctx.firestore(), 'devices', DEV, 'positions'), pos());
  });
  const d = db('owner');
  const devs = await assertSucceeds(getDocs(query(collection(d, 'devices'), where('accountId', '==', ACC))));
  if (devs.size !== 1) throw new Error('esperaba 1 dispositivo');
  const start = Timestamp.fromMillis(Date.now() - 86_400_000);
  const route = await assertSucceeds(getDocs(query(
    collection(d, 'devices', DEV, 'positions'), where('recordedAt', '>=', start), orderBy('recordedAt'),
  )));
  if (route.size !== 1) throw new Error('esperaba 1 posición');
  await assertFails(getDocs(query(collection(db('intruso'), 'devices', DEV, 'positions'), orderBy('recordedAt'))));
});
