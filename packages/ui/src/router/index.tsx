import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import MainLayout from '../components/layout/MainLayout';
import LoadingScreen from '../components/common/LoadingScreen';

// Lazy load pages
const DashboardPage = lazy(() => import('../pages/Dashboard'));
const AnalysisPage = lazy(() => import('../pages/Analysis'));
const PackageDetailPage = lazy(() => import('../pages/PackageDetail'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));

// Wrap lazy components with Suspense
const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<LoadingScreen />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
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
        path: '*',
        element: withSuspense(NotFoundPage),
      },
    ],
  },
]);