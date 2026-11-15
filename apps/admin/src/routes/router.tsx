import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '../components/AppLayout'
import { CategoriesPage } from '../pages/CategoriesPage'
import { HandoffPage } from '../pages/HandoffPage'
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
      { path: 'categorias', element: <CategoriesPage /> },
      { path: 'pedidos', element: <OrdersPage /> },
      { path: 'pedidos/:id', element: <OrderDetailPage /> },
      { path: 'atendimento', element: <HandoffPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], {
  // No GitHub Pages o painel fica em /<repositório>/ (`vite build --base`).
  basename: import.meta.env.BASE_URL,
})
