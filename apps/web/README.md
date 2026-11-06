# VigSat — panel web

Panel para ver los vehículos en un mapa en tiempo real y su recorrido por día.

- Inicio de sesión con el mismo usuario de la app del celular.
- Lista de vehículos con estado: **En línea** (menos de 2 min), **Reciente** (menos de 30 min) o **Sin señal**.
- Mapa OpenStreetMap con la última posición de cada vehículo; se actualiza solo.
- Al elegir un vehículo: recorrido de un día con distancia, horario y velocidad máxima.

## Abrirlo en tu computadora

```bash
cd apps/web
npm install
npm run dev
```

Abre http://localhost:5173 en el navegador.

## Probar sin tocar los datos reales

```bash
# en otra terminal, desde firebase/
npx firebase emulators:start --only firestore,auth --project vigsat --config ../firebase.json
# y en apps/web
VITE_USE_EMULATOR=1 npm run dev
```

## Comprobaciones

```bash
npm run build   # typecheck + build
npm run lint
```
