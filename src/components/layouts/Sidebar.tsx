import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { BrandMark } from '@/components/common/Logo';
import type { UserRole } from '@/types/types';
import {
  LayoutDashboard, Users, BookOpen, Monitor, Shield, BarChart3,
  ClipboardList, Settings, LogOut, ChevronLeft, ChevronRight,
  FileText, PlusCircle, List, Eye, Bell, AlertTriangle, User,
  UserCheck, History, Camera
} from 'lucide-react';

interface NavItem { label: string; path: string; icon: React.ElementType }

const navByRole: Record<UserRole, NavItem[]> = {
  candidate: [
    { label: 'Dashboard',          path: '/candidate/dashboard',  icon: LayoutDashboard },
    { label: 'Take Assessment',    path: '/candidate/assessment', icon: BookOpen },
    { label: 'Assessment History', path: '/candidate/history',    icon: History },
    { label: 'Profile',            path: '/candidate/profile',    icon: User },
  ],
  recruiter: [
    { label: 'Dashboard',          path: '/recruiter/dashboard',         icon: LayoutDashboard },
    { label: 'Create Assessment',  path: '/recruiter/create-assessment', icon: PlusCircle },
    { label: 'Manage Questions',   path: '/recruiter/questions',         icon: List },
    { label: 'Live Monitoring',    path: '/recruiter/monitoring',        icon: Monitor },
    { label: 'AI Alert Panel',     path: '/recruiter/alerts',            icon: AlertTriangle },
    { label: 'Reports',            path: '/recruiter/reports',           icon: FileText },
  ],
  admin: [
    { label: 'Dashboard',             path: '/admin/dashboard',    icon: LayoutDashboard },
    { label: 'User Management',       path: '/admin/users',        icon: Users },
    { label: 'Assessment Management', path: '/admin/assessments',  icon: BookOpen },
    { label: 'Live Monitoring',       path: '/admin/monitoring',   icon: Monitor },
    { label: 'AI Detection',          path: '/admin/ai-detection', icon: Camera },
    { label: 'Analytics',             path: '/admin/analytics',    icon: BarChart3 },
    { label: 'Audit Logs',            path: '/admin/audit-logs',   icon: ClipboardList },
    { label: 'Settings',              path: '/admin/settings',     icon: Settings },
  ],
};

const roleIcons: Record<UserRole, React.ElementType> = {
  candidate: UserCheck,
  recruiter: Eye,
  admin:     Shield,
};

const roleLabel: Record<UserRole, string> = {
  candidate: 'Candidate',
  recruiter: 'Recruiter',
  admin:     'Administrator',
};

interface SidebarProps { role: UserRole; isOpen: boolean; onClose: () => void }

export const Sidebar: React.FC<SidebarProps> = ({ role, isOpen, onClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const navItems = navByRole[role];
  const RoleIcon = roleIcons[role];

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Deep Navy sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-200',
        'bg-sidebar border-r border-sidebar-border',
        collapsed ? 'w-14' : 'w-60',
        'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo — SemanticGuard brand mark */}
        <div className={cn(
          'flex items-center h-14 px-4 shrink-0 border-b border-sidebar-border',
          collapsed ? 'justify-center' : 'gap-2.5'
        )}>
          <BrandMark size={28} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight text-white">
                SemanticGuard
                {/* Sky Blue brand accent */}
                <span style={{ color: 'hsl(211,73%,72%)' }}> AI</span>
              </p>
              <p className="text-[10px] leading-tight" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Recruitment Integrity
              </p>
            </div>
          )}
        </div>

        {/* User info — Sky Blue role icon */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-sidebar-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(74,144,226,0.18)', border: '1px solid rgba(74,144,226,0.35)' }}
              >
                <RoleIcon className="w-3.5 h-3.5" style={{ color: 'hsl(211,73%,72%)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
                <p className="text-[10px] uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.45)' }}>{roleLabel[role]}</p>
              </div>
            </div>
          </div>
        )}

        {/* MAIN label */}
        {!collapsed && (
          <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.30)' }}>Main</p>
        )}

        {/* Nav items — Sky Blue active state */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={onClose}
              className={({ isActive }) => cn(
                'flex items-center gap-3 py-2 rounded-md mb-px transition-all duration-100 text-sm',
                collapsed ? 'justify-center px-2' : 'px-3',
                isActive
                  ? (collapsed ? 'bg-white/10 rounded-md' : 'sidebar-active')
                  : 'text-white/55 hover:text-white hover:bg-white/8'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate font-medium">{label}</span>}
            </NavLink>
          ))}

          {/* GENERAL label */}
          {!collapsed && (
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.30)' }}>General</p>
          )}

          <NavLink
            to={`/${role}/notifications`}
            onClick={onClose}
            className={({ isActive }) => cn(
              'flex items-center gap-3 py-2 rounded-md mb-px transition-all text-sm',
              collapsed ? 'justify-center px-2' : 'px-3',
              isActive
                ? (collapsed ? 'bg-white/10' : 'sidebar-active')
                : 'text-white/55 hover:text-white hover:bg-white/8'
            )}
            title={collapsed ? 'Notifications' : undefined}
          >
            <Bell className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate font-medium">Notifications</span>}
          </NavLink>
        </nav>

        {/* Logout */}
        <div className="px-2 py-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={handleLogout}
            className={cn(
              'w-full flex items-center gap-3 py-2 rounded-md transition-all text-sm text-white/45 hover:text-red-400 hover:bg-red-500/10',
              collapsed ? 'justify-center px-2' : 'px-3'
            )}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="font-medium">Logout</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3 top-14 w-6 h-6 bg-card border border-border rounded-full items-center justify-center shadow-sm hover:bg-muted transition-colors z-10"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
            : <ChevronLeft  className="w-3 h-3 text-muted-foreground" />}
        </button>
      </aside>
    </>
  );
};
