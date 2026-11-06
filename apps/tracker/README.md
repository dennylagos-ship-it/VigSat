# VigSat — app rastreadora

App para Android y iPhone que convierte el celular en el rastreador GPS de un vehículo.

## Qué hace

1. **Inicio de sesión** con correo y contraseña (Firebase Authentication).
2. **Primer uso:** el usuario elige *Particular* o *Flota / empresa*, pone el nombre del
   vehículo y la placa. Se crean la cuenta, el usuario como dueño y este celular como dispositivo.
3. **Rastreo:** con el botón *Iniciar rastreo* envía la ubicación cada 15 segundos o cada
   25 metros, también con la app en segundo plano (Android muestra una notificación fija).
   Cada punto va a `devices/{id}/positions` y actualiza `devices/{id}.last`.

## Probar rápido (con la app abierta)

```bash
cd apps/tracker
npm install
npx expo start
```

Escanea el código QR con **Expo Go** en el celular. En Expo Go el envío funciona mientras la
app está abierta; el segundo plano necesita instalar la app (abajo).

## Instalar en Android con segundo plano (APK)

```bash
npx eas-cli@latest login          # cuenta gratis en expo.dev
npx eas-cli@latest build -p android --profile preview
```

Al terminar, EAS da un enlace para descargar el APK e instalarlo en el celular.
Al pedir permisos de ubicación, elige **Permitir todo el tiempo**.

## Comprobaciones

```bash
npx tsc --noEmit
```
