import { Calendar, Clock, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Booking {
  id: string;
  name: string;
  phone: string;
  date: string;
  time_slot: string;
  created_at: string;
}

interface BookingsListProps {
  bookings: Booking[];
  isLoading: boolean;
}

export const BookingsList = ({ bookings, isLoading }: BookingsListProps) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const todayBookings = bookings.filter((b) => {
    const today = new Date().toISOString().split("T")[0];
    return b.date === today;
  });

  const upcomingBookings = bookings.filter((b) => {
    const today = new Date().toISOString().split("T")[0];
    return b.date > today;
  });

  if (isLoading) {
    return (
      <Card className="turf-card-shadow">
        <CardHeader>
          <CardTitle className="font-display">My Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="turf-card-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <Calendar className="h-4 w-4 text-primary" />
            </span>
            My Bookings - Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayBookings.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No bookings for today
            </p>
          ) : (
            <div className="space-y-3">
              {todayBookings.map((booking, index) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="turf-gradient rounded-full p-2">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {booking.name}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {booking.time_slot}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {upcomingBookings.length > 0 && (
        <Card className="turf-card-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-turf-accent/20">
                <Calendar className="h-4 w-4 text-turf-accent" />
              </span>
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingBookings.slice(0, 5).map((booking, index) => (
                <div
                  key={booking.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="text-center min-w-[60px]">
                    <p className="text-xs text-muted-foreground uppercase">
                      {formatDate(booking.date).split(" ")[0]}
                    </p>
                    <p className="text-lg font-bold text-primary">
                      {formatDate(booking.date).split(" ")[2]}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {booking.name}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {booking.time_slot}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
