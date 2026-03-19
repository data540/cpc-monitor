# CPC Monitor — Google Ads Dashboard

Dashboard para monitorizar el CPC máximo en campañas con estrategia ROAS Objetivo.

## Stack
- **Next.js 14** (App Router)
- **NextAuth.js** — OAuth2 con Google
- **Prisma** + **SQLite** (desarrollo) / **PostgreSQL** (producción)
- **Recharts** — gráficos
- **Tailwind CSS**

---

## Setup rápido (Claude Code / OpenCode)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env.local
```
Edita `.env.local` con tus credenciales (ver sección abajo).

### 3. Inicializar base de datos
```bash
npx prisma generate
npx prisma db push
```

### 4. Arrancar en desarrollo
```bash
npm run dev
```
La app corre en **http://localhost:3005**

---

## Variables de entorno necesarias

| Variable | Dónde conseguirla |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credenciales OAuth2 |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credenciales OAuth2 |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads → Herramientas → API Center |
| `GOOGLE_ADS_MCC_CUSTOMER_ID` | El ID del MCC sin guiones, ej: `8804157788` |
| `NEXTAUTH_SECRET` | Genera con: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3005` |

### Redirect URI para Google Cloud Console
```
http://localhost:3005/api/auth/callback/google
```

---

## Techos CPC manuales

Si tus estrategias de cartera son del MCC y la API no puede leerlas
automáticamente, configúralos en `src/lib/manual-ceilings.ts`:

```ts
export const MANUAL_CPC_CEILINGS: Record<string, number> = {
  'AEU_BO_ES_MARCA_1': 0.40,
  'AEU_BO_ES_MARCA_GENERICA': 0.40,
}
```

También puedes editarlos desde la UI en `/dashboard/config`.

---

## Estructura del proyecto

```
src/
  app/
    api/
      auth/           — NextAuth OAuth2 handler
      campaigns/      — Endpoint que llama a Google Ads API
      config/         — Guardar/leer techos manuales
    dashboard/        — Página principal del dashboard
    login/            — Página de login
  components/
    ui/               — Componentes base (Card, Badge, Button...)
    charts/           — Gráfico de evolución CPC
    dashboard/        — CampaignCard, MetricGauge, AlertBanner
  lib/
    google-ads.ts     — Cliente Google Ads API
    manual-ceilings.ts — Techos manuales por campaña
    recommendations.ts — Lógica de recomendaciones (portada del script)
  types/
    index.ts          — Tipos TypeScript compartidos
prisma/
  schema.prisma       — Modelos de base de datos
```
