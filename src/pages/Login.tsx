import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import api from '@/lib/api';
import { useToast } from "@/hooks/use-toast";
import { useDispatch, useSelector } from 'react-redux';
import { setToken, loginUser } from '@/store/authSlice';
import type { RootState, AppDispatch } from '@/store';
import { useFormik } from 'formik';
import { loginValidationSchema } from '@/validations';

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const authStatus = useSelector((state: RootState) => state.auth.status);

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: loginValidationSchema,
    onSubmit: async (values) => {
      setIsLoading(true);
      try {
        const resultAction = await dispatch(loginUser({ email: values.email.trim(), password: values.password }));
        if (loginUser.fulfilled.match(resultAction)) {
          const token = resultAction.payload?.access_token;
          if (token) dispatch(setToken(token));
          toast({ title: 'Welcome back!', description: "You've successfully logged in." });
          navigate('/app');
        } else {
          const errMsg = (resultAction.payload as any) || (resultAction as any).error?.message || 'Login failed';
          toast({ title: 'Login Failed', description: String(errMsg), variant: 'destructive' });
        }
      } finally {
        setIsLoading(false);
      }
    }
  });

  return (
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
  );
};

export default Login;
