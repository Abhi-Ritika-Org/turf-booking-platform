import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { tryRefreshSession } from '@/lib/api';
import { clearToken } from '@/store/authSlice';
import { clearUserData } from '@/store/userDataSlice';
import type { AppDispatch, RootState } from '@/store';
import Index from "./pages/Index";
import Login from "./pages/Login";
import Profile from "./pages/Profile.tsx";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import BookingHistory from "./pages/BookingHistory";
import Notifications from "./pages/Notifications";
import Favorites from "./pages/Favorites";
import WalletPage from "./pages/Wallet";
import Help from "./pages/Help";
import About from "./pages/About";
import SettingsProfile from "./pages/Settings/Profile";
import SettingsPrivacy from "./pages/Settings/Privacy";
import SettingsNotifications from "./pages/Settings/Notifications";
import SettingsSecurity from "./pages/Settings/Security";
import {
  getActiveLeader,
  hasActiveLeaderFromAnotherTab,
  isCurrentTabLeader,
  releaseSessionLeadership,
  startSessionHeartbeat,
  stopSessionHeartbeat,
} from '@/lib/authSession';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [isChecking, setIsChecking] = useState(!token);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(token));

  useEffect(() => {
    if (token) {
      setIsAuthenticated(true);
      setIsChecking(false);
      return;
    }

    if (hasActiveLeaderFromAnotherTab()) {
      setIsAuthenticated(false);
      setIsChecking(false);
      return;
    }

    let isMounted = true;

    const check = async () => {
      const ok = await tryRefreshSession();
      if (!isMounted) return;
      setIsAuthenticated(ok);
      setIsChecking(false);
    };

    check();

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (isChecking) return null;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }: { children: JSX.Element }) => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [isChecking, setIsChecking] = useState(!token);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(token));

  useEffect(() => {
    if (token) {
      setIsAuthenticated(true);
      setIsChecking(false);
      return;
    }

    if (hasActiveLeaderFromAnotherTab()) {
      setIsAuthenticated(false);
      setIsChecking(false);
      return;
    }

    let isMounted = true;

    const check = async () => {
      const ok = await tryRefreshSession();
      if (!isMounted) return;
      setIsAuthenticated(ok);
      setIsChecking(false);
    };

    check();

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (isChecking) return null;
  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

const RouterWithCancel = () => {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'auth:session-leader') return;

      const leader = getActiveLeader();
      if (leader && leader.tabId === sessionStorage.getItem('auth:tab-id')) {
        return;
      }

      dispatch(clearToken());
      dispatch(clearUserData());
      window.location.href = '/login';
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [dispatch]);

  useEffect(() => {
    if (isCurrentTabLeader()) {
      startSessionHeartbeat();
    }

    const handleBeforeUnload = () => {
      releaseSessionLeadership();
      stopSessionHeartbeat();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopSessionHeartbeat();
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/bookings" element={<ProtectedRoute><BookingHistory /></ProtectedRoute>} />
      <Route path="/booking-history" element={<ProtectedRoute><BookingHistory /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
      <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
      <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
      <Route path="/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
      <Route path="/settings/profile" element={<ProtectedRoute><SettingsProfile /></ProtectedRoute>} />
      <Route path="/settings/privacy" element={<ProtectedRoute><SettingsPrivacy /></ProtectedRoute>} />
      <Route path="/settings/notifications" element={<ProtectedRoute><SettingsNotifications /></ProtectedRoute>} />
      <Route path="/settings/security" element={<ProtectedRoute><SettingsSecurity /></ProtectedRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouterWithCancel />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
