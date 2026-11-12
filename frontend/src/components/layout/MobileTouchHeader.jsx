import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Scale,
  Wifi,
  WifiOff,
  LogOut,
  ChevronDown,
  Bell,
  X,
  CheckCircle2,
  AlertCircle,
  Send,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { api } from '../../services/api';
import {
  checkPushSubscription,
  subscribeToPush,
  setAppBadgeCount,
} from '../../services/notifications';

export default function MobileTouchHeader({ isOnline = true, onSelectTab }) {
  const { user, logout } = useAuth();
  const {
    activeBranch,
    availableBranches,
    activeBranchId,
    setActiveBranchId,
    hasPermission,
  } = useBranch();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const currentRole = activeBranch?.role || 'staffAdmin';
  const canSeeRateAlerts =
    (hasPermission &&
      (hasPermission('rates:view') || hasPermission('rates:set'))) ||
    currentRole === 'owner' ||
    currentRole === 'billingAdmin';

  // Fetch entries to count pending alerts and update home screen app badge (Only for Owner & Billing)
  const { data: entries = [] } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId && canSeeRateAlerts,
  });

  const pendingRateEntries = canSeeRateAlerts
    ? entries.filter((e) => e.status === 'RATE_PENDING')
    : [];
  const alertCount = pendingRateEntries.length;

  // Update PWA App Badge on mobile home screen whenever pending count changes (Owner & Billing only)
  useEffect(() => {
    if (canSeeRateAlerts) {
      setAppBadgeCount(alertCount);
    } else {
      setAppBadgeCount(0);
    }
  }, [alertCount, canSeeRateAlerts]);

  // Check if push notifications are enabled on this device
  useEffect(() => {
    checkPushSubscription().then((subbed) => setIsSubscribed(subbed));
  }, []);

  const handleEnablePush = async () => {
    setSubscribing(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await subscribeToPush(activeBranchId);
      setIsSubscribed(true);
      setStatusMessage('Lock screen alerts enabled on this device!');
    } catch (err) {
      setErrorMessage(err.message || 'Could not enable lock screen alerts.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleSendTestPush = async () => {
    setErrorMessage('');
    setStatusMessage('');
    try {
      await api.post('/notifications/test', {
        title: 'Tally Fish Gate Alert',
        body: 'New procurement slip entered at weighbridge scale.',
        branch_id: activeBranchId,
      });
      setStatusMessage('Test notification sent! Check your phone lock screen & notifications bar.');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to send test push alert.');
    }
  };

  return (
    <>
      <header className="desktop:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3.5 py-2.5 select-none shadow-sm">
        <div className="flex items-center justify-between">
          {/* Brand & Scale Icon */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
              <Scale className="w-4 h-4 text-white stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 flex items-center gap-1 leading-none">
                TALLY FISH
              </h1>
              <span className="text-[10px] text-amber-600 font-bold tracking-wide">
                {activeBranch?.role === 'owner' ? 'OWNER PORTAL' : 'PROCUREMENT'}
              </span>
            </div>
          </div>

          {/* Right Action Icons: Branch, Alerts Bell, Status, Logout */}
          <div className="flex items-center gap-1.5">
            {/* Active Branch Pill & Switcher */}
            {availableBranches.length > 1 ? (
              <div className="relative">
                <select
                  value={activeBranchId || ''}
                  onChange={(e) => setActiveBranchId(e.target.value)}
                  className="appearance-none bg-slate-50 border border-slate-300 text-slate-800 text-[11px] font-bold rounded-lg pl-2 pr-5 py-1.5 focus:outline-none focus:border-amber-500 shadow-sm"
                >
                  {availableBranches.map((b) => (
                    <option key={b.branch_id} value={b.branch_id}>
                      {b.branch_code}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2.5 pointer-events-none" />
              </div>
            ) : (
              <div className="px-2 py-1 rounded-md bg-slate-100 border border-slate-300 text-[11px] font-bold text-slate-800">
                {activeBranch?.branch_code || 'MAIN'}
              </div>
            )}

            {/* Notification Bell Icon with Red Unread Badge - Strictly for Owner and Billing Admin */}
            {canSeeRateAlerts && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="relative p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:text-amber-800 transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {alertCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse shadow-sm">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </button>
            )}

            {/* Online / Offline Status Badge */}
            <div
              className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-bold border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-600" />
                  <span className="hidden sm:inline">ON</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-600" />
                  <span className="hidden sm:inline">OFF</span>
                </>
              )}
            </div>

            {/* Quick Sign Out */}
            <button
              onClick={logout}
              className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-rose-600 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Notifications Drawer / Slide-Over Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl border-t border-slate-200 animate-in slide-in-from-bottom duration-250">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Notifications &amp; Alerts</h3>
                  <p className="text-[11px] text-slate-500">
                    Phone lock screen, app icon &amp; status
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-4 space-y-3.5 overflow-y-auto">
              {/* Push Alerts Subscription Card */}
              <div className="light-card p-3.5 rounded-2xl bg-gradient-to-r from-amber-50/50 to-orange-50/40 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Lock Screen &amp; Phone Alerts
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isSubscribed
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    {isSubscribed ? 'Active' : 'Not Enabled'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Receive notifications on your lock screen, notification bar, and app icon badge
                  when trucks arrive or slips need pricing.
                </p>

                <div className="flex gap-2 pt-1">
                  {!isSubscribed ? (
                    <button
                      type="button"
                      disabled={subscribing}
                      onClick={handleEnablePush}
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-all text-center"
                    >
                      {subscribing ? 'Enabling...' : 'Enable Phone Alerts'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendTestPush}
                      className="flex-1 py-2 px-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-amber-600" />
                      <span>Send Test Alert to Phone</span>
                    </button>
                  )}
                </div>

                {statusMessage && (
                  <p className="text-[11px] font-semibold text-emerald-700 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{statusMessage}</span>
                  </p>
                )}
                {errorMessage && (
                  <p className="text-[11px] font-semibold text-rose-700 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </p>
                )}
              </div>

              {/* Real-time Alerts Feed */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Active Alerts ({pendingRateEntries.length})
                </span>

                {pendingRateEntries.length === 0 ? (
                  <div className="p-6 text-center light-card rounded-2xl space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <h4 className="text-xs font-bold text-slate-900">All Slips Up to Date</h4>
                    <p className="text-[11px] text-slate-500">
                      No entries waiting for rates at {activeBranch?.branch_name}.
                    </p>
                  </div>
                ) : (
                  pendingRateEntries.slice(0, 5).map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{entry.party_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {entry.vehicle_no} · {entry.net_kg} kg · #{entry.daily_sl_no || 'Slip'}
                        </div>
                      </div>
                      {onSelectTab && (
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerOpen(false);
                            onSelectTab('rates');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold text-[11px] shadow-2xs hover:bg-amber-600"
                        >
                          Set Rate →
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Close footer button */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-full py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-xs text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
