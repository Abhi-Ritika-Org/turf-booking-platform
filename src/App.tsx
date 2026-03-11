import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { cancelAllRequests, tryRefreshSession } from '@/lib/api';
import type { RootState } from '@/store';
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";

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
  const location = useLocation();
  useEffect(() => {
    cancelAllRequests();
  }, [location]);

  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      {/* <Route path="/app" element={<Navigate to="/" replace />} /> */}
      {/* Show Login as the initial page */}
      {/* <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} /> */}
      {/* Main app after login */}
      {/* <Route path="/app" element={<Index />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
