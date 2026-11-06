import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, ShieldCheck, Send, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { useBranch } from '../context/BranchContext';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationsView() {
  const { activeBranchId, activeBranch } = useBranch();
  const [vapidKey, setVapidKey] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Fetch VAPID Public Key from server
    api
      .get('/notifications/vapid-key')
      .then((res) => {
        setVapidKey(res.publicKey || res.data?.publicKey);
      })
      .catch((err) => {
        setErrorMessage('Failed to load VAPID public key: ' + err.message);
      });

    // Check if browser has active push subscription
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const handleSubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setErrorMessage('W3C Web Push is not supported by this browser.');
      return;
    }
    if (!vapidKey) {
      setErrorMessage('Server VAPID public key not loaded yet.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // Send subscription to backend
      const subJson = sub.toJSON();
      await api.post('/notifications/subscribe', {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        branch_id: activeBranchId,
      });

      setIsSubscribed(true);
      setStatusMessage('Push notifications enabled successfully for this device!');
    } catch (err) {
      console.error('Subscription error:', err);
      setErrorMessage(err.message || 'Push permission denied or subscription error.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            W3C Web Push Notifications (VAPID)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time alerts | Branch:{' '}
            <span className="font-bold text-slate-800">{activeBranch?.branch_name}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-slate-700 font-bold">RFC 8291 / 8292</span>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Info Card */}
      <div className="light-card p-6 rounded-2xl space-y-4">
        <div>
          <h3 className="font-bold text-sm text-slate-900">Background Push Alerts for Rate Fixing</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            When Weighbridge Staff records a new fish delivery slip, the backend event bus automatically triggers
            an encrypted W3C Web Push message notifying active branch Admins and Owners—even when the app or tab is closed.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-semibold">VAPID Public Key:</span>
            <span className="font-mono text-slate-800 text-[11px] truncate max-w-xs">
              {vapidKey || 'Loading...'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-semibold">Device Push Status:</span>
            <span
              className={`font-bold ${
                isSubscribed ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {isSubscribed ? '● Active & Subscribed' : '○ Not Registered'}
            </span>
          </div>
        </div>

        <button
          onClick={handleSubscribePush}
          disabled={isLoading}
          className="touch-key w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {isLoading
            ? 'Configuring Push Service...'
            : isSubscribed
            ? 'Re-Sync Push Subscription'
            : 'Enable Real-time Web Push Alerts'}
        </button>
      </div>
    </div>
  );
}
