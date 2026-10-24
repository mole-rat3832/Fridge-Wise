import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell, Logo, OfflineBanner } from './components/AppShell';
import { PublicLayout } from './components/PublicLayout';
import { TourProvider } from './components/Tour';
import { Spinner } from './components/ui';
import { isConfigured } from './lib/env';
import { watchSystemTheme } from './lib/theme';
import { ForgotPassword, ResetPassword, SignIn, SignUp } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Home } from './pages/Home';
import { AuthProvider, useAuth } from './state/auth';
import { ItemsProvider } from './state/items';
import { KitchenProvider } from './state/kitchen';
import { ToastProvider } from './state/toast';

// Pages other than the dashboard and sign-in are split into their own chunks (Stats pulls in the chart library).
const AddItem = lazy(() => import('./pages/AddItem').then((m) => ({ default: m.AddItem })));
const Guide = lazy(() => import('./pages/Guide').then((m) => ({ default: m.Guide })));
const PrivacyPolicy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./pages/Legal').then((m) => ({ default: m.TermsOfService })));
const Eula = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Eula })));
const Households = lazy(() => import('./pages/Households').then((m) => ({ default: m.Households })));
const HouseholdPage = lazy(() => import('./pages/Households').then((m) => ({ default: m.HouseholdPage })));
const ItemDetail = lazy(() => import('./pages/ItemDetail').then((m) => ({ default: m.ItemDetail })));
const Onboarding = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.Onboarding })));
const Recipes = lazy(() => import('./pages/Recipes').then((m) => ({ default: m.Recipes })));
const ScanPage = lazy(() => import('./pages/Scan').then((m) => ({ default: m.ScanPage })));
const ScanReview = lazy(() => import('./pages/ScanReview').then((m) => ({ default: m.ScanReview })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const ShoppingCheck = lazy(() => import('./pages/ShoppingCheck').then((m) => ({ default: m.ShoppingCheck })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label="Loading FridgeWise" size={32} />
    </div>
  );
}

function SetupMissing() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <Logo size={44} />
      <h1 className="mt-6 text-2xl font-bold">FridgeWise needs its configuration</h1>
      <p className="mt-2 text-fg-2">
        Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>, then restart the dev
        server (or set them as environment variables in Netlify and redeploy).
      </p>
    </div>
  );
}

/** Signed-in area: needs a session and a finished onboarding. */
function Protected({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (!profile) return <FullPageSpinner />;
  if (!profile.onboarded_at) return <Navigate to="/onboarding" replace />;
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        }
      >
        {children}
      </Suspense>
    </AppShell>
  );
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to="/" replace />;
  return (
    <>
      <OfflineBanner />
      {children}
    </>
  );
}

/** `/`: the homepage for visitors, the kitchen dashboard once signed in. */
function RootRoute() {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!session) {
    return (
      <PublicLayout>
        <Home />
      </PublicLayout>
    );
  }
  return (
    <Protected>
      <Dashboard />
    </Protected>
  );
}

/** Pages anyone can open (the guide): inside the app when signed in, with the public header otherwise. */
function PublicOrApp({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading || (session && !profile)) return <FullPageSpinner />;
  if (session && profile?.onboarded_at) return <Protected>{children}</Protected>;
  return (
    <PublicLayout>
      <div className="px-4 py-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-10">
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Spinner size={28} />
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </PublicLayout>
  );
}

/** Legal pages: always public, with the site header and footer. */
function LegalRoute({ children }: { children: ReactNode }) {
  return (
    <PublicLayout>
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        }
      >
        {children}
      </Suspense>
    </PublicLayout>
  );
}

function OnboardingRoute() {
  const { session, profile, loading } = useAuth();
  if (loading || (session && !profile)) return <FullPageSpinner />;
  if (!session) return <Navigate to="/signin" replace />;
  if (profile?.onboarded_at) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Onboarding />
    </Suspense>
  );
}

function ResetRoute() {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return <ResetPassword hasSession={Boolean(session)} />;
}

function NotFound() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="btn btn-primary">
        Back to your kitchen
      </Link>
    </div>
  );
}

function AppRoutes() {
  const p = (el: ReactNode) => <Protected>{el}</Protected>;
  return (
    <Routes>
      <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetRoute />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/" element={<RootRoute />} />
      <Route
        path="/about"
        element={
          <PublicLayout>
            <Home />
          </PublicLayout>
        }
      />
      <Route path="/guide" element={<PublicOrApp><Guide /></PublicOrApp>} />
      <Route path="/privacy" element={<LegalRoute><PrivacyPolicy /></LegalRoute>} />
      <Route path="/terms" element={<LegalRoute><TermsOfService /></LegalRoute>} />
      <Route path="/eula" element={<LegalRoute><Eula /></LegalRoute>} />
      <Route path="/how-it-works" element={<Navigate to="/guide" replace />} />
      <Route path="/demo" element={<Navigate to="/guide" replace />} />
      <Route path="/scan" element={p(<ScanPage />)} />
      <Route path="/scan/:id" element={p(<ScanReview />)} />
      <Route path="/add" element={p(<AddItem />)} />
      <Route path="/item/:id" element={p(<ItemDetail />)} />
      <Route path="/check" element={p(<ShoppingCheck />)} />
      <Route path="/recipes" element={p(<Recipes />)} />
      <Route path="/stats" element={p(<Stats />)} />
      <Route path="/settings" element={p(<Settings />)} />
      <Route path="/households" element={p(<Households />)} />
      <Route path="/households/:id" element={p(<HouseholdPage />)} />
      <Route path="*" element={<PublicOrApp><NotFound /></PublicOrApp>} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => watchSystemTheme(), []);
  if (!isConfigured) return <SetupMissing />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <KitchenProvider>
            <ItemsProvider>
              <TourProvider>
                <AppRoutes />
              </TourProvider>
            </ItemsProvider>
          </KitchenProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
