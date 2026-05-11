import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle } from 'lucide-react';

export default function Help() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const faqs = [
    {
      question: 'How do I book a turf?',
      answer: 'Browse available turfs, select your preferred date and time, and complete the booking process.',
    },
    {
      question: 'Can I cancel my booking?',
      answer: 'Yes, you can cancel bookings from your booking history page. Cancellation policies may apply.',
    },
    {
      question: 'What is the refund policy?',
      answer: 'Refunds are processed within 5-7 business days depending on your payment method.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Help & Support</h1>
            <p className="text-foreground/60 mt-2">Find answers to common questions</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-primary" />
                    {faq.question}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground/80">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Contact Us</CardTitle>
              <CardDescription>Get in touch with our support team</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground/80">Email: support@turfbook.com</p>
              <p className="text-foreground/80">Phone: +91 XXXXXXXXXX</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
