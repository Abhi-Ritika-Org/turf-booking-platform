import { Volleyball, LogOut } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { AppDispatch, RootState } from "@/store";
import { logoutUser } from "@/store/authSlice";

export const Header = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const userName = useSelector((state: RootState) => state.auth.userName);
  const firstName = userName?.trim().split(/\s+/)[0] || 'User';

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  return (
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
              Welcome {firstName}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
