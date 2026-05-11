import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type NotificationItem = {
  id?: string;
  title?: string;
  message?: string;
  created_at?: string;
};

export default function Notifications() {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/user/notifications');
        const rows = Array.isArray(res.data?.data) ? (res.data.data as NotificationItem[]) : [];
        setItems(rows);
      } catch {
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-foreground/60 mt-2">Stay updated with your bookings and offers</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Your Notifications
              </CardTitle>
              <CardDescription>New notifications will appear here</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-foreground/60 py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notifications...
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-foreground/60">No new notifications</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={item.id || idx} className="rounded-xl bg-secondary/40 p-4">
                      <p className="font-medium text-foreground">{item.title || 'Notification'}</p>
                      <p className="text-sm text-foreground/70 mt-1">{item.message || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
