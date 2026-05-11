import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';

type Booking = {
  id: string;
  name: string;
  phone: string;
  date: string;
  time_slot: string;
  created_at: string;
};

export default function BookingHistory() {
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<Booking[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/bookings/list');
        const rows = Array.isArray(res.data) ? (res.data as Booking[]) : [];
        setHistory(rows);
      } catch {
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const pastBookings = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return history
      .filter((b) => String(b.date || '') < today)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [history]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Booking History</h1>
            <p className="text-foreground/60 mt-2">View all your past bookings and transactions</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Past Bookings</CardTitle>
              <CardDescription>Your booking history will appear here</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-foreground/60 py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading booking history...
                </div>
              ) : pastBookings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-foreground/60">No past bookings yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastBookings.map((booking) => (
                    <div key={booking.id} className="rounded-xl bg-secondary/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{booking.name}</p>
                          <p className="text-sm text-foreground/60">{booking.phone}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{booking.time_slot}</p>
                          <p className="text-xs text-foreground/60">{booking.date}</p>
                        </div>
                      </div>
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
