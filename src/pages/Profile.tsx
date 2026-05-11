import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, History, Loader2, Phone, RotateCcw, UserCircle2, XCircle } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import { setUserData as setUserDataStore } from "@/store/userDataSlice";
import type { AppDispatch, RootState } from "@/store";

const TIME_SLOTS = [
  "06:00 AM - 07:00 AM",
  "07:00 AM - 08:00 AM",
  "08:00 AM - 09:00 AM",
  "09:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "04:00 PM - 05:00 PM",
  "05:00 PM - 06:00 PM",
  "06:00 PM - 07:00 PM",
  "07:00 PM - 08:00 PM",
  "08:00 PM - 09:00 PM",
];

type Booking = {
  id: string;
  name: string;
  phone: string;
  date: string;
  time_slot: string;
  created_at: string;
};

type UserData = {
  full_name?: string;
  email?: string;
  mobile?: string;
};

const formatDate = (rawDate: string) => {
  const parsed = new Date(`${rawDate}T00:00:00`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (rawDateTime?: string | null) => {
  if (!rawDateTime) return "-";
  const parsed = new Date(rawDateTime);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getBookingStartDateTime = (date: string, timeSlot: string) => {
  const startRaw = String(timeSlot || "").split("-")[0]?.trim();
  if (!startRaw) return null;

  const parts = startRaw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!parts) return null;

  let hour = parseInt(parts[1], 10);
  const minute = parseInt(parts[2], 10);
  const meridiem = parts[3].toUpperCase();

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  parsedDate.setHours(hour, minute, 0, 0);
  return parsedDate;
};

const BookingRow = ({
  booking,
  allowActions,
  onCancel,
  onReschedule,
  isActing,
}: {
  booking: Booking;
  allowActions?: boolean;
  onCancel?: (booking: Booking) => void;
  onReschedule?: (booking: Booking) => void;
  isActing?: boolean;
}) => {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-secondary/40 p-4">
      <div className="space-y-2">
        <p className="font-medium text-foreground">{booking.name}</p>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Phone className="h-3.5 w-3.5" />
          {booking.phone}
        </p>
      </div>
      <div className="text-right space-y-1">
        <p className="text-sm font-semibold text-foreground flex items-center justify-end gap-1">
          <Clock className="h-3.5 w-3.5" />
          {booking.time_slot}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(booking.date)}</p>

        {allowActions && (
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isActing}
              onClick={() => onReschedule?.(booking)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reschedule
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isActing}
              onClick={() => onCancel?.(booking)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const Profile = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const cachedUserData = useSelector((state: RootState) => state.userData as UserData | null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [userData, setUserData] = useState<UserData | null>(cachedUserData);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const [bookingsRes, userRes] = await Promise.allSettled([
        api.get("/api/bookings/list"),
        api.get("/api/auth/current-user-data"),
      ]);

      if (bookingsRes.status === "fulfilled") {
        const fetchedBookings = Array.isArray(bookingsRes.value.data) ? bookingsRes.value.data : [];
        setBookings(fetchedBookings as Booking[]);
      } else {
        setBookings([]);
      }

      if (userRes.status === "fulfilled") {
        const profileData = (userRes.value.data ?? null) as UserData | null;
        setUserData(profileData);
        dispatch(setUserDataStore(profileData as Record<string, unknown> | null));
      } else {
        setUserData(cachedUserData);
      }
    } catch {
      setBookings([]);
      setUserData(cachedUserData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleCancelBooking = async (booking: Booking) => {
    const shouldCancel = window.confirm(
      `Cancel booking on ${formatDate(booking.date)} at ${booking.time_slot}?`
    );
    if (!shouldCancel) return;

    setActiveBookingId(booking.id);
    try {
      await api.delete(`/api/bookings/${booking.id}/cancel`);
      toast({ title: "Booking Cancelled", description: "Your booking was cancelled successfully." });
      await loadProfile();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Unable to cancel booking right now.";
      toast({ title: "Cancel Failed", description: message, variant: "destructive" });
    } finally {
      setActiveBookingId(null);
    }
  };

  const openRescheduleDialog = (booking: Booking) => {
    setSelectedBooking(booking);
    setRescheduleDate(booking.date);
    setRescheduleTimeSlot(booking.time_slot);
    setIsRescheduleOpen(true);
  };

  const handleRescheduleBooking = async () => {
    if (!selectedBooking || !rescheduleDate || !rescheduleTimeSlot) {
      toast({ title: "Missing Details", description: "Please select date and time slot.", variant: "destructive" });
      return;
    }

    setActiveBookingId(selectedBooking.id);
    try {
      await api.patch(`/api/bookings/${selectedBooking.id}/reschedule`, {
        date: rescheduleDate,
        time_slot: rescheduleTimeSlot,
      });
      toast({ title: "Booking Updated", description: "Your booking was rescheduled successfully." });
      setIsRescheduleOpen(false);
      await loadProfile();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Unable to reschedule booking right now.";
      toast({ title: "Reschedule Failed", description: message, variant: "destructive" });
    } finally {
      setActiveBookingId(null);
    }
  };

  const { ongoingBookings, pastBookings } = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      if (a.date === b.date) return a.time_slot.localeCompare(b.time_slot);
      return a.date.localeCompare(b.date);
    });

    const now = new Date();

    const isUpcoming = (item: Booking) => {
      const bookingStart = getBookingStartDateTime(item.date, item.time_slot);

      // Fallback to date-only comparison if slot format is unexpected.
      if (!bookingStart) {
        return item.date >= today;
      }

      return bookingStart >= now;
    };

    const ongoing = sorted.filter((item) => isUpcoming(item));
    const past = sorted.filter((item) => !isUpcoming(item)).reverse();

    return {
      ongoingBookings: ongoing,
      pastBookings: past,
    };
  }, [bookings, today]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 pb-10">
        <section className="container mx-auto px-4 space-y-8">
          <Card className="turf-card-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-2xl flex items-center gap-2">
                <UserCircle2 className="h-6 w-6 text-primary" />
                My Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">Name:</span> {userData?.full_name || "-"}</p>
              <p><span className="text-foreground font-medium">Email:</span> {userData?.email || "-"}</p>
              <p><span className="text-foreground font-medium">Mobile:</span> {userData?.mobile || "-"}</p>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="turf-card-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  My Upcoming Bookings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading bookings...
                  </div>
                ) : ongoingBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ongoing bookings found.</p>
                ) : (
                  <div className="space-y-3">
                    {ongoingBookings.map((booking) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        allowActions
                        isActing={activeBookingId === booking.id}
                        onCancel={handleCancelBooking}
                        onReschedule={openRescheduleDialog}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="turf-card-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Booking History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading bookings...
                  </div>
                ) : pastBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No past bookings found.</p>
                ) : (
                  <div className="space-y-3">
                    {pastBookings.map((booking) => (
                      <div key={booking.id} className="space-y-2 rounded-xl border border-border/60 p-4">
                        <BookingRow booking={booking} />
                        <p className="text-xs text-muted-foreground text-right">
                          Booked on {formatDateTime(booking.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Bookings</p>
                <p className="text-2xl font-bold">{bookings.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Upcoming</p>
                <p className="text-2xl font-bold text-primary">{ongoingBookings.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{pastBookings.length}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <Dialog
        open={isRescheduleOpen}
        onOpenChange={(open) => {
          setIsRescheduleOpen(open);
          if (!open) {
            setSelectedBooking(null);
            setRescheduleDate("");
            setRescheduleTimeSlot("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Booking</DialogTitle>
            <DialogDescription>
              Pick a new date and time slot for your booking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">Date</Label>
              <Input
                id="reschedule-date"
                type="date"
                min={today}
                value={rescheduleDate}
                onChange={(event) => setRescheduleDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Time Slot</Label>
              <Select value={rescheduleTimeSlot} onValueChange={setRescheduleTimeSlot}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRescheduleBooking}
              disabled={!selectedBooking || activeBookingId === selectedBooking.id}
            >
              {selectedBooking && activeBookingId === selectedBooking.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
