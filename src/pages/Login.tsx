import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, Loader2, Smartphone, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from '@/lib/api';
import { useToast } from "@/hooks/use-toast";
import { useDispatch, useSelector } from 'react-redux';
import { setToken, loginUser } from '@/store/authSlice';
import type { RootState, AppDispatch } from '@/store';
import { useFormik } from 'formik';
import { loginValidationSchema } from '@/validations';
import { socketService } from '@/lib/socketService';

interface ConflictData {
  device_type: string;
  os: string;
  browser: string;
  ip: string;
  login_time: string;
}

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [currentFormValues, setCurrentFormValues] = useState({ email: '', password: '' });
  const [isForceLoading, setIsForceLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  // Helper to normalize error payloads into a readable string for toasts
  const formatError = (err: any) => {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    if (err.message) return String(err.message);
    if (err.error) return String(err.error);
    if (err.detail) return String(err.detail);
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  };

  /**
   * Handle successful login
   * - Store token in Redux
   * - Connect Socket.IO
   * - Navigate to app
   */
  const handleLoginSuccess = async (token: string) => {
    dispatch(setToken(token));
    
    try {
      // Register FORCE_LOGOUT callback
      socketService.onForceLogout(() => {
        // Clear Redux state
        dispatch(setToken(null));
        
        toast({
          title: 'Session Ended',
          description: 'You were logged out because you logged in on another device',
          variant: 'destructive',
        });
        navigate('/login');
      });
      
      // Connect socket with token from Redux
      await socketService.connect(token);
      toast({ title: 'Welcome back!', description: 'Login successful!', variant: 'success' });
      navigate('/app');
    } catch (socketError) {
      console.warn('Socket connection failed (non-critical):', socketError);
      // Allow login to proceed even if socket connection fails
      toast({ title: 'Welcome back!', description: 'Login successful!', variant: 'success' });
      navigate('/app');
    }
  };

  /**
   * Perform login request
   */
  const performLogin = async (email: string, password: string, force: boolean = false) => {
    try {
      const response = await api.post('/api/auth/user-login', {
        email: email.trim(),
        password,
        force,
      });

      const payload = response.data;
      const status = payload?.status;

      // Case 1 or Case 3B: Successful login
      if (status === 200) {
        const token = payload?.access_token;
        if (token) {
          await handleLoginSuccess(token);
        }
      }
      // Case 2: Conflict detected
      else if (status === 'conflict') {
        setConflictData(payload?.active_session || null);
        setCurrentFormValues({ email, password });
        setShowConflictDialog(true);
        toast({
          title: 'Account Already Logged In',
          description: 'This account is currently logged in on another device',
          variant: 'destructive',
        });
      }
      // Other errors
      else {
        const err = payload?.error || 'Login failed';
        toast({ title: 'Login Failed', description: formatError(err), variant: 'destructive' });
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || formatError(error);
      toast({ title: 'Login Failed', description: errMsg, variant: 'destructive' });
    }
  };

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: loginValidationSchema,
    onSubmit: async (values) => {
      setIsLoading(true);
      try {
        await performLogin(values.email, values.password, false);
      } finally {
        setIsLoading(false);
      }
    }
  });

  /**
   * Handle "Login Here" action - force login on this device
   */
  const handleForceLogin = async () => {
    setIsForceLoading(true);
    try {
      await performLogin(currentFormValues.email, currentFormValues.password, true);
      setShowConflictDialog(false);
    } finally {
      setIsForceLoading(false);
    }
  };

  /**
   * Handle "Cancel" action
   */
  const handleCancel = () => {
    setShowConflictDialog(false);
    setConflictData(null);
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Smartphone className="h-4 w-4" />;
      default:
        return <MonitorSmartphone className="h-4 w-4" />;
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-turf-primary/5 via-background to-turf-accent/5 p-4">
        <Card className="w-full max-w-md turf-card-shadow">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-12 h-12 rounded-full turf-gradient flex items-center justify-center mb-2">
              <LogIn className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-display">Welcome Back</CardTitle>
            <CardDescription>Sign in to your TurfBook account</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={formik.handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={formik.values.email}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="you@yourdomain.com"
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  autoComplete="email"
                />
                {formik.touched.email && formik.errors.email ? (
                  <p className="text-sm font-medium text-destructive">{String(formik.errors.email)}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formik.values.password}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  placeholder="Enter your password"
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  autoComplete="current-password"
                />
                {formik.touched.password && formik.errors.password ? (
                  <p className="text-sm font-medium text-destructive">{String(formik.errors.password)}</p>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={isLoading || formik.isSubmitting}
                className="w-full turf-gradient text-primary-foreground font-semibold py-6 text-base transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link to="/signup" className="text-primary hover:underline font-medium">
                  Sign up
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Conflict Dialog */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Account Already Logged In</DialogTitle>
            <DialogDescription>
              This account is currently active on another device. What would you like to do?
            </DialogDescription>
          </DialogHeader>

          {conflictData && (
            <div className="space-y-4 py-4">
              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertDescription className="text-yellow-900">
                  Your account is logged in on another device. Only one device can be logged in at a time.
                </AlertDescription>
              </Alert>

              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex items-start gap-3">
                  {getDeviceIcon(conflictData.device_type)}
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium">
                      {conflictData.device_type?.charAt(0).toUpperCase() + conflictData.device_type?.slice(1) || 'Device'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conflictData.browser || 'Unknown Browser'} on {conflictData.os || 'Unknown OS'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">IP Address:</span> {conflictData.ip || 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Logged in:</span>{' '}
                    {conflictData.login_time
                      ? new Date(conflictData.login_time).toLocaleString()
                      : 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancel} disabled={isForceLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleForceLogin}
              disabled={isForceLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isForceLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login Here'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Login;
