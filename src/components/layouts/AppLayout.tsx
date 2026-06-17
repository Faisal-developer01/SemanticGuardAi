import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types/types';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar: fixed height, never scrolls */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar
          role={user.role as UserRole}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Mobile sidebar (fixed overlay) */}
      <div className="lg:hidden">
        <Sidebar
          role={user.role as UserRole}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content: only this area scrolls */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopNav onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};
