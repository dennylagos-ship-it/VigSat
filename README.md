# VigSat

Sistema de rastreo GPS en tiempo real para flotas vehiculares y particulares.

## Estructura

| Carpeta | Contenido |
|---|---|
| `firebase/` | Reglas de seguridad de Firestore y sus pruebas |
| `apps/tracker/` | App móvil rastreadora (Expo / React Native) — paso 2 |
| `apps/web/` | Panel web con mapa en tiempo real — paso 3 |
| `docs/` | Plan y decisiones |

## Backend: Firebase

Usamos Firebase (Authentication + Cloud Firestore) en un proyecto propio, plan gratuito Spark.

### Modelo de datos (Firestore)

```
accounts/{accountId}                  name, kind ('fleet' | 'personal'), ownerId, createdAt
accounts/{accountId}/members/{uid}    role ('owner' | 'admin' | 'viewer' | 'driver')
devices/{deviceId}                    accountId, name, plate, kind ('phone' | 'gps_tracker'),
                                      imei, assignedUserId, last { lat, lng, speedKmh, heading, recordedAt }
devices/{deviceId}/positions/{id}     lat, lng, speedKmh, heading, accuracyM, batteryPct, recordedAt
```

- Al crear una cuenta, la app escribe en un mismo batch la cuenta y el miembro `owner`.
- El celular escribe cada posición y actualiza `devices/{id}.last` en un mismo batch
  (el panel escucha `last` en tiempo real).
- Los rastreadores GPS físicos escribirán más adelante desde un servidor con Admin SDK.

### Seguridad

Cada usuario solo ve las cuentas donde es miembro. Un celular solo puede enviar posiciones
del dispositivo que tiene asignado y no puede cambiar otros datos. Las posiciones no se editan.

### Probar las reglas

```bash
cd firebase
npm install
npm test        # levanta el emulador de Firestore y corre tests/rules.test.js
```

### Publicar las reglas

```bash
npx firebase login
npx firebase use <id-del-proyecto>
npx firebase deploy --only firestore
```
