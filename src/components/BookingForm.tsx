import { useState, useEffect } from "react";
import { Calendar, Clock, Phone, User, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from '@/lib/api';
import { useToast } from "@/hooks/use-toast";

interface BookingFormProps {
  onBookingSuccess: () => void;
  bookedSlots: { date: string; time_slot: string }[];
}

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

export const BookingForm = ({ onBookingSuccess, bookedSlots }: BookingFormProps) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { toast } = useToast();

  const isSlotBooked = (slot: string) => {
    return bookedSlots.some(
      (booking) => booking.date === date && booking.time_slot === slot
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !phone || !date || !timeSlot) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (phone.length < 10) {
      toast({
        title: "Invalid Phone",
        description: "Please enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/api/bookings', {
        name: name.trim(),
        phone: phone.trim(),
        date,
        time_slot: timeSlot,
      });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        toast({ title: 'Slot Already Booked', description: 'This time slot is no longer available. Please choose another.', variant: 'destructive' });
      } else {
        toast({ title: 'Booking Failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
      }
      setIsLoading(false);
      return;
    }
    setIsLoading(false);

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setPhone("");
      setDate("");
      setTimeSlot("");
      onBookingSuccess();
    }, 2500);
  };

  const today = new Date().toISOString().split("T")[0];

  if (showSuccess) {
    return (
      <Card className="turf-card-shadow animate-scale-in overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="turf-gradient rounded-full p-4 mb-6">
            <CheckCircle className="h-12 w-12 text-primary-foreground" />
          </div>
          <h3 className="font-display text-2xl font-bold text-foreground mb-2">
            Booking Confirmed!
          </h3>
          <p className="text-muted-foreground text-center">
            See you on the turf, {name}!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="turf-card-shadow transition-all duration-300 hover:turf-card-hover overflow-hidden">
      <CardHeader className="turf-gradient text-primary-foreground">
        <CardTitle className="font-display text-xl flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Book Your Slot
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Full Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter phone number"
              className="transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Select Date
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => {
                setDate(e.target.value);
                setTimeSlot("");
              }}
              className="transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {date && (
            <div className="space-y-3 animate-fade-in">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Available Slots
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {TIME_SLOTS.map((slot) => {
                  const booked = isSlotBooked(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={booked}
                      onClick={() => setTimeSlot(slot)}
                      className={`
                        p-3 rounded-lg text-sm font-medium transition-all duration-200
                        ${booked
                          ? "bg-muted text-muted-foreground cursor-not-allowed line-through"
                          : timeSlot === slot
                          ? "turf-gradient text-primary-foreground shadow-md"
                          : "bg-secondary text-secondary-foreground hover:bg-primary/10"
                        }
                      `}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !timeSlot}
            className="w-full turf-gradient text-primary-foreground font-semibold py-6 text-base transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Booking...
              </>
            ) : (
              "Confirm Booking"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
