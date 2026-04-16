# CPC Monitor — Google Ads Dashboard

Dashboard para monitorizar campañas de Google Ads con estrategia Target ROAS. Conecta directamente con la Google Ads API v23 y ofrece análisis en tiempo real de CPC, Impression Share, ROAS y competencia en la subasta.

## Stack
- **Next.js 14** (App Router)
- **NextAuth.js** — OAuth2 con Google (scope adwords)
- **Prisma** + **PostgreSQL** (Supabase en producción) / SQLite (dev)
- **Recharts** — gráficos interactivos
- **Tailwind CSS** — diseño dark theme

---

## Setup rápido

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
| `GOOGLE_ADS_MCC_CUSTOMER_ID` | ID del MCC sin guiones, ej: `8804157788` |
| `NEXTAUTH_SECRET` | Genera con: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3005` |
| `DATABASE_URL` | Cadena de conexión PostgreSQL/SQLite |
| `NEXT_PUBLIC_GOOGLE_ADS_CUSTOMER_ID` | Customer ID por defecto para el frontend (opcional) |

### Redirect URI para Google Cloud Console
```
http://localhost:3005/api/auth/callback/google
```

---

## Secciones de la aplicación

### WORKSPACE

#### Overview — `/dashboard`
Panel principal con vista global de todas las campañas activas.
- **KPI Cards:** campañas activas, clics totales, coste total EUR, IS medio
- **Tabla de campañas:** CPC techo, CPC actual, uso del techo %, clics, coste, CTR, IS, ROAS
- **Badge de recomendación** por campaña (OK / WARNING / ALERT)
- **Vista expandible** con historial y recomendación experta por campaña

#### Campaigns — `/dashboard` (vista grid)
Mismas campañas en formato tarjeta (grid view) para una revisión visual rápida.

---

### ANALYTICS

#### IS Monitor — `/dashboard/is-monitor`
Analiza la cuota de impresiones (Impression Share) de cada campaña y diagnostica por qué se pierde visibilidad.

| Métrica | Significado |
|---------|-------------|
| IS Real | % de impresiones capturadas |
| Lost Budget | % perdido por presupuesto insuficiente |
| Lost Rank | % perdido por puja / Quality Score bajo |
| Top IS | % en posición 1 de la página |
| Abs. Top IS | % en la posición más alta absoluta |

- Gráfico de barras apiladas (IS real + lost budget + lost rank)
- Grid de posicionamiento SERP por campaña
- Evolución histórica expandible (últimos 30 días)

#### CPC Analysis — `/dashboard/cpc-analysis`
Monitoriza el CPC actual de cada campaña frente a su techo configurado.

- Gráfico horizontal por uso del techo (colores: verde < 70%, ámbar 70-89%, rojo ≥ 90%)
- Tabla con CPC actual EUR, techo EUR y barra de uso visual
- Panel expandible con margen disponible y evolución histórica
- Resolución de techo en cascada: nivel campaña → portfolio inline → cartera MCC → manual

#### ROAS Tracker — `/dashboard/roas-tracker`
Seguimiento del retorno sobre inversión publicitaria vs. objetivo Target ROAS.

| Estado | Condición |
|--------|-----------|
| OK (verde) | ROAS real ≥ target |
| WARN (ámbar) | ROAS real ≥ 80% del target |
| ALERT (rojo) | ROAS real < 80% del target |

- Gráfico horizontal top 15 campañas por coste
- Tabla ordenable por ROAS, target o coste
- Evolución histórica expandible

#### Auction Insights — `/dashboard/auction-insights`
Análisis competitivo de la subasta (vista demo con datos simulados, integración API planificada).

- Comparativa de IS propio vs. competidores
- Gráfico radar: IS, Top Page, Abs Top, vs Competition, Overlap
- Tabla con Overlap Rate, Outranked By, Top Page Rate, Abs. Top por dominio

---

### SYSTEM

#### Alerts — `/dashboard/alerts`
Sistema de alertas automáticas por umbrales configurados.

| Condición | Nivel |
|-----------|-------|
| CPC ≥ 95% del techo | CRÍTICO |
| CPC ≥ 80% del techo | AVISO |
| IS perdido presupuesto > 30% | CRÍTICO |
| IS perdido presupuesto 15–30% | AVISO |
| ROAS real < 70% del target | CRÍTICO |
| ROAS real 70–85% del target | AVISO |

- Filtro por nivel (Críticas / Avisos / Informativas)
- Descarte individual y restauración de alertas

#### Reports — `/dashboard/reports`
Generador de reportes exportables en CSV para stakeholders.

| Tipo | Contenido |
|------|-----------|
| Resumen General | Todas las métricas por campaña |
| Análisis CPC | CPC medio vs techo por campaña |
| ROAS Tracker | ROAS real vs objetivo por campaña |
| IS Monitor | IS real + IS perdido por causa |

#### Config — `/dashboard/config`
Configuración del sistema: Customer ID por defecto, techos CPC manuales por campaña y umbrales de IS para alertas de marca.

---

## Techos CPC manuales

Si tus estrategias de cartera son del MCC y la API no puede leerlas automáticamente, configúralos en `src/lib/manual-ceilings.ts`:

```ts
export const MANUAL_CPC_CEILINGS: Record<string, number> = {
  'NOMBRE_CAMPAÑA_EXACTO': 0.40,
}
```

También puedes editarlos desde la UI en `/dashboard/config`.

---

## Estructura del proyecto

```
src/
  app/
    api/
      auth/           — NextAuth + Google OAuth2
      campaigns/      — Endpoint principal Google Ads API
      config/         — Guardar/leer configuración
    dashboard/        — Páginas del dashboard (Next.js App Router)
    login/            — Página de login
  components/
    layout/
      AppSidebar.tsx  — Menú lateral de navegación
    dashboard/
      DashboardClient.tsx       — Overview principal
      CpcAnalysisClient.tsx     — Análisis CPC
      ISMonitorClient.tsx       — IS Monitor
      RoasTrackerClient.tsx     — ROAS Tracker
      AlertsClient.tsx          — Alertas
      ReportsClient.tsx         — Reportes
      AuctionInsightsClient.tsx — Auction Insights
      CampaignCard.tsx          — Tarjeta de campaña (grid view)
      CampaignTable.tsx         — Tabla de campañas
      CampaignDetailView.tsx    — Vista detalle expandible
  lib/
    google-ads.ts       — Cliente Google Ads API v23
    auth.ts             — Configuración NextAuth
    refresh-token.ts    — Refresco automático de tokens OAuth
    manual-ceilings.ts  — Techos manuales por campaña
    recommendations.ts  — Lógica de recomendaciones
  types/
    index.ts            — Tipos TypeScript compartidos
prisma/
  schema.prisma         — Modelos de base de datos
public/
  help.html             — Documentación visual de la aplicación
```

---

## Flujo de datos

```
Google OAuth2 (login)
        ↓
    access_token (scope: adwords)
        ↓
Google Ads API v23
    ├─ /customers/{id}/googleAds:search (campañas + métricas)
    └─ /customers/{id}/googleAds:search (estrategias de cartera)
        ↓
lib/google-ads.ts → getCampaignMetrics()
    ├─ Resuelve CPC ceilings (4 niveles en cascada)
    ├─ Calcula métricas derivadas (ROAS real, IS, usage %)
    └─ buildRecommendation()
        ↓
/api/campaigns (Next.js Route Handler)
    └─ Guarda snapshot en BD para históricos
        ↓
Componentes del dashboard (Recharts + tablas)
```
