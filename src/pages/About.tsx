import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

export default function About() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">About TurfBook</h1>
            <p className="text-foreground/60 mt-2">Your trusted platform for booking sports grounds</p>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  About Us
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-foreground/80">
                  TurfBook is a modern platform designed to make booking sports grounds easy and convenient.
                </p>
                <p className="text-foreground/80">
                  We connect sports enthusiasts with premium turf facilities across the city.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Our Mission</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">
                  To make sports ground booking hassle-free and accessible to everyone.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Version Information</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/80">App Version: 1.0.0</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
