import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function SettingsNotifications() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
            <p className="text-foreground/60 mt-2">Control how you receive notifications</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="booking-notifications">Booking confirmations</Label>
                <Switch id="booking-notifications" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="offers">Special offers and deals</Label>
                <Switch id="offers" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reminders">Booking reminders</Label>
                <Switch id="reminders" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="promotional">Promotional emails</Label>
                <Switch id="promotional" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
