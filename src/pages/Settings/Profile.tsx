import { FormEvent, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { AppDispatch, RootState } from '@/store';
import { setUserData } from '@/store/userDataSlice';
import { setUserName } from '@/store/authSlice';

export default function SettingsProfile() {
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const cachedUser = useSelector((state: RootState) => state.userData as Record<string, unknown> | null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/auth/current-user-data');
        const data = (res.data || {}) as Record<string, unknown>;

        setFullName(String(data.full_name || ''));
        setEmail(String(data.email || ''));
        setPhone(String(data.mobile || ''));
        dispatch(setUserData(data));
      } catch {
        const fallback = cachedUser || {};
        setFullName(String(fallback.full_name || ''));
        setEmail(String(fallback.email || ''));
        setPhone(String(fallback.mobile || ''));
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const payload = {
      full_name: fullName.trim(),
      mobile: phone.trim(),
    };

    setIsSaving(true);
    try {
      const res = await api.put('/api/auth/current-user-data', payload);
      const latest = (res.data?.data || {
        full_name: payload.full_name,
        email,
        mobile: payload.mobile,
      }) as Record<string, unknown>;

      dispatch(setUserData(latest));
      dispatch(setUserName(String(latest.full_name || payload.full_name || 'User')));

      toast({
        title: 'Profile Updated',
        description: 'Your profile changes were saved successfully.',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Unable to save profile changes.';
      toast({
        title: 'Update Failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
            <p className="text-foreground/60 mt-2">Update your personal information</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading || isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="+91 XXXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isLoading || isSaving}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSaving || isLoading}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
