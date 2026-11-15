import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '../components/AppLayout'
import { LoginPage } from '../pages/LoginPage'
import { OrderDetailPage } from '../pages/OrderDetailPage'
import { OrdersPage } from '../pages/OrdersPage'
import { ProductFormPage } from '../pages/ProductFormPage'
import { ProductsPage } from '../pages/ProductsPage'
import { RequireAdmin } from './RequireAdmin'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAdmin>
        <AppLayout />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: <Navigate to="/produtos" replace /> },
      { path: 'produtos', element: <ProductsPage /> },
      { path: 'produtos/novo', element: <ProductFormPage /> },
      { path: 'produtos/:id', element: <ProductFormPage /> },
      { path: 'pedidos', element: <OrdersPage /> },
      { path: 'pedidos/:id', element: <OrderDetailPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
