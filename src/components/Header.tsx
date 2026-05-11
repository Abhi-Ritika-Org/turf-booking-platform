import { Volleyball, Menu } from "lucide-react";
import { useSelector } from "react-redux";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import type { RootState } from "@/store";

export const Header = () => {
  const userName = useSelector((state: RootState) => state.auth.userName);
  const firstName = userName?.trim().split(/\s+/)[0] || 'User';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="turf-gradient p-2 rounded-lg">
                <Volleyball className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg text-foreground">
                TurfBook
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground/90">
                Welcome, {firstName}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="hover:bg-accent"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
};
