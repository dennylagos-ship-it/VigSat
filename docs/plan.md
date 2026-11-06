# Plan del MVP

1. **Repositorio y base de datos** — estructura del proyecto y esquema en Supabase.
2. **App rastreadora** — celular Android/iPhone que envía su ubicación, también en segundo plano.
3. **Panel web** — mapa en tiempo real, historial de recorridos y lista de vehículos.
4. **Prueba real** — 2 o 3 celulares en carros; luego elegir GPS físico y servidor.

## Por qué celular primero
Una SIM sola no da la ubicación. El celular ya trae GPS y datos, así que permite probar sin
comprar hardware. Más adelante, rastreadores dedicados (Teltonika, Concox, Coban) con SIM de
datos enviarán a la misma tabla `positions` a través de un receptor en el servidor.
