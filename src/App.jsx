/**
 * @fileoverview Raíz de la aplicación Web Usuario — definición de rutas.
 *
 * PROPÓSITO:
 *   Define la estructura de navegación completa de la aplicación usando
 *   React Router v7 (createBrowserRouter). Separa las rutas en dos grupos:
 *     1. Rutas públicas: /login, /register (accesibles sin sesión).
 *     2. Rutas protegidas: /location, /security, /history, /motos
 *        (envueltas en Layout que verifica autenticación y onboarding).
 *     3. Rutas de transición: /onboarding (requiere sesión pero no deviceId).
 *
 * FLUJO DE AUTENTICACIÓN Y ONBOARDING:
 *   Usuario nuevo: /login → registro → /onboarding → /location
 *   Usuario existente sin device: /login → /onboarding → /location
 *   Usuario existente con device: /login → /location (directo)
 *   Token expirado: cualquier página → interceptor 401 → /login
 *
 * NOTA SOBRE /onboarding:
 *   Esta ruta está fuera del Layout (no tiene sidebar) pero requiere que
 *   el usuario esté autenticado. La verificación de sesión la hace el
 *   propio OnboardingPage mediante el store. Si se accede a /onboarding
 *   sin sesión, onboardingPage intentaría llamar APIs y fallaría con 401,
 *   lo que disparará el interceptor → /login. Esto es aceptable para el
 *   nivel actual del producto. Mejora futura: guardia explícita.
 *
 * DEUDA TÉCNICA:
 *   - Agregar MotosPage cuando esté implementada (ruta /motos en Layout).
 *   - Lazy loading de páginas para reducir el bundle inicial.
 *   - Route-level error boundaries para capturar errores de renderizado.
 *
 * @module App
 */

import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import Layout         from './components/layout/Layout.jsx'
import LoginPage      from './pages/LoginPage.jsx'
import LocationPage   from './pages/LocationPage.jsx'
import SecurityPage   from './pages/SecurityPage.jsx'
import HistoryPage    from './pages/HistoryPage.jsx'
import DrivingPage    from './pages/DrivingPage.jsx'
import PremiumPage    from './pages/PremiumPage.jsx'
import OnboardingPage from './pages/OnboardingPage.jsx'
import ProfilePage    from './pages/ProfilePage.jsx'

/**
 * @brief Definición del router de la aplicación.
 *
 * PROPÓSITO:
 *   createBrowserRouter crea un router basado en la History API del navegador
 *   (URLs limpias sin #). Es la API recomendada por React Router v7 en lugar
 *   de <BrowserRouter> imperativo.
 *
 * ESTRUCTURA:
 *   /login          → LoginPage (pública)
 *   /onboarding     → OnboardingPage (requiere sesión, sin sidebar)
 *   /               → Layout (guardia auth + onboarding)
 *     index         → redirige a /location
 *     /location     → LocationPage
 *     /security     → SecurityPage
 *     /history      → HistoryPage
 *     /motos        → (pendiente: MotosPage)
 *   *               → redirige a /
 *
 * POR QUÉ /onboarding está FUERA del Layout:
 *   El Layout incluye el sidebar y redirige a /onboarding si !deviceId.
 *   Si /onboarding estuviera dentro del Layout, se crearía un loop:
 *   Layout detecta !deviceId → redirige a /onboarding → Layout detecta !deviceId → loop.
 *   Estando fuera, /onboarding se renderiza directamente sin pasar por Layout.
 */
const router = createBrowserRouter([
  // ── Rutas públicas ──────────────────────────────────────────────────────
  {
    path: '/login',
    element: <LoginPage />,
  },

  // ── Ruta de transición: onboarding (sesión activa, sin deviceId) ────────
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },

  // ── Rutas protegidas (dentro del Layout con sidebar) ────────────────────
  {
    path: '/',
    element: <Layout />,
    children: [
      // Redirigir la raíz al panel de ubicación
      { index: true, element: <Navigate to="/location" replace /> },

      // Panel de ubicación en tiempo real (mapa + GPS)
      { path: 'location', element: <LocationPage /> },

      { path: 'security', element: <SecurityPage /> },
      { path: 'history',  element: <HistoryPage />  },
      { path: 'driving',  element: <DrivingPage />  },
      { path: 'premium',  element: <PremiumPage />  },
      { path: 'perfil',   element: <ProfilePage />  },
    ],
  },

  // ── Catch-all: cualquier ruta desconocida va a la raíz ─────────────────
  { path: '*', element: <Navigate to="/" replace /> },
])

/**
 * @brief Componente raíz de la aplicación.
 *
 * PROPÓSITO:
 *   Punto de montaje del router. Todo el árbol de componentes de la app
 *   vive dentro de <RouterProvider>. No contiene lógica propia; solo
 *   provee el router al árbol.
 *
 * @returns {JSX.Element} RouterProvider con el router configurado
 */
export default function App() {
  return <RouterProvider router={router} />
}

/* ═══════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — App
   ═══════════════════════════════════════════════════════════

   EXPLICACIÓN PARA HUMANO:
   App.jsx es la "tabla de contenidos" de la aplicación. Define qué pantalla
   se muestra para cada URL. Las pantallas dentro de Layout (location,
   security, history, motos) solo son accesibles si el usuario está autenticado
   Y tiene un dispositivo vinculado. La pantalla /onboarding está fuera para
   evitar un loop de redirección. Cualquier URL desconocida va al inicio.

   PSEUDOCÓDIGO:
   /login        → <LoginPage />
   /onboarding   → <OnboardingPage />
   /             → <Layout> → redirige a /location
   /location     → <Layout> + <LocationPage />
   /security     → <Layout> + <SecurityPage />
   /history      → <Layout> + <HistoryPage />
   /motos        → <Layout> + <MotosPage /> (pendiente)
   /*            → redirige a /

   DIAGRAMA MENTAL:
   Navegador → URL → Router → ¿está dentro de Layout? → sí: guardia auth/onboarding
                                                        → no: renderizar directo

   MEJORAS RECOMENDADAS:
   - Lazy loading: import('./pages/LocationPage') para reducir bundle inicial.
   - MotosPage: implementar y agregar a la ruta /motos.
   - Error boundary: <ErrorBoundary> alrededor de cada página para capturar crashes.

   DEUDA TÉCNICA:
   - MotosPage no implementada aún (ruta comentada).
   - No hay loader de autenticación al arranque (getMeApi() en loader de ruta).

   ═══════════════════════════════════════════════════════════ */
