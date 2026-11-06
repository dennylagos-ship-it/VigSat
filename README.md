# VigSat

Sistema de rastreo GPS para flotas vehiculares y particulares.

## Estructura

| Carpeta | Contenido |
|---|---|
| `supabase/migrations/` | Esquema de base de datos (Postgres + RLS en Supabase) |
| `apps/tracker/` | App móvil rastreadora (Expo / React Native) — paso 2 |
| `apps/web/` | Panel web con mapa en tiempo real — paso 3 |
| `docs/` | Plan y decisiones |

## Modelo de datos

- **accounts**: una flota (empresa) o un particular.
- **account_members**: usuarios de la cuenta con rol `owner`, `admin`, `viewer` o `driver`.
- **devices**: un celular con la app (`phone`) o un rastreador GPS físico (`gps_tracker`, por IMEI).
- **positions**: cada punto GPS recibido. Un trigger actualiza la última posición del dispositivo.

Seguridad: cada usuario solo ve los datos de las cuentas donde es miembro, y un celular
solo puede enviar posiciones del dispositivo que tiene asignado.
