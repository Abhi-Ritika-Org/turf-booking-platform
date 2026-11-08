export interface BookingSlot {
  available: boolean;
  past?: boolean;
  start_time: string;
  end_time: string;
}

export interface TurfOwnerContact {
  name: string;
  phone: string;
}

export interface TurfDetails {
  id: string;
  name: string;
  location: string;
  avg_rating: number;
  total_reviews: number;
  price_per_hour: number;
  sports: string[];
  amenities: string[];
  images?: string[];
  thumbnail?: string;
  owner_contact: TurfOwnerContact;
}

export interface TurfDetailsResponse {
  available_slots: BookingSlot[];
  status: boolean;
  turf: TurfDetails;
}

export interface GroupedSlots {
  label: string;
  slots: BookingSlot[];
}

export interface BookingTotals {
  totalHours: number;
  subtotal: number;
  platformFee: number;
  grandTotal: number;
}

const minutesFromTime = (time24: string) => {
  const [hours, minutes] = time24.split(":").map(Number);
  return hours * 60 + minutes;
};

export const formatTime12h = (time24: string) => {
  const [hours, minutes] = time24.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

export const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString("en-IN")}`;

export const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${day}-${month}-${year}`;
};

// The backend decides "today" in the venue timezone, so build the booking dates from it, not the browser clock.
export const getVenueToday = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(part('year'), part('month') - 1, part('day'), 12);
};

export const calculateDurationHours = (selectedSlotCount: number, slotMinutes = 30) => {
  return (selectedSlotCount * slotMinutes) / 60;
};

export const calculateBookingTotals = (
  pricePerHour: number,
  selectedSlotCount: number,
  platformFeeRate = 0.03,
  minimumPlatformFee = 9,
): BookingTotals => {
  const totalHours = calculateDurationHours(selectedSlotCount);
  const subtotal = Math.round(totalHours * pricePerHour);
  const platformFee = subtotal > 0 ? Math.max(minimumPlatformFee, Math.round(subtotal * platformFeeRate)) : 0;

  return {
    totalHours,
    subtotal,
    platformFee,
    grandTotal: subtotal + platformFee,
  };
};

export const sortSlotsByTime = (slots: BookingSlot[]) => {
  return [...slots].sort((firstSlot, secondSlot) => {
    return minutesFromTime(firstSlot.start_time) - minutesFromTime(secondSlot.start_time);
  });
};

export const groupSlotsByPeriod = (slots: BookingSlot[]): GroupedSlots[] => {
  const grouped = new Map<string, BookingSlot[]>();

  const getLabel = (time24: string) => {
    const hour = Number(time24.split(":")[0]);
    if (hour < 6) return "Overnight";
    if (hour < 12) return "Morning";
    if (hour < 18) return "Afternoon";
    return "Evening";
  };

  sortSlotsByTime(slots).forEach((slot) => {
    const label = getLabel(slot.start_time);
    const bucket = grouped.get(label) ?? [];
    bucket.push(slot);
    grouped.set(label, bucket);
  });

  const order = ["Overnight", "Morning", "Afternoon", "Evening"];

  return order
    .map((label) => ({ label, slots: grouped.get(label) ?? [] }))
    .filter((group) => group.slots.length > 0);
};
