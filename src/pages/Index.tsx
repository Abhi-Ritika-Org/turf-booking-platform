import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { BookingForm } from "@/components/BookingForm";
import { BookingsList } from "@/components/BookingsList";
import api from '@/lib/api';

interface Booking {
  id: string;
  name: string;
  phone: string;
  date: string;
  time_slot: string;
  created_at: string;
  user_id?: string;
}

const Index = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookedSlots, setAllBookedSlots] = useState<{ date: string; time_slot: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBookings = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await api.get('/api/bookings', { params: { from: today } });
      const allBookings = res.data || [];
      setBookings(allBookings);
      setAllBookedSlots(allBookings.map((booking: any) => ({ date: booking.date, time_slot: booking.time_slot })));
    } catch (err) {
      // ignore for now
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main>
        <HeroSection />

        {/* Booking Section */}
        <section id="book" className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12 animate-fade-in">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
                Reserve Your Slot
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Pick your date and time. We'll handle the rest.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
                <BookingForm
                  onBookingSuccess={fetchBookings}
                  bookedSlots={allBookedSlots}
                />
              </div>

              <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
                <BookingsList bookings={bookings} isLoading={isLoading} />
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-border">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm text-muted-foreground">
              © 2026 TurfBook. Play your best game.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
