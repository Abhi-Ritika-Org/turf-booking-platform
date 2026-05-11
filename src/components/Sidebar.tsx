import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Home,
  User,
  Calendar,
  History,
  Bell,
  Heart,
  Wallet,
  Settings,
  HelpCircle,
  Info,
  LogOut,
  ChevronDown,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AppDispatch, RootState } from '@/store';
import { logoutUser } from '@/store/authSlice';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  section: 'main' | 'account' | 'support';
  submenu?: NavItem[];
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const userName = useSelector((state: RootState) => state.auth.userName);
  const userEmail = useSelector((state: RootState) => {
    const data = state.userData as Record<string, unknown> | null;
    return (data?.email as string | undefined) || '';
  });
  const [expandedSubmenu, setExpandedSubmenu] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const firstName = userName?.trim().split(/\s+/)[0] || 'User';

  const menuItems: NavItem[] = [
    // Main Section
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="h-5 w-5" />,
      path: '/',
      section: 'main',
    },
    {
      id: 'my-bookings',
      label: 'My Bookings',
      icon: <Calendar className="h-5 w-5" />,
      path: '/bookings',
      section: 'main',
    },
    {
      id: 'booking-history',
      label: 'Booking History',
      icon: <History className="h-5 w-5" />,
      path: '/booking-history',
      section: 'main',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="h-5 w-5" />,
      path: '/notifications',
      section: 'main',
    },
    {
      id: 'favorite-turfs',
      label: 'Favorite Turfs',
      icon: <Heart className="h-5 w-5" />,
      path: '/favorites',
      section: 'main',
    },
    {
      id: 'wallet',
      label: 'Wallet & Payments',
      icon: <Wallet className="h-5 w-5" />,
      path: '/wallet',
      section: 'main',
    },
    // Account Section
    {
      id: 'profile',
      label: 'Profile',
      icon: <User className="h-5 w-5" />,
      path: '/profile',
      section: 'account',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="h-5 w-5" />,
      section: 'account',
      submenu: [
        {
          id: 'edit-profile',
          label: 'Edit Profile',
          icon: <User className="h-5 w-5" />,
          path: '/settings/profile',
          section: 'account',
        },
        {
          id: 'privacy',
          label: 'Privacy',
          icon: <Settings className="h-5 w-5" />,
          path: '/settings/privacy',
          section: 'account',
        },
        {
          id: 'notifications-settings',
          label: 'Notifications',
          icon: <Bell className="h-5 w-5" />,
          path: '/settings/notifications',
          section: 'account',
        },
        {
          id: 'security',
          label: 'Security',
          icon: <Settings className="h-5 w-5" />,
          path: '/settings/security',
          section: 'account',
        },
      ],
    },
    // Support Section
    {
      id: 'help',
      label: 'Help & Support',
      icon: <HelpCircle className="h-5 w-5" />,
      path: '/help',
      section: 'support',
    },
    {
      id: 'about',
      label: 'About Us',
      icon: <Info className="h-5 w-5" />,
      path: '/about',
      section: 'support',
    },
  ];

  const isActive = (itemPath?: string) => {
    return itemPath && location.pathname === itemPath;
  };

  const handleNavigation = (path?: string) => {
    if (path) {
      navigate(path);
      onClose();
    }
  };

  const toggleSubmenu = (itemId: string) => {
    setExpandedSubmenu(expandedSubmenu === itemId ? null : itemId);
  };

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
    onClose();
    setShowLogoutConfirm(false);
  };

  const groupedItems = {
    main: menuItems.filter((item) => item.section === 'main'),
    account: menuItems.filter((item) => item.section === 'account'),
    support: menuItems.filter((item) => item.section === 'support'),
  };

  const NavItemComponent = ({
    item,
    isSubmenu = false,
  }: {
    item: NavItem;
    isSubmenu?: boolean;
  }) => {
    const active = isActive(item.path);
    const hasSubmenu = item.submenu && item.submenu.length > 0;
    const isExpanded = expandedSubmenu === item.id;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasSubmenu) {
              toggleSubmenu(item.id);
            } else {
              handleNavigation(item.path);
            }
          }}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200',
            'hover:bg-accent/50',
            active && !hasSubmenu
              ? 'bg-gradient-to-r from-primary/20 to-primary/10 text-primary border-l-4 border-primary'
              : 'text-foreground/80 hover:text-foreground',
            isSubmenu && 'pl-8'
          )}
        >
          <div className="flex items-center gap-3">
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </div>
          {hasSubmenu && (
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          )}
        </button>
        {hasSubmenu && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.submenu?.map((subitem) => (
              <NavItemComponent key={subitem.id} item={subitem} isSubmenu />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed left-0 top-0 h-full w-80 bg-background border-r border-border z-50 flex flex-col',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0 lg:static lg:h-screen'
        )}
      >
        {/* Header with close button */}
        <div className="sticky top-0 z-10 bg-background border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <span className="text-white font-bold text-sm">TB</span>
            </div>
            <span className="font-bold text-lg">TurfBook</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <User className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{firstName}</p>
              <p className="text-sm text-foreground/60 truncate">
                {userEmail || 'user@example.com'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          {/* Main Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider px-4">
              Main
            </h3>
            <div className="space-y-1">
              {groupedItems.main.map((item) => (
                <NavItemComponent key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Account Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider px-4">
              Account
            </h3>
            <div className="space-y-1">
              {groupedItems.account.map((item) => (
                <NavItemComponent key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Support Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider px-4">
              Support
            </h3>
            <div className="space-y-1">
              {groupedItems.support.map((item) => (
                <NavItemComponent key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="p-4 bg-background border-t border-border mt-auto">
          <Button
            onClick={() => setShowLogoutConfirm(true)}
            variant="outline"
            className="w-full flex items-center justify-center gap-2 text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="relative bg-background border border-border rounded-lg p-6 shadow-lg max-w-sm w-full animate-in fade-in zoom-in">
            <h2 className="text-lg font-semibold mb-2">Confirm Logout</h2>
            <p className="text-foreground/70 mb-6">
              Are you sure you want to logout? You'll need to login again to access your account.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
