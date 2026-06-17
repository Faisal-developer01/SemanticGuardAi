import React, { useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { notificationsApi, type ApiNotification } from '@/lib/api';
import { mapNotification } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { useUserNotifications } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types/types';

const typeConfig: Record<Notification['type'], { icon: React.ElementType; color: string; bg: string; border: string }> = {
  info:    { icon: Info,          color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  alert:   { icon: AlertCircle,   color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  success: { icon: CheckCircle2,  color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10',  border: 'border-green-500/20' },
};

type FilterKey = 'all' | 'unread' | Notification['type'];

const NotificationsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { data, loading, error, reload } = useAsync(() => notificationsApi.list({ perPage: 100 }), []);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [overrides, setOverrides] = useState<Record<string, { read?: boolean; removed?: boolean }>>({});
  const [live, setLive] = useState<ApiNotification[]>([]);

  // Prepend notifications that arrive over the socket while this page is open.
  useUserNotifications((n) => {
    setLive((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
  }, isAuthenticated);

  const merged: ApiNotification[] = [
    ...live,
    ...(data?.items ?? []).filter((n) => !live.some((l) => l.id === n.id)),
  ];

  const items: Notification[] = merged
    .map((n) => mapNotification(n))
    .map((n) => ({ ...n, read: overrides[n.id]?.read ?? n.read }))
    .filter((n) => !overrides[n.id]?.removed);

  const unreadCount = items.filter((n) => !n.read).length;

  const visible = items.filter((n) =>
    filter === 'all' ? true : filter === 'unread' ? !n.read : n.type === filter,
  );

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    reload();
  };
  const markRead = async (id: string) => {
    setOverrides((p) => ({ ...p, [id]: { ...p[id], read: true } }));
    try {
      await notificationsApi.markRead(id);
    } catch {
      /* optimistic; ignore */
    }
  };
  const remove = (id: string) => setOverrides((p) => ({ ...p, [id]: { ...p[id], removed: true } }));

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-balance">Notifications</h1>
              <p className="text-muted-foreground text-sm">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              <CheckCheck className="w-4 h-4 mr-2" /> Mark all read
            </Button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'unread', 'alert', 'warning', 'info', 'success'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs border transition-colors capitalize',
                filter === f
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="bg-card border border-border rounded-md p-12 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading notifications…</p>
          </div>
        ) : error ? (
          <div className="bg-card border border-destructive/30 rounded-md p-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-card border border-border rounded-md p-12 flex flex-col items-center gap-3 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No notifications</p>
            <p className="text-sm text-muted-foreground">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((n) => {
              const cfg = typeConfig[n.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-md border transition-colors cursor-pointer',
                    'bg-card hover:bg-muted/40',
                    n.read ? 'border-border opacity-70' : 'border-border',
                    !n.read && 'border-l-4 border-l-primary'
                  )}
                  onClick={() => markRead(n.id)}
                >
                  {/* Icon */}
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 border', cfg.bg, cfg.border)}>
                    <Icon className={cn('w-4 h-4', cfg.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm font-medium text-foreground text-balance', !n.read && 'font-semibold')}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); remove(n.id); }}
                          className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                          title="Dismiss"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 text-pretty">{n.message}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1.5">
                      {format(new Date(n.timestamp), 'MMM d, yyyy · HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default NotificationsPage;
