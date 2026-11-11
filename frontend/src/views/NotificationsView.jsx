import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, ShieldCheck, Send, AlertTriangle, BellRing, Lock, Smartphone } from 'lucide-react';
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

  const isSecure = typeof window !== 'undefined' && window.isSecureContext;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

  const handleSubscribePush = async () => {
    if (!isSecure) {
      setErrorMessage(
        'HTTPS Required: Mobile browsers disable Web Push when accessed over unencrypted HTTP (http://...). Please access the app using https:// to enable push alerts.'
      );
      return;
    }

    if (isIOS && !isStandalone) {
      setErrorMessage(
        'iPhone / iPad Notice: Apple requires adding the app to your Home Screen before Push notifications can be enabled. Tap Safari Share (square with arrow) -> "Add to Home Screen", open the app from your home screen, and tap Enable Alerts.'
      );
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setErrorMessage(
        'Web Push is not supported by this browser. If opened inside an app (e.g., WhatsApp or Gmail), please tap the menu and choose "Open in Chrome" or "Open in Safari".'
      );
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

  const [testingAlert, setTestingAlert] = useState(false);

  const handleTestLocalNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setErrorMessage('Browser desktop/phone notification API is not supported in this browser window.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('TallyFish Alert (Test)', {
          body: 'Rate Pending: Coastal Catchers Ltd - 13 kg CHAMBAN waiting for owner rate confirmation.',
          icon: '/favicon.ico',
        });
        setStatusMessage('Local browser notification displayed on your device!');
      } else {
        setErrorMessage('Notification permission was denied. Please allow notifications in browser site settings.');
      }
    } catch (e) {
      setErrorMessage('Local notification error: ' + e.message);
    }
  };

  const handleSendTestAlert = async (delaySeconds = 0) => {
    setTestingAlert(true);
    setErrorMessage('');
    try {
      const res = await api.post('/notifications/test', { delaySeconds });
      setStatusMessage(res.message || 'Test alert sent to your device!');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to send test alert');
    } finally {
      setTestingAlert(false);
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

        {!isSecure && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>HTTPS Secure Connection Required for Mobile Web Push</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-800">
              You are currently accessing via unencrypted <code>http://</code>. Modern mobile browsers (Chrome, Edge, Safari) strictly disable Web Push and Service Workers unless accessed over <strong>https://</strong> (or localhost). Please access via HTTPS or an SSL tunnel to enable lock screen push alerts on mobile.
            </p>
          </div>
        )}

        {isIOS && !isStandalone && (
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-900 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-blue-700 shrink-0" />
              <span>iPhone / iPad Setup Required</span>
            </div>
            <p className="text-[11px] leading-relaxed text-blue-800">
              Apple requires adding the app to your Home Screen before Push notifications can be enabled:
              Tap Safari&apos;s <strong>Share</strong> button (box with upward arrow) &rarr; select <strong>&quot;Add to Home Screen&quot;</strong> &rarr; open TallyFish from your Home Screen &rarr; tap Enable Alerts.
            </p>
          </div>
        )}

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

        <div className="pt-1">
          <button
            type="button"
            onClick={handleTestLocalNotification}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 flex items-center justify-center gap-2 transition-colors"
          >
            <BellRing className="w-4 h-4 text-slate-600" />
            <span>Test Immediate In-Browser Alert</span>
          </button>
        </div>

        {/* Live Phone Testing Controls */}
        {isSubscribed && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Test Phone Notifications (Lock Screen &amp; Status Bar)
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSendTestAlert(0)}
                disabled={testingAlert}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-200"
              >
                <BellRing className="w-4 h-4 text-amber-600" />
                <span>Instant Phone Alert Test</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendTestAlert(5)}
                disabled={testingAlert}
                className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-amber-300"
              >
                <Lock className="w-4 h-4 text-amber-700" />
                <span>Test Lock Screen (in 5 sec)</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-normal bg-slate-50 p-3 rounded-xl border border-slate-200/70">
              📱 <strong>How to test on Lock Screen:</strong> Tap <em>"Test Lock Screen (in 5 sec)"</em> and immediately press your phone's power button to lock the screen. In 5 seconds, your phone will chime/vibrate and display the alert on your lock screen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
