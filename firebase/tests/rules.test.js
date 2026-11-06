// Pruebas de las reglas de Firestore. Ejecutar con: npm test (usa el emulador local)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, writeBatch, serverTimestamp, Timestamp,
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
