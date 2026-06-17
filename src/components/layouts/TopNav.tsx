import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Sun, Moon, Bell, Search } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { notificationsApi, type ApiNotification } from '@/lib/api';
import { useUserNotifications } from '@/lib/realtime';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { UserRole } from '@/types/types';

/* Role pill colours */
const roleStyles: Record<UserRole, string> = {
  candidate: 'bg-blue-50 text-primary border-blue-200',
  recruiter: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  admin:     'bg-amber-50 text-amber-700 border-amber-200',
};

const roleLabel: Record<UserRole, string> = {
  candidate: 'Candidate',
  recruiter: 'Recruiter',
  admin:     'Administrator',
};

interface TopNavProps { onMenuClick: () => void }

export const TopNav: React.FC<TopNavProps> = ({ onMenuClick }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const [recent, setRecent] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    Promise.all([notificationsApi.list({ perPage: 5 }), notificationsApi.unreadCount()])
      .then(([page, count]) => {
        if (!active) return;
        setRecent(page.items);
        setUnread(count.count);
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Live notification push: prepend new arrivals and bump the unread badge.
  useUserNotifications((n) => {
    setRecent((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 5));
    setUnread((c) => c + 1);
    toast(n.title, { description: n.message });
  }, isAuthenticated);

  return (
    /* White top bar with subtle navy shadow */
    <header
      className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0 z-30"
      style={{ boxShadow: '0 1px 4px rgba(15,45,82,0.07)' }}
    >
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </Button>

      {/* Search — Royal Blue submit button */}
      <div className="flex-1 min-w-0 max-w-sm hidden lg:flex">
        <div className="relative w-full flex items-center">
          <input
            type="text"
            placeholder="Search assessments, candidates…"
            className="w-full h-8 pl-3 pr-10 rounded-lg bg-muted/60 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-colors"
          />
          {/* Royal Blue search button */}
          <button
            className="absolute right-0.5 top-0.5 h-7 w-7 rounded-md flex items-center justify-center transition-colors"
            style={{ background: 'hsl(214,64%,34%)' }}
          >
            <Search className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Spacer pushes controls to the far right, away from the search bar */}
      <div className="flex-1" />

      {/* Role badge */}
      {user && (
        <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${roleStyles[user.role]}`}>
          {roleLabel[user.role]}
        </span>
      )}

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-lg"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 relative text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-lg">
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] rounded-full">
                {unread}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="font-semibold text-sm">Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {recent.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">No notifications</div>
          ) : (
            recent.map(n => (
              <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                <div className="flex items-center gap-2 w-full">
                  <span className="font-medium text-xs flex-1 min-w-0 truncate">{n.title}</span>
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'hsl(214,64%,34%)' }} />}
                </div>
                <span className="text-xs text-muted-foreground line-clamp-1">{n.message}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={`/${user?.role}/notifications`} className="justify-center text-xs font-medium" style={{ color: 'hsl(214,64%,34%)' }}>
              View all notifications
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 gap-2 px-2 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-lg">
            {/* Deep Navy avatar */}
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'hsl(214,68%,19%)' }}>
              <span className="text-white text-[10px] font-bold">{user?.name?.charAt(0) ?? 'U'}</span>
            </div>
            <span className="hidden md:block text-xs font-semibold text-foreground max-w-28 truncate">{user?.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={`/${user?.role}/profile`} className="text-sm">Profile</Link>
          </DropdownMenuItem>
          {user?.role === 'admin' && (
            <DropdownMenuItem asChild>
              <Link to="/admin/settings" className="text-sm">Settings</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive text-sm">
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};
