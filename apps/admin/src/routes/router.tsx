import { Title } from '@mantine/core'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '../components/AppLayout'
import { LoginPage } from '../pages/LoginPage'
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
    children: [{ index: true, element: <Title order={2}>Painel</Title> }],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
