import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function SettingsPrivacy() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Privacy Settings</h1>
            <p className="text-foreground/60 mt-2">Manage your privacy preferences</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Privacy & Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-visible">Make profile visible to others</Label>
                <Switch id="profile-visible" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-bookings">Show booking history</Label>
                <Switch id="show-bookings" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="allow-messages">Allow messages from other users</Label>
                <Switch id="allow-messages" defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
