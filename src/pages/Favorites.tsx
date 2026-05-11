import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type FavoriteItem = {
  turf_id?: string;
  turf_name?: string;
};

export default function Favorites() {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/user/favorites');
        const rows = Array.isArray(res.data?.data) ? (res.data.data as FavoriteItem[]) : [];
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
            <h1 className="text-3xl font-bold tracking-tight">Favorite Turfs</h1>
            <p className="text-foreground/60 mt-2">Your favorite turf grounds for quick access</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-destructive" />
                Your Favorites
              </CardTitle>
              <CardDescription>Save turfs to quickly book them later</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-foreground/60 py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading favorites...
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-foreground/60">No favorites yet. Browse turfs and add them to your favorites!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={item.turf_id || idx} className="rounded-xl bg-secondary/40 p-4">
                      <p className="font-medium text-foreground">{item.turf_name || 'Unnamed Turf'}</p>
                      <p className="text-xs text-foreground/60 mt-1">ID: {item.turf_id || '-'}</p>
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
