import { MapPin, Phone, Star, User, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLocalDateString } from "@/lib/turfBooking";

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
  owner_contact?: TurfOwner;
}

const getDetailState = (turf: Turf) => ({
  turf: {
    id: turf.id,
    name: turf.name,
    location: turf.location,
    avg_rating: turf.avg_rating,
    total_reviews: turf.total_reviews,
    price_per_hour: turf.price_per_hour,
    sports: turf.sports,
    amenities: turf.amenities,
    images: turf.thumbnail_url ? [turf.thumbnail_url] : [],
    thumbnail: turf.thumbnail_url,
    owner_contact: turf.owner_contact,
    owner: turf.owner_contact,
  },
});

const getDetailTarget = (turfId: string | undefined, turf: Turf) => {
  const key = turfId ?? turf.name ?? 'turf';
  const date = getLocalDateString();
  // const date = "2026-04-19"; // hardcoded date for testing purposes, replace with above line for dynamic date

  return {
    pathname: `/turfs/${key}`,
    search: `?date=${date}`,
  };
};

interface BookingsListProps {
  turfs: Turf[];
  isLoading: boolean;
  error: string | null;
}

const toCurrency = (amount: number | undefined) => {
  if (typeof amount !== "number") return "Price unavailable";
  return `Rs. ${amount.toLocaleString("en-IN")}/hour`;
};

export const BookingsList = ({ turfs, isLoading, error }: BookingsListProps) => {
  if (error) {
    return (
      <Card className="turf-card-shadow border-destructive/30">
        <CardContent className="py-10 text-center">
          <p className="font-medium text-destructive">Unable to load turf listings</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="overflow-hidden turf-card-shadow">
            <div className="h-44 bg-muted animate-pulse" />
            <CardContent className="p-4 space-y-3">
              <div className="h-5 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
              <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
                <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (turfs.length === 0) {
    return (
      <Card className="turf-card-shadow">
        <CardContent className="py-12 text-center">
          <p className="font-medium text-foreground">No turfs available right now</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please check back in a while for newly listed venues.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {turfs.map((turf, index) => {
        const key = turf.id ?? `${turf.name ?? "turf"}-${index}`;
        const rating =
          typeof turf.avg_rating === "number" ? turf.avg_rating.toFixed(1) : "N/A";
        const reviews = turf.total_reviews ?? 0;

        return (
          <Card
            key={key}
            className="overflow-hidden rounded-2xl turf-card-shadow transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:turf-card-hover"
          >
            <Link to={getDetailTarget(turf.id, turf)} state={getDetailState(turf)} className="block">
              {turf.thumbnail_url ? (
                <img
                  src={turf.thumbnail_url}
                  alt={turf.name ?? "Turf thumbnail"}
                  className="h-44 w-full object-cover transition-transform duration-500 hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-emerald-50">
                  <p className="text-sm text-primary/70">No image available</p>
                </div>
              )}
            </Link>

            <CardContent className="p-4 space-y-4">
              <div>
                <Link to={getDetailTarget(turf.id, turf)} state={getDetailState(turf)} className="group inline-block max-w-full">
                  <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1 transition-colors group-hover:text-primary">
                    {turf.name ?? "Unnamed Turf"}
                  </h3>
                </Link>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="line-clamp-1">{turf.location ?? "Location unavailable"}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  <Star className="h-3.5 w-3.5 fill-turf-gold text-turf-gold" />
                  <span>{rating}</span>
                  <span className="text-muted-foreground">({reviews} reviews)</span>
                </div>
                <p className="font-semibold text-primary">{toCurrency(turf.price_per_hour)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sports</p>
                <div className="flex flex-wrap gap-2">
                  {(turf.sports ?? []).length > 0 ? (
                    turf.sports?.map((sport) => (
                      <Badge key={sport} variant="secondary" className="bg-secondary/70">
                        {sport}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No sports listed</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amenities</p>
                <div className="flex flex-wrap gap-2">
                  {(turf.amenities ?? []).length > 0 ? (
                    turf.amenities?.map((amenity) => (
                      <Badge key={amenity} variant="outline" className="bg-background">
                        {amenity}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No amenities listed</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Owner</p>
                <div className="mt-2 space-y-1 text-sm text-foreground">
                  <p className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <span>{turf.owner_contact?.name ?? "Not provided"}</span>
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 text-primary" />
                    <span>{turf.owner_contact?.phone ?? "Not provided"}</span>
                  </p>
                </div>
              </div>

              <Button asChild className="w-full rounded-xl">
                <Link to={getDetailTarget(turf.id, turf)} state={getDetailState(turf)}>
                  View details
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
