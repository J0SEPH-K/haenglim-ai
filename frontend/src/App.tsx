import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ChatView from './components/chat/ChatView';
import ImageView from './components/image/ImageView';
import GroupConversationView from './components/group/GroupConversationView';
import SettingsPage from './components/SettingsPage';
import AdminLayout from './components/admin/AdminLayout';
import DashboardPage from './components/admin/DashboardPage';
import UsersPage from './components/admin/UsersPage';
import GroupsPage from './components/admin/GroupsPage';
import ProvidersPage from './components/admin/ProvidersPage';
import IPAllowlistPage from './components/admin/IPAllowlistPage';

export default function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Main app */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/chat" element={<ChatView />} />
          <Route path="/chat/:id" element={<ChatView />} />
          <Route path="/image" element={<ImageView />} />
          <Route path="/image/:id" element={<ImageView />} />
          <Route path="/group/:id" element={<GroupConversationView />} />
        </Route>

        {/* Settings (any authenticated user) — uses its own chrome */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        {/* Admin */}
        <Route
          element={
            <ProtectedRoute adminOnly>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/groups" element={<GroupsPage />} />
          <Route path="/admin/providers" element={<ProvidersPage />} />
          <Route path="/admin/ip-allowlist" element={<IPAllowlistPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
