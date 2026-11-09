import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth, type Role } from './lib/auth';
import { AppLayout, homeFor } from './components/AppLayout';
import { Forbidden } from './components/common';
import { LoginPage } from './pages/LoginPage';
import { ForcedPasswordChange } from './components/ChangePassword';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SpacesPage = lazy(() => import('./pages/SpacesPage'));
const SpaceDetailPage = lazy(() => import('./pages/SpaceDetailPage'));
const RowsPage = lazy(() => import('./pages/RowsPage'));
const CamerasPage = lazy(() => import('./pages/CamerasPage'));
const CameraDetailPage = lazy(() => import('./pages/CameraDetailPage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const PaymentDetailPage = lazy(() => import('./pages/PaymentDetailPage'));
const CashierPage = lazy(() => import('./pages/CashierPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AlertDetailPage = lazy(() => import('./pages/AlertDetailPage'));
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage'));
const ExemptionsPage = lazy(() => import('./pages/ExemptionsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const PublicQrPage = lazy(() => import('./pages/PublicQrPage'));
const ReceiptPrintPage = lazy(() => import('./pages/ReceiptPrintPage'));

const MGMT: Role[] = ['CHIEF', 'MARKET_ADMIN'];
const ALL: Role[] = ['CHIEF', 'MARKET_ADMIN', 'CASHIER'];

function Loading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spin />
    </div>
  );
}

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me } = useAuth();
  if (!me) return null;
  // UI guard only for navigation; the API enforces every permission independently.
  if (!roles.includes(me.user.role)) return <Forbidden />;
  return <>{children}</>;
}

/** Warm up page chunks in the background so navigating never waits on a download. */
function prefetchPages() {
  const loaders = [
    () => import('./pages/DashboardPage'), () => import('./pages/SpacesPage'), () => import('./pages/SpaceDetailPage'),
    () => import('./pages/RowsPage'), () => import('./pages/CamerasPage'), () => import('./pages/CameraDetailPage'),
    () => import('./pages/PaymentsPage'), () => import('./pages/PaymentDetailPage'), () => import('./pages/CashierPage'),
    () => import('./pages/AlertsPage'), () => import('./pages/AlertDetailPage'), () => import('./pages/ComplaintsPage'),
    () => import('./pages/ExemptionsPage'), () => import('./pages/ReportsPage'), () => import('./pages/UsersPage'),
    () => import('./pages/AuditPage'), () => import('./pages/SettingsPage'), () => import('./pages/CollectionsPage'),
  ];
  const run = () => loaders.forEach((l) => l().catch(() => undefined));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  const loggedIn = !!me;
  useEffect(() => {
    if (loggedIn) prefetchPages();
  }, [loggedIn]);
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  // The API refuses everything else until the initial password is replaced.
  if (me.user.mustChangePassword) return <ForcedPasswordChange />;
  return <>{children}</>;
}

function Home() {
  const { me } = useAuth();
  return <Navigate to={me ? homeFor(me.user.role) : '/login'} replace />;
}

export function App() {
  const g = (roles: Role[], el: ReactNode) => <Guard roles={roles}>{el}</Guard>;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/qr/:publicToken" element={<PublicQrPage />} />
        <Route path="/qr/receipt/:receiptToken" element={<PublicQrPage />} />
        <Route
          path="/receipts/:paymentId/print"
          element={
            <RequireAuth>
              <ReceiptPrintPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="/dashboard" element={g(MGMT, <DashboardPage />)} />
          <Route path="/spaces" element={g(ALL, <SpacesPage />)} />
          <Route path="/spaces/:id" element={g(ALL, <SpaceDetailPage />)} />
          <Route path="/rows" element={g(MGMT, <RowsPage />)} />
          <Route path="/cameras" element={g(MGMT, <CamerasPage />)} />
          <Route path="/cameras/:id" element={g(MGMT, <CameraDetailPage />)} />
          <Route path="/payments" element={g(ALL, <PaymentsPage />)} />
          <Route path="/payments/:id" element={g(ALL, <PaymentDetailPage />)} />
          <Route path="/cashier" element={g(['CASHIER'], <CashierPage />)} />
          <Route path="/collections" element={g(MGMT, <CollectionsPage />)} />
          <Route path="/alerts" element={g(MGMT, <AlertsPage />)} />
          <Route path="/alerts/:id" element={g(MGMT, <AlertDetailPage />)} />
          <Route path="/complaints" element={g(MGMT, <ComplaintsPage />)} />
          <Route path="/exemptions" element={g(MGMT, <ExemptionsPage />)} />
          <Route path="/reports" element={g(['CHIEF'], <ReportsPage />)} />
          <Route path="/users" element={g(['CHIEF'], <UsersPage />)} />
          <Route path="/audit" element={g(['CHIEF'], <AuditPage />)} />
          <Route path="/settings" element={g(MGMT, <SettingsPage />)} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
