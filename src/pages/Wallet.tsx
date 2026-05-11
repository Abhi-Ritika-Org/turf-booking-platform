import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Wallet } from 'lucide-react';
import api from '@/lib/api';

type WalletData = {
  balance?: number;
  currency?: string;
  payment_methods?: Array<{ type?: string; label?: string }>;
};

export default function WalletPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, currency: 'INR', payment_methods: [] });

  useEffect(() => {
    window.scrollTo(0, 0);

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/user/wallet-summary');
        setWallet((res.data?.data || {}) as WalletData);
      } catch {
        setWallet({ balance: 0, currency: 'INR', payment_methods: [] });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Wallet & Payments</h1>
            <p className="text-foreground/60 mt-2">Manage your payments and wallet balance</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-foreground/60 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading balance...
                  </div>
                ) : (
                  <div className="text-3xl font-bold">
                    {wallet.currency === 'INR' ? '₹' : `${wallet.currency || ''} `}
                    {Number(wallet.balance || 0).toFixed(2)}
                  </div>
                )}
                <p className="text-foreground/60 text-sm mt-2">Add money to your wallet</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Your saved payment methods</CardDescription>
              </CardHeader>
              <CardContent>
                {(wallet.payment_methods || []).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-foreground/60">No payment methods added yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(wallet.payment_methods || []).map((m, idx) => (
                      <div key={idx} className="rounded-lg bg-secondary/40 p-3">
                        <p className="font-medium text-foreground">{m.label || m.type || 'Payment Method'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
