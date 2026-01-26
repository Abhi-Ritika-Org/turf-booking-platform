import { MapPin, Star, Trophy } from "lucide-react";
import turfHero from "@/assets/turf-hero.jpg";

export const HeroSection = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Hero Image */}
      <div className="absolute inset-0">
        <img
          src={turfHero}
          alt="Premium turf field"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-turf-dark/60 via-turf-dark/40 to-background" />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 pt-20 pb-32 md:pt-28 md:pb-40">
        <div className="max-w-2xl animate-slide-up">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 backdrop-blur-sm text-primary-foreground text-sm font-medium mb-6">
            <Trophy className="h-4 w-4" />
            Premium Turf Experience
          </div>
          
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-4 leading-tight">
            Book Your Game,
            <br />
            <span className="text-turf-accent">Own the Field</span>
          </h1>
          
          <p className="text-lg text-primary-foreground/80 mb-8 max-w-lg">
            Premium synthetic turf with floodlights, perfect for football, cricket, and more. Book your slot in seconds.
          </p>

          <div className="flex flex-wrap gap-6 text-primary-foreground/90">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-turf-accent" />
              <span className="text-sm">Central Sports Complex</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-turf-gold fill-turf-gold" />
              <span className="text-sm">4.9 Rating (500+ games)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features strip */}
      <div className="relative -mt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: "⚽", title: "FIFA Quality", desc: "Professional turf" },
              { icon: "💡", title: "Floodlights", desc: "Play till 10 PM" },
              { icon: "🚗", title: "Free Parking", desc: "Easy access" },
            ].map((feature, index) => (
              <div
                key={feature.title}
                className="glass-effect rounded-2xl p-5 turf-card-shadow animate-fade-in"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <span className="text-2xl mb-2 block">{feature.icon}</span>
                <h3 className="font-display font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
