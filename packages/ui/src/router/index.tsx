import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import MainLayout from '../components/layout/MainLayout';
import LoadingScreen from '../components/common/LoadingScreen';
import ProtectedRoute from '../components/auth/ProtectedRoute';

// Lazy load pages
const LoginPage = lazy(() => import('../pages/Login'));
const DashboardPage = lazy(() => import('../pages/Dashboard'));
const AnalysisPage = lazy(() => import('../pages/Analysis'));
const PackageDetailPage = lazy(() => import('../pages/PackageDetail'));
const ReportConfigurationPage = lazy(() => import('../pages/ReportConfiguration'));
const ReportConfigurationListPage = lazy(() => import('../pages/ReportConfigurationList'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));

// Wrap lazy components with Suspense
const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<LoadingScreen />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(LoginPage),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: withSuspense(DashboardPage),
      },
      {
        path: 'analysis',
        element: withSuspense(AnalysisPage),
      },
      {
        path: 'analysis/:customerId',
        element: withSuspense(AnalysisPage),
      },
      {
        path: 'analysis/:customerId/:studyId',
        element: withSuspense(AnalysisPage),
      },
      {
        path: 'analysis/:customerId/:studyId/:packageName',
        element: withSuspense(PackageDetailPage),
      },
      {
        path: 'analysis/:customerId/:studyId/:packageName/:language',
        element: withSuspense(PackageDetailPage),
      },
      {
        path: 'analysis/:customerId/:studyId/:packageName/report',
        element: withSuspense(ReportConfigurationPage),
      },
      {
        path: 'analysis/:customerId/:studyId/:packageName/report/:configId',
        element: withSuspense(ReportConfigurationPage),
      },
      {
        path: 'analysis/:customerId/:studyId/:packageName/reports',
        element: withSuspense(ReportConfigurationListPage),
      },
      {
        path: '*',
        element: withSuspense(NotFoundPage),
      },
    ],
  },
]);