import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Heart,
  LampCeiling,
  LockKeyhole,
  MapPin,
  ParkingCircle,
  Share2,
  ShowerHead,
  ShieldCheck,
  Sparkles,
  Star,
  TimerReset,
  Users,
  Wifi,
  Check,
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  BookingSlot,
  TurfDetails as TurfDetailsData,
  TurfDetailsResponse,
  BookingTotals,
  calculateBookingTotals,
  formatCurrency,
  formatTime12h,
  groupSlotsByPeriod,
  getLocalDateString,
  sortSlotsByTime,
} from "@/lib/turfBooking";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import { fetchTurfDetails } from "@/store/turfDetailsSlice";

type TurfLocationState = {
  turf?: Partial<TurfDetailsData> & {
    thumbnail_url?: string;
    owner?: {
      name?: string;
      phone?: string;
    };
  };
  available_slots?: BookingSlot[];
};

const STATUS_POLL_INTERVAL_MS = 3000;
const STATUS_POLL_MAX_ATTEMPTS = 20;

type BookingApiResponse = {
  status?: number | boolean | string;
  message?: string;
  amount?: number;
  platform_fee?: number;
  received_at?: string;
  error?: string;
  booking_id?: string;
  order_id?: string;
  data?: BookingApiResponse;
  razorpay_api_key?: string;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    return error.response?.data?.error ?? error.response?.data?.message ?? fallback;
  }
  return fallback;
};


const amenityIconMap: Record<string, typeof ShieldCheck> = {
  floodlights: LampCeiling,
  "changing rooms": ShowerHead,
  parking: ParkingCircle,
  wifi: Wifi,
  security: ShieldCheck,
};

const slotVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

const mergeResponse = (state?: TurfLocationState | null): TurfDetailsResponse | null => {
  const turf = state?.turf ?? {};
  if (!state?.turf && !state?.available_slots) return null;

  return {
    status: true,
    available_slots: state?.available_slots?.length ? sortSlotsByTime(state.available_slots) : [],
    turf: {
      id: turf.id ?? "",
      name: turf.name ?? "",
      location: turf.location ?? "",
      avg_rating: turf.avg_rating ?? 0,
      total_reviews: turf.total_reviews ?? 0,
      price_per_hour: turf.price_per_hour ?? 0,
      sports: turf.sports?.length ? turf.sports : [],
      amenities: turf.amenities?.length ? turf.amenities : [],
      images: turf.images?.length ? turf.images : turf.thumbnail ? [turf.thumbnail] : [],
      thumbnail: turf.thumbnail ?? turf.thumbnail_url ?? "",
      owner_contact: {
        name: turf.owner_contact?.name ?? turf.owner?.name ?? "",
        phone: turf.owner_contact?.phone ?? turf.owner?.phone ?? "",
      },
    },
  };
};

const formatSelectedRange = (slots: BookingSlot[]) => {
  if (slots.length === 0) return "Select a slot to calculate your booking";

  const first = slots[0];
  const last = slots[slots.length - 1];

  return `${formatTime12h(first.start_time)} - ${formatTime12h(last.end_time)}`;
};

const getAmenityIcon = (amenity: string) => {
  const normalized = amenity.trim().toLowerCase();
  return amenityIconMap[normalized] ?? ShieldCheck;
};

const BookingSkeleton = () => (
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
    <div className="space-y-6">
      <Skeleton className="h-[460px] w-full rounded-3xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
      <Skeleton className="h-[420px] rounded-3xl" />
    </div>
      <Skeleton className="h-[720px] rounded-3xl" />
  </div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Card className="rounded-[2rem] border-destructive/20 bg-card shadow-[0_18px_50px_-30px_hsl(var(--foreground))/0.2]">
    <CardContent className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="rounded-full bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive">Unable to load turf details</div>
      <div className="max-w-md space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{message}</h2>
        <p className="text-sm text-muted-foreground">Please retry or go back to the listing page and open the turf again.</p>
      </div>
      <Button onClick={onRetry} className="rounded-full px-6">Retry</Button>
      <Button variant="ghost" asChild>
        <Link to="/">Back to listings</Link>
      </Button>
    </CardContent>
  </Card>
);

const SlotCard = ({
  slot,
  index,
  isSelected,
  onSelect,
}: {
  slot: BookingSlot;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}) => {
  const isAvailable = slot.available;

  return (
    <motion.button
      type="button"
      layout
      variants={slotVariants}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.22, delay: index * 0.03 }}
      whileHover={isAvailable ? { y: -2, scale: 1.01 } : undefined}
      onClick={() => onSelect(index)}
      disabled={!isAvailable}
      className={cn(
        "group relative w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200",
        isSelected &&
          "border-primary bg-primary/8 ring-2 ring-primary/20 shadow-lg shadow-primary/10",
        !isSelected &&
          isAvailable &&
          "border-border bg-white/90 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_10px_28px_-18px_hsl(var(--primary))/0.35]",
        !isAvailable && "cursor-not-allowed border-border/70 bg-muted/60 text-muted-foreground opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-sm font-semibold", isSelected && "text-primary")}>{formatTime12h(slot.start_time)}</p>
          <p className="text-xs text-muted-foreground">to {formatTime12h(slot.end_time)}</p>
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border text-xs",
            isSelected && "border-primary bg-primary text-primary-foreground",
            !isSelected && isAvailable && "border-emerald-200 bg-emerald-50 text-emerald-700",
            !isAvailable && "border-border bg-background text-muted-foreground",
          )}
        >
          {isSelected ? <Check className="h-4 w-4" /> : isAvailable ? <Sparkles className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
            isSelected && "bg-primary text-primary-foreground",
            !isSelected && isAvailable && "bg-emerald-100 text-emerald-800",
            !isAvailable && "bg-muted text-muted-foreground line-through",
          )}
        >
          {isSelected ? "Selected" : isAvailable ? "Available" : "Booked"}
        </span>
        <span className="text-xs text-muted-foreground">30 min</span>
      </div>
    </motion.button>
  );
};

const BookingSummaryCard = ({
  turf,
  selectedSlots,
  totals,
  selectedRangeLabel,
  availableCount,
  isBooking,
  bookingResponse,
  onContinueBooking,
}: {
  turf: TurfDetailsData;
  selectedSlots: BookingSlot[];
  totals: BookingTotals;
  selectedRangeLabel: string;
  availableCount: number;
  isBooking: boolean;
  bookingResponse: BookingApiResponse | null;
  onContinueBooking: () => void;
}) => (
  <Card className="rounded-3xl border-border/70 bg-card/95 shadow-[0_24px_60px_-32px_hsl(var(--foreground))/0.24] backdrop-blur">
    <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-br from-primary/8 via-background to-background">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Booking summary</p>
          <CardTitle className="mt-1 text-2xl">Your selected slot block</CardTitle>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Live pricing</div>
      </div>
      <div className="rounded-2xl border border-primary/15 bg-white p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Selected timeline</span>
          <span className="font-semibold text-foreground">{selectedSlots.length} slots</span>
        </div>
        <p className="mt-2 text-lg font-semibold text-foreground">{selectedRangeLabel}</p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Selection progress</span>
            <span>{selectedSlots.length} / {Math.max(availableCount, 1)}</span>
          </div>
          <Progress value={Math.round((selectedSlots.length / Math.max(availableCount, 1)) * 100)} className="h-2 bg-muted" />
        </div>
      </div>
    </CardHeader>

    <CardContent className="space-y-5 p-6">
      <div className="flex flex-wrap gap-2">
        {selectedSlots.length > 0 ? (
          selectedSlots.map((slot) => (
            <Badge key={`${slot.start_time}-${slot.end_time}`} variant="secondary" className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {formatTime12h(slot.start_time)} - {formatTime12h(slot.end_time)}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Select continuous slots to calculate your booking.</p>
        )}
      </div>

      <Separator />

      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Price per hour</span>
          <span className="font-semibold text-foreground">{formatCurrency(turf.price_per_hour)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total duration</span>
          <span className="font-semibold text-foreground">{totals.totalHours.toFixed(1)} hrs</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold text-foreground">{formatCurrency(totals.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Platform fee</span>
          <span className="font-semibold text-foreground">{formatCurrency(totals.platformFee)}</span>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between rounded-2xl bg-primary/8 px-4 py-4">
        <div>
          <p className="text-sm text-muted-foreground">Final amount</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.grandTotal)}</p>
        </div>
        <div className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Ready to book</div>
      </div>

      <Button
        className="w-full rounded-2xl py-6 text-base font-semibold shadow-lg shadow-primary/20"
        disabled={selectedSlots.length === 0 || isBooking}
        onClick={onContinueBooking}
      >
        {isBooking ? "Booking..." : "Continue booking"}
        <ChevronRight className="h-4 w-4" />
      </Button>

      {bookingResponse && (
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
          <p className="font-semibold text-foreground">Booking response</p>
          {bookingResponse.message && <p className="mt-1 text-muted-foreground">{bookingResponse.message}</p>}
          {bookingResponse.amount !== undefined && <p className="mt-2 text-foreground">Amount: Rs. {bookingResponse.amount.toLocaleString("en-IN")}</p>}
          {bookingResponse.platform_fee !== undefined && <p className="text-foreground">Platform fee: Rs. {bookingResponse.platform_fee.toLocaleString("en-IN")}</p>}
          {bookingResponse.received_at && <p className="text-muted-foreground">Received at: {bookingResponse.received_at}</p>}
          {bookingResponse.error && <p className="text-destructive">Error: {bookingResponse.error}</p>}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Secure checkout, instant confirmation, and support from {turf.owner_contact.name}.
      </p>
    </CardContent>
  </Card>
);

const TurfDetails = () => {
  const params = useParams();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const state = (location.state ?? {}) as TurfLocationState;
  const { toast } = useToast();
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [rangeStartIndex, setRangeStartIndex] = useState<number | null>(null);
  const [rangeEndIndex, setRangeEndIndex] = useState<number | null>(null);
  const date = getLocalDateString(); // default to today's date, can be modified to allow user selection in the future
  const [isBooking, setIsBooking] = useState(false);
  const [bookingResponse, setBookingResponse] = useState<BookingApiResponse | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const isBookingBusy = isBooking || isConfirmingPayment;
  const isMountedRef = useRef(true);
  const turfDetailsState = useSelector((reduxState: RootState) => reduxState.turfDetails);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!params.turfId) return;

    dispatch(
      fetchTurfDetails({
        turfId: params.turfId,
        date,
      }),
    );
  }, [date, dispatch, params.turfId]);

  const fallbackResponse = useMemo(() => (state?.turf ? mergeResponse(state) : null), [state]);
  const resolvedResponse = turfDetailsState.data ?? fallbackResponse;
  const hasError = turfDetailsState.status === "failed" && !resolvedResponse;
  const pageResponse = resolvedResponse; // will be null while loading or if no data available

  const handleRetry = () => {
    if (!params.turfId) return;

    dispatch(
      fetchTurfDetails({
        turfId: params.turfId,
        date,
      }),
    );
  };

  const sortedSlots = useMemo(() => sortSlotsByTime(pageResponse?.available_slots ?? []), [pageResponse?.available_slots]);
  const groupedSlots = useMemo(() => groupSlotsByPeriod(sortedSlots), [sortedSlots]);

  const selectedSlots = useMemo(() => {
    if (rangeStartIndex === null || rangeEndIndex === null) return [];
    const start = Math.min(rangeStartIndex, rangeEndIndex);
    const end = Math.max(rangeStartIndex, rangeEndIndex);
    return sortedSlots.slice(start, end + 1);
  }, [rangeEndIndex, rangeStartIndex, sortedSlots]);

  const totals = useMemo(
    () => calculateBookingTotals(pageResponse?.turf.price_per_hour ?? 0, selectedSlots.length),
    [pageResponse?.turf.price_per_hour, selectedSlots.length],
  );

  const selectedRangeLabel = useMemo(() => formatSelectedRange(selectedSlots), [selectedSlots]);
  const availableCount = sortedSlots.filter((slot) => slot.available).length;

  const canSelectRange = (startIndex: number, endIndex: number) => {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    return sortedSlots.slice(start, end + 1).every((currentSlot) => currentSlot.available);
  };

  const carouselImages = useMemo(() => {
    const images = pageResponse?.turf.images?.length ? pageResponse!.turf.images : pageResponse?.turf.thumbnail ? [pageResponse?.turf.thumbnail] : [];
    return [...new Set(images.filter(Boolean))];
  }, [pageResponse?.turf.images, pageResponse?.turf.thumbnail]);

  const handleSlotSelect = (index: number) => {
    const slot = sortedSlots[index];
    if (!slot?.available) return;

    if (rangeStartIndex === null || rangeEndIndex === null) {
      setRangeStartIndex(index);
      setRangeEndIndex(index);
      return;
    }

    const start = Math.min(rangeStartIndex, rangeEndIndex);
    const end = Math.max(rangeStartIndex, rangeEndIndex);

    if (start === end && index === start) {
      setRangeStartIndex(null);
      setRangeEndIndex(null);
      return;
    }

    if (index === start) {
      setRangeStartIndex(start + 1);
      return;
    }

    if (index === end) {
      setRangeEndIndex(end - 1);
      return;
    }

    if (index < start && canSelectRange(index, start)) {
      setRangeStartIndex(index);
      return;
    }

    if (index > end && canSelectRange(end, index)) {
      setRangeEndIndex(index);
      return;
    }

    if (start === end && canSelectRange(start, index)) {
      setRangeStartIndex(Math.min(start, index));
      setRangeEndIndex(Math.max(start, index));
      return;
    }

    setRangeStartIndex(index);
    setRangeEndIndex(index);
  };

  const handleShare = async () => {
    const shareTitle = `${pageResponse?.turf.name ?? ""} booking details`;
    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copied", description: "The booking page URL is now in your clipboard." });
      }
    } catch {
      toast({ title: "Share unavailable", description: "Try again from a secure browser context." });
    }
  };

  const handleWishlist = () => {
    setIsWishlisted((current) => !current);
    toast({
      title: isWishlisted ? "Removed from wishlist" : "Saved to wishlist",
      description: isWishlisted ? "You can always come back to it later." : "This turf is now on your shortlist.",
    });
  };

  const handleBookingConfirmed = (booking: BookingApiResponse) => {
    setBookingResponse({ ...booking, message: "Your booking is confirmed." });
    setRangeStartIndex(null);
    setRangeEndIndex(null);
    if (params.turfId) {
      dispatch(fetchTurfDetails({ turfId: params.turfId, date }));
    }
    toast({
      title: "Payment verified",
      description: "Your booking is confirmed.",
    });
  };

  // Fallback when verify-payment fails: the backend (verify call or Razorpay webhook) is the source of truth,
  // so poll the booking status until it settles or we give up.
  const waitForBookingConfirmation = async (bookingId: string) => {
    setIsConfirmingPayment(true);
    setBookingResponse({ message: "Confirming your payment..." });

    try {
      for (let attempt = 0; attempt < STATUS_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
        if (!isMountedRef.current) return;

        try {
          const response = await api.get(`/api/bookings/booking-details/${bookingId}`);
          const booking = response.data?.data as BookingApiResponse | undefined;
          if (!isMountedRef.current) return;

          if (booking?.status === "confirmed") {
            handleBookingConfirmed(booking);
            return;
          }
          if (typeof booking?.status === "string" && booking.status !== "payment_pending") {
            setBookingResponse({ ...booking, error: `Booking ${booking.status.replace(/_/g, " ")}. Please try booking again.` });
            toast({
              title: "Booking not confirmed",
              description: `Booking status: ${booking.status.replace(/_/g, " ")}.`,
              variant: "destructive",
            });
            return;
          }
        } catch (statusError) {
          // Transient failure; keep polling.
          console.error("[Booking] booking-details poll failed", statusError);
        }
      }

      setBookingResponse({ message: "We'll update your booking shortly. Check My bookings for the latest status." });
      toast({
        title: "Payment is being confirmed",
        description: "We'll update your booking shortly.",
      });
    } finally {
      if (isMountedRef.current) setIsConfirmingPayment(false);
    }
  };

  const handleContinueBooking = async () => {
    if (!pageResponse?.turf.id || selectedSlots.length === 0) {
      toast({
        title: "Select a slot block",
        description: "Choose a continuous slot range before continuing.",
        variant: "destructive",
      });
      return;
    }

    // Check checkout can open before creating the booking; otherwise an unpaid booking would hold the slot.
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    if (!window.Razorpay || !razorpayKeyId) {
      console.error("[Booking] Razorpay checkout unavailable before booking", {
        hasRazorpayGlobal: Boolean(window.Razorpay),
        razorpayKeyPresent: Boolean(razorpayKeyId),
      });
      toast({
        title: "Payment unavailable",
        description: "Payment checkout could not be loaded. Disable any ad blocker or refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }

    const bookingPayload = {
      booking_date: date,
      booking_start_time: selectedSlots[0].start_time,
      booking_end_time: selectedSlots[selectedSlots.length - 1].end_time,
      turf_id: pageResponse.turf.id,
    };

    setIsBooking(true);
    setBookingResponse(null);

    try {
      const response = await api.post("/api/bookings/create-booking", bookingPayload);
      const payload = response.data;
      const bookingData = payload?.data ?? payload;
      const isSuccess = payload?.status === true || response.status === 200;

      setBookingResponse(bookingData ?? {});

      if (!isSuccess) {
        toast({
          title: "Booking response received",
          description: bookingData?.message ?? "The server returned a booking response.",
        });
        return;
      }

      const razorpayKey = bookingData?.razorpay_api_key ?? razorpayKeyId;
      const razorpayOrderId = bookingData?.razorpay_order_id ?? bookingData?.order_id;

      console.debug("[Booking] create-booking response", {
        payload,
        bookingData,
        razorpayKeyPresent: Boolean(razorpayKey),
        razorpayOrderId,
        hasRazorpayGlobal: Boolean(window.Razorpay),
      });

      if (!razorpayKey || !razorpayOrderId || !window.Razorpay) {
        console.error("[Booking] Razorpay checkout cannot open", {
          razorpayKeyPresent: Boolean(razorpayKey),
          razorpayOrderId,
          hasRazorpayGlobal: Boolean(window.Razorpay),
          bookingData,
        });
        toast({
          title: "Razorpay unavailable",
          description: "Booking was created, but payment checkout could not be opened.",
          variant: "destructive",
        });
        return;
      }

      const razorpayOptions = {
        key: razorpayKey,
        amount: typeof bookingData?.amount === "number" ? Math.round(bookingData.amount * 100) : undefined,
        currency: "INR",
        name: process.env.APP_NAME ?? "TurfBook",
        description: `Booking for ${pageResponse.turf.name}`,
        order_id: razorpayOrderId,
        handler: async (razorpayResponse: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          const bookingId = bookingData?.booking_id;
          try {
            console.debug("[Booking] Razorpay success callback", razorpayResponse);
            const verifyResponse = await api.post("/api/bookings/verify-payment", {
              booking_id: bookingId,
              razorpay_payment_id: razorpayResponse.razorpay_payment_id,
              razorpay_order_id: razorpayResponse.razorpay_order_id,
              razorpay_signature: razorpayResponse.razorpay_signature,
            });
            const verifyPayload = verifyResponse.data;

            console.debug("[Booking] verify-payment response", verifyPayload);
            handleBookingConfirmed(verifyPayload?.data ?? verifyPayload);
          } catch (verifyError) {
            const verifyMessage = getApiErrorMessage(verifyError, "Payment verification failed");
            console.error("[Booking] verify-payment failed", verifyError);
            if (bookingId) {
              await waitForBookingConfirmation(bookingId);
              return;
            }
            setBookingResponse({ error: verifyMessage });
            toast({
              title: "Payment verification failed",
              description: verifyMessage,
              variant: "destructive",
            });
          }
        },
        modal: {
          ondismiss: () => {
            toast({
              title: "Payment pending",
              description: "Complete the payment to confirm your booking.",
            });
          },
        },
      };

      console.debug("[Booking] opening Razorpay checkout", razorpayOptions);
      const razorpay = new window.Razorpay(razorpayOptions);
      try {
        razorpay.open();
      } catch (checkoutError) {
        console.error("[Booking] Razorpay open() threw an error", checkoutError, razorpayOptions);
        throw checkoutError;
      }

      toast({
        title: bookingData?.message ?? "Booking created successfully",
        description: bookingData?.amount ? `Amount: Rs. ${bookingData.amount.toLocaleString("en-IN")}` : "Razorpay checkout has been opened.",
      });
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, "Failed to create booking");
      if (isAxiosError(error) && error.response?.status === 409) {
        // Slot was taken since the page loaded: refresh availability and clear the stale selection.
        setRangeStartIndex(null);
        setRangeEndIndex(null);
        if (params.turfId) {
          dispatch(fetchTurfDetails({ turfId: params.turfId, date }));
        }
      }
      setBookingResponse({ error: errorMessage });
      toast({
        title: "Booking failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsBooking(false);
    }
  };

  const heroRating = (pageResponse?.turf.avg_rating ?? 0).toFixed(1);

  if (turfDetailsState.status === "loading" && !resolvedResponse) {
    return <BookingSkeleton />;
  }

  if (hasError || !resolvedResponse) {
    return <ErrorState message={turfDetailsState.error ?? "Something went wrong while loading the turf."} onRetry={handleRetry} />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.08),_transparent_28%),radial-gradient(circle_at_top_right,_hsl(45_90%_55%/0.08),_transparent_24%),linear-gradient(to_bottom,_hsl(var(--background)),_hsl(var(--background)))]">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 pb-28 md:px-6 md:pb-16 md:pt-8">
        <div className="mb-6 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Button asChild variant="ghost" size="sm" className="rounded-full px-3">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Link>
            </Button>
            <ChevronRight className="h-4 w-4" />
            <span className="truncate text-foreground/75">Turf details</span>
          </div>
          <Badge variant="secondary" className="rounded-full bg-primary/10 px-3 py-1 text-primary">
            {params.turfId ?? pageResponse?.turf.id}
          </Badge>
        </div>

        <AnimatePresence mode="wait">
          {pageResponse?.status ? (
            <motion.div
              key="turf-details"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32 }}
              className="space-y-8"
            >
              <motion.section
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, delay: 0.05 }}
                className="overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-[0_24px_60px_-28px_hsl(var(--foreground))/0.22]"
              >
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
                  <div className="relative min-h-[300px] bg-gradient-to-br from-primary/10 via-background to-emerald-50 p-4 md:p-6">
                    <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2 md:left-6 md:top-6">
                      <Badge className="rounded-full bg-white/90 px-3 py-1 text-foreground shadow-sm">Live availability</Badge>
                      <Badge className="rounded-full bg-primary px-3 py-1 text-primary-foreground shadow-sm">
                        {availableCount} slots open
                      </Badge>
                    </div>

                    <Carousel className="mt-8">
                      <CarouselContent>
                        {pageResponse!.turf.images.map((image, index) => (
                          <CarouselItem key={`${image}-${index}`}>
                            <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-muted shadow-lg shadow-primary/5">
                              <motion.img
                                src={image}
                                alt={`${pageResponse!.turf.name} image ${index + 1}`}
                                className="h-[280px] w-full object-cover md:h-[360px]"
                                whileHover={{ scale: 1.03 }}
                                transition={{ duration: 0.35 }}
                              />
                            </div>
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      {pageResponse!.turf.images.length > 1 && (
                        <>
                          <CarouselPrevious className="left-4 top-1/2 hidden -translate-y-1/2 border-white/70 bg-white/95 md:flex" />
                          <CarouselNext className="right-4 top-1/2 hidden -translate-y-1/2 border-white/70 bg-white/95 md:flex" />
                        </>
                      )}
                    </Carousel>

                    <div className="mt-4 flex items-center gap-3">
                      {pageResponse!.turf.images.map((image, index) => (
                        <div
                          key={`${image}-thumb-${index}`}
                          className={cn(
                            "h-16 w-24 overflow-hidden rounded-2xl border bg-white shadow-sm transition-all",
                            index === 0 ? "ring-2 ring-primary" : "border-border/70 opacity-85",
                          )}
                        >
                          <img src={image} alt={`Thumbnail ${index + 1}`} className="h-full w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-6 p-5 md:p-7">
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <Badge variant="outline" className="w-fit rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-primary">
                          Premium turf booking
                        </Badge>
                        <div className="space-y-2">
                          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                            {pageResponse!.turf.name}
                          </h1>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span>{pageResponse!.turf.location}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
                          <Star className="h-4 w-4 fill-turf-gold text-turf-gold" />
                          <span>{heroRating}</span>
                          <span className="text-muted-foreground">({pageResponse!.turf.total_reviews} reviews)</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                          <BadgeCheck className="h-4 w-4" />
                          Verified venue
                        </div>
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                          <CalendarDays className="h-4 w-4" />
                          Flexible booking
                        </div>
                      </div>

                      <div>
                        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Sports supported</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pageResponse!.turf.sports.map((sport) => (
                            <Badge key={sport} className="rounded-full bg-primary/8 px-3 py-1 text-sm font-medium text-primary">
                              {sport}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-primary/10 bg-gradient-to-r from-primary/8 via-white to-emerald-50 p-4">
                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Price per hour</p>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-3xl font-bold text-foreground">{formatCurrency(pageResponse!.turf.price_per_hour)}</span>
                              <span className="text-sm text-muted-foreground">/ hour</span>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-primary px-4 py-3 text-right text-primary-foreground shadow-lg shadow-primary/20">
                            <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/80">Book now</p>
                            <p className="text-sm font-semibold">Best time slots are live</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Button className="rounded-2xl py-6 text-base shadow-lg shadow-primary/15" onClick={() => document.getElementById("booking-slots")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        Book now
                      </Button>
                      <Button variant="outline" className="rounded-2xl py-6 text-base" onClick={handleShare}>
                        <Share2 className="h-4 w-4" />
                        Share
                      </Button>
                      <Button variant="secondary" className="rounded-2xl py-6 text-base" onClick={handleWishlist}>
                        <Heart className={cn("h-4 w-4 transition-colors", isWishlisted && "fill-current text-rose-500")} />
                        {isWishlisted ? "Saved" : "Favorite"}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.section>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,420px)]">
                <motion.section
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: 0.08 }}
                  className="rounded-[2rem] border border-border/70 bg-card p-6 shadow-[0_18px_50px_-28px_hsl(var(--foreground))/0.2]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Booking timeline</p>
                      <h2 id="booking-slots" className="mt-1 text-2xl font-bold text-foreground">
                        Select your slot block
                      </h2>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {selectedSlots.length > 0 ? `${selectedSlots.length} selected` : "Tap a slot"}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-dashed border-primary/25 bg-primary/5 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Selected timeline</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{selectedRangeLabel}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <TimerReset className="h-4 w-4 text-primary" />
                        {selectedSlots.length > 0 ? `${totals.totalHours.toFixed(1)} hours` : "0.0 hours"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4">
                    {groupedSlots.map((group) => (
                      <div key={group.label} className="rounded-2xl border border-border/70 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{group.label}</p>
                            <p className="text-xs text-muted-foreground">{group.slots.length} slots</p>
                          </div>
                          <Badge variant="outline" className="rounded-full bg-muted/60 px-3 py-1 text-muted-foreground">
                            Timeline group
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {group.slots.map((slot) => {
                            const slotIndex = sortedSlots.findIndex(
                              (currentSlot) =>
                                currentSlot.start_time === slot.start_time && currentSlot.end_time === slot.end_time,
                            );
                              const isSelected =
                                rangeStartIndex !== null &&
                                rangeEndIndex !== null &&
                                slotIndex >= Math.min(rangeStartIndex, rangeEndIndex) &&
                                slotIndex <= Math.max(rangeStartIndex, rangeEndIndex) &&
                                slot.available;

                            return (
                              <SlotCard
                                key={`${slot.start_time}-${slot.end_time}`}
                                slot={slot}
                                index={slotIndex}
                                isSelected={isSelected}
                                onSelect={handleSlotSelect}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="h-4 w-4" />
                        Available
                      </div>
                      <p className="mt-1 text-emerald-700/80">Tap to select and extend a continuous booking block.</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <LockKeyhole className="h-4 w-4" />
                        Booked
                      </div>
                      <p className="mt-1">Unavailable slots stay disabled and visually muted.</p>
                    </div>
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                      <div className="flex items-center gap-2 font-semibold">
                        <Sparkles className="h-4 w-4" />
                        Selected
                      </div>
                      <p className="mt-1">Your active range is highlighted with a stronger glow and border.</p>
                    </div>
                  </div>
                </motion.section>

                <motion.aside
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: 0.12 }}
                  className="space-y-6"
                >
                    <div className="hidden xl:block xl:sticky xl:top-24">
                    <BookingSummaryCard
                      turf={pageResponse!.turf}
                      selectedSlots={selectedSlots}
                      totals={totals}
                      selectedRangeLabel={selectedRangeLabel}
                      availableCount={availableCount}
                      isBooking={isBookingBusy}
                      bookingResponse={bookingResponse}
                      onContinueBooking={handleContinueBooking}
                    />
                  </div>

                  <Card className="rounded-[2rem] border-border/70 bg-card shadow-[0_18px_50px_-30px_hsl(var(--foreground))/0.2]">
                    <CardHeader>
                      <CardTitle className="text-xl">Turf essentials</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5 p-6 pt-0">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {pageResponse!.turf.amenities.map((amenity) => {
                          const AmenityIcon = getAmenityIcon(amenity);

                          return (
                            <div key={amenity} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <AmenityIcon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{amenity}</p>
                                <p className="text-xs text-muted-foreground">Premium facility</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <Separator />

                      <div className="rounded-2xl border border-border/70 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Owner contact</p>
                            <p className="mt-1 text-lg font-semibold text-foreground">{pageResponse!.turf.owner_contact.name}</p>
                          </div>
                          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Verified</div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Phone</p>
                            <p className="font-semibold text-foreground">{pageResponse!.turf.owner_contact.phone}</p>
                          </div>
                          <Button variant="outline" size="sm" asChild className="rounded-full">
                            <a href={`tel:${pageResponse!.turf.owner_contact.phone}`}>
                              <Users className="h-4 w-4" />
                              Call
                            </a>
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Reviews summary</p>
                          <div className="mt-3 flex items-center gap-2">
                            <Star className="h-5 w-5 fill-turf-gold text-turf-gold" />
                            <span className="text-xl font-bold text-foreground">{heroRating}</span>
                            <span className="text-sm text-muted-foreground">/ 5</span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{pageResponse!.turf.total_reviews} reviews from regular players.</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Venue status</p>
                          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                            <ShieldCheck className="h-4 w-4" />
                            Open for bookings
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">Instant confirmation once you lock a slot range.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.aside>
              </div>

              <div className="xl:hidden">
                <BookingSummaryCard
                  turf={pageResponse!.turf}
                  selectedSlots={selectedSlots}
                  totals={totals}
                  selectedRangeLabel={selectedRangeLabel}
                  availableCount={availableCount}
                  isBooking={isBookingBusy}
                  bookingResponse={bookingResponse}
                  onContinueBooking={handleContinueBooking}
                />
              </div>
            </motion.div>
          ) : (
            <BookingSkeleton />
          )}
        </AnimatePresence>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Booking summary</p>
            <p className="truncate text-sm font-semibold text-foreground">{selectedRangeLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(totals.grandTotal)}</p>
          </div>
          <Button size="sm" className="rounded-full px-4" disabled={selectedSlots.length === 0 || isBookingBusy} onClick={handleContinueBooking}>
            {isBookingBusy ? "Booking..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TurfDetails;
