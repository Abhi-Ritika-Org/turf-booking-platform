import { Link, useNavigate } from "react-router-dom";
import { UserPlus, Mail, Lock, User, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import api from '@/lib/api';
import { useToast } from "@/hooks/use-toast";
import { useFormik } from 'formik';
import { signupValidationSchema } from '@/validations';
import { useDispatch } from 'react-redux';
import { signupUser } from '@/store/authSlice';
import type { AppDispatch } from '@/store';

const Signup = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  // Helper to normalize error payloads into a readable string for toasts
  const formatError = (err: any) => {
    if (!err) return 'Unknown error'
    if (typeof err === 'string') return err
    if (err.message) return String(err.message)
    if (err.error) return String(err.error)
    if (err.detail) return String(err.detail)
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }

  const formik = useFormik({
    initialValues: {
      name: '',
      mobile: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validationSchema: signupValidationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const signupPayload = {
          email: values.email.trim(),
          mobile: values.mobile.trim(),
          password: values.password,
          full_name: values.name.trim(),
        };

        const resultAction = await dispatch(signupUser(signupPayload));

        // Prefer payload from fulfilled action
        const payload = (resultAction as any).payload;

        if (signupUser.fulfilled.match(resultAction)) {
          const status = payload?.status ?? payload?.code ?? 200;
          const message = payload?.message || payload?.detail || 'Account Created!';

          if (status === 200 || status === 201) {
            toast({ title: 'Success', description: String(message) });
            navigate('/login');
          } else {
            const err = payload?.error || message || 'Signup failed'
            toast({ title: 'Signup Failed', description: formatError(err), variant: 'destructive' })
          }
        } else {
          // Rejected action — show payload or error message
          const errMsg = (resultAction as any).payload || (resultAction as any).error || 'Signup failed'
          toast({ title: 'Signup Failed', description: formatError(errMsg), variant: 'destructive' })
        }
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-turf-primary/5 via-background to-turf-accent/5 p-4">
      <Card className="w-full max-w-md turf-card-shadow">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto w-12 h-12 rounded-full turf-gradient flex items-center justify-center mb-2">
            <UserPlus className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-display">Create Account</CardTitle>
          <CardDescription>Join TurfBook and start booking</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Full Name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Enter your full name"
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
              {formik.touched.name && formik.errors.name ? (
                <p className="text-sm font-medium text-destructive">{String(formik.errors.name)}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="you@yourdomain.com"
                autoComplete="email"
                aria-describedby="email-help"
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile" className="text-sm font-medium flex items-center gap-2">
                 <Phone className="h-4 w-4 text-primary" />
                Mobile
              </Label>
              <Input
                id="mobile"
                name="mobile"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-describedby="mobile-help"
                value={formik.values.mobile}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="+91 9876543210 (include + and country code)"
                pattern="^\+[0-9]{7,15}$"
                title="Use international format starting with + and country code, e.g. +1234567890"
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
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
                placeholder="Create a password"
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
              {formik.touched.password && formik.errors.password ? (
                <p className="text-sm font-medium text-destructive">{String(formik.errors.password)}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formik.values.confirmPassword}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Confirm your password"
                className="transition-all focus:ring-2 focus:ring-primary/20"
              />
              {formik.touched.confirmPassword && formik.errors.confirmPassword ? (
                <p className="text-sm font-medium text-destructive">{String(formik.errors.confirmPassword)}</p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={formik.isSubmitting}
              className="w-full turf-gradient text-primary-foreground font-semibold py-6 text-base transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
            >
              {formik.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating account...
                </>
              ) : "Sign Up"}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;
