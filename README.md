<p align="center">
  <img src=".github/frontino-oso.png" alt="Frontino Software Solutions" height="96">
</p>

<h1 align="center">VigSat</h1>
<p align="center"><b>Rastreo GPS en tiempo real</b><br>Para flotas vehiculares y particulares: app rastreadora + panel web con mapa</p>

<p align="center">
  <img src="https://img.shields.io/badge/App-Expo-1B2A41?logo=expo&logoColor=white" alt="App: Expo">
  <img src="https://img.shields.io/badge/Panel-React%20%2B%20Vite-1B2A41?logo=react&logoColor=white" alt="Panel: React + Vite">
  <img src="https://img.shields.io/badge/Backend-Firebase-FFCA28?logo=firebase&logoColor=white" alt="Backend: Firebase">
  <img src="https://img.shields.io/badge/licencia-propietaria-25D366" alt="licencia: propietaria">
</p>

---

## Funciones principales

- 📍 **Ubicación en vivo** de cada vehículo o persona sobre el mapa.
- 📱 **El celular como rastreador**, también en segundo plano.
- 🗂️ **Cuentas de flota o personales**, con roles: dueño, administrador, observador y conductor.
- 🕓 **Historial de posiciones** con velocidad, rumbo, precisión y batería.
- 🔒 **Seguridad por reglas**: cada quien ve solo sus cuentas; un celular solo envía datos del equipo asignado.
- 🛰️ Preparado para **rastreadores GPS físicos** (por IMEI) en una siguiente etapa.


## Estructura

| Carpeta | Contenido |
|---|---|
| `firebase/` | Reglas de seguridad de Firestore y sus pruebas |
| `apps/tracker/` | App móvil rastreadora (Expo / React Native) — ver su README |
| `apps/web/` | Panel web con mapa en tiempo real — ver su README |
| `docs/` | Plan y decisiones |

## Backend: Firebase

Usamos Firebase (Authentication + Cloud Firestore) en un proyecto propio, plan gratuito Spark.

### Modelo de datos (Firestore)

```
users/{uid}                           accountIds (cuentas del usuario, para el panel)
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

---

## Licencia

**Software propietario.** © 2026 Lcdo. Denny Lagos · Frontino Software Solutions. Todos los derechos reservados.

<p align="center">
  <img src=".github/frontino-oso.png" alt="Frontino Software Solutions" height="56"><br>
  <b>Frontino Software Solutions</b> · Táchira, Venezuela<br>
  <i>«El poder de las grandes ideas hecho software»</i><br>
  Apps Android · páginas web · aulas virtuales · sistemas a la medida · chatbots con IA<br>
  📱 WhatsApp: <a href="https://wa.me/584247714625">+58 424 771 4625</a> · Instagram: <a href="https://instagram.com/frontino.software">@frontino.software</a>
</p>
