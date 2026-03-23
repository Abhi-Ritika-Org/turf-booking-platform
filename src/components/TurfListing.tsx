import { MapPin, Phone, Star, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface TurfOwner {
  name: string;
  phone: string;
}

interface Turf {
  id?: string;
  thumbnail?: string;
  name?: string;
  location?: string;
  avg_rating?: number;
  total_reviews?: number;
  price_per_hour?: number;
  sports?: string[];
  amenities?: string[];
  owner_contact?: TurfOwner;
}

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
            {turf.thumbnail ? (
              <img
                src={turf.thumbnail}
                alt={turf.name ?? "Turf thumbnail"}
                className="h-44 w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-44 w-full turf-gradient flex items-center justify-center">
                <p className="text-primary-foreground/80 text-sm">No image available</p>
              </div>
            )}

            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1">
                  {turf.name ?? "Unnamed Turf"}
                </h3>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
