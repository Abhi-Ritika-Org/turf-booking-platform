import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { BookingsList } from "@/components/TurfListing";
import { CommonPagination } from "@/components/CommonPagination";
import api from '@/lib/api';

interface TurfOwner {
  name: string;
  phone: string;
}

interface Turf {
  id?: string;
  thumbnail_url?: string;
  name?: string;
  location?: string;
  avg_rating?: number;
  total_reviews?: number;
  price_per_hour?: number;
  sports?: string[];
  amenities?: string[];
  owner?: TurfOwner;
}

const Index = () => {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [lastPageCount, setLastPageCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  const fetchTurfs = async (nextPage: number, nextLimit: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('api/turfs/turf-list', {
        offset: nextPage - 1,
        limit: nextLimit,
      });
      const turfList = response?.data?.data ?? [];
      const list = Array.isArray(turfList) ? turfList : [];
      setTurfs(list);
      setLastPageCount(list.length);

      const total_turfs = response?.data?.total;
      setTotalCount(total_turfs);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Please try again in a moment.');
      setTurfs([]);
      setLastPageCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTurfs(page, limit);
  }, [page, limit]);

  const handlePaginationChange = ({ page: nextPage, limit: nextLimit }: { page: number; limit: number }) => {
    if (nextLimit !== limit) {
      setLimit(nextLimit);
      setPage(1);
      return;
    }
    setPage(nextPage);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main>
        <HeroSection />

        {/* Turf Listing Section */}
        <section id="book" className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12 animate-fade-in">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
                Explore Premium Turfs
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Find the right venue by location, pricing, amenities, and sports options.
              </p>
            </div>

            <div className="max-w-7xl mx-auto animate-fade-in" style={{ animationDelay: "100ms" }}>
              <BookingsList turfs={turfs} isLoading={isLoading} error={error} />
              {!error && (
                <CommonPagination
                  page={page}
                  limit={limit}
                  totalCount={totalCount || 0}
                  onChange={handlePaginationChange}
                  limitOptions={[5, 10, 25, 50]}
                  label="Turfs"
                />
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-border">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm text-muted-foreground">
              © 2026 TurfBookingPlatform. Play your best game.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
