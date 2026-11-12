import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BranchProvider, useBranch } from './context/BranchContext';
import AppLayout from './components/layout/AppLayout';

import LoginView from './views/LoginView';
import TodayView from './views/TodayView';
import WeighbridgeView from './views/WeighbridgeView';
import StatementView from './views/StatementView';
import RatesView from './views/RatesView';
import BillingView from './views/BillingView';
import AccountsView from './views/AccountsView';
import MastersView from './views/MastersView';
import NotificationsView from './views/NotificationsView';
import LockedSlipModal from './views/LockedSlipModal';
import { initSyncManager } from './services/syncManager';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function MainApp() {
  const { isAuthenticated } = useAuth();
  const { currentRole } = useBranch();

  const [activeTab, setActiveTab] = useState('statement');
  const [editingEntry, setEditingEntry] = useState(null);
  const [lockedModalEntry, setLockedModalEntry] = useState(null);
  const [selectedRateEntryId, setSelectedRateEntryId] = useState(null);

  // Set default tab based on the user's role upon login
  useEffect(() => {
    if (isAuthenticated && currentRole) {
      if (currentRole === 'staffAdmin') {
        setActiveTab('today');
      } else if (currentRole === 'billingAdmin') {
        setActiveTab('billing');
      } else {
        // Owner lands on statement with quick "Set rate" action
        setActiveTab('statement');
      }
    }
  }, [isAuthenticated, currentRole]);

  // Service Worker Registration for PWA Standalone & Web Push
  useEffect(() => {
    initSyncManager(queryClient);

    if ('serviceWorker' in navigator) {
      if (import.meta.env.DEV) {
        // In local development, unregister old service workers so Vite HMR and styles load fresh
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
            console.log('[PWA] Unregistered dev Service Worker:', reg.scope);
          }
        });
        // Clear old caches that may be holding unstyled HTML/CSS
        if ('caches' in window) {
          caches.keys().then((names) => {
            for (const name of names) {
              caches.delete(name);
            }
          });
        }
      } else {
        window.addEventListener('load', () => {
          navigator.serviceWorker
            .register('/sw.js')
            .then((reg) => {
              console.log('[PWA] Service Worker registered with scope:', reg.scope);
            })
            .catch((err) => {
              console.warn('[PWA] Service Worker registration failed:', err);
            });
        });
      }
    }
  }, []);

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <AppLayout activeTab={activeTab} onSelectTab={setActiveTab}>
      {/* Staff Admin Views */}
      {activeTab === 'today' && (
        <TodayView
          onNewEntry={() => {
            setEditingEntry(null);
            setActiveTab('new');
          }}
          onEditEntry={(entry) => {
            setEditingEntry(entry);
            setActiveTab('new');
          }}
          onViewLockedEntry={(entry) => setLockedModalEntry(entry)}
        />
      )}

      {activeTab === 'new' && (
        <WeighbridgeView
          editEntry={editingEntry}
          onEntryCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['entries'] });
            setEditingEntry(null);
            if (currentRole === 'owner') {
              setActiveTab('statement');
            } else if (currentRole === 'billingAdmin') {
              setActiveTab('statement');
            } else {
              setActiveTab('today');
            }
          }}
          onCancel={() => {
            setEditingEntry(null);
            if (currentRole === 'owner') {
              setActiveTab('statement');
            } else if (currentRole === 'billingAdmin') {
              setActiveTab('statement');
            } else {
              setActiveTab('today');
            }
          }}
        />
      )}

      {/* Owner & Shared Views */}
      {activeTab === 'statement' && (
        <StatementView
          onNavigateToRates={(id) => {
            setSelectedRateEntryId(id || null);
            setActiveTab('rates');
          }}
          onNewEntry={() => {
            setEditingEntry(null);
            setActiveTab('new');
          }}
          onEditEntry={(entry) => {
            setEditingEntry(entry);
            setActiveTab('new');
          }}
        />
      )}

      {activeTab === 'rates' && (
        <RatesView
          initialEntryId={selectedRateEntryId}
          onDone={() => {
            setSelectedRateEntryId(null);
            if (currentRole === 'billingAdmin') {
              setActiveTab('billing');
            } else {
              setActiveTab('statement');
            }
          }}
        />
      )}

      {activeTab === 'accounts' && <AccountsView />}

      {/* Billing Views */}
      {activeTab === 'billing' && (
        <BillingView
          onEditRates={(id) => {
            setSelectedRateEntryId(id);
            setActiveTab('rates');
          }}
          onNewEntry={() => {
            setEditingEntry(null);
            setActiveTab('new');
          }}
          onEditEntry={(entry) => {
            setEditingEntry(entry);
            setActiveTab('new');
          }}
        />
      )}

      {activeTab === 'masters' && <MastersView />}

      {activeTab === 'notifications' && <NotificationsView />}

      {/* Locked Entry Modal when clicked by staff or admin */}
      {lockedModalEntry && (
        <LockedSlipModal
          entry={lockedModalEntry}
          onClose={() => setLockedModalEntry(null)}
          onEditEntry={
            currentRole === 'owner' || currentRole === 'billingAdmin'
              ? (entry) => {
                  setEditingEntry(entry);
                  setActiveTab('new');
                }
              : null
          }
          onDeleteEntry={
            currentRole === 'owner' || currentRole === 'billingAdmin'
              ? async (entry) => {
                  if (window.confirm(`Are you sure you want to delete slip #${entry.slip_no || entry.daily_sl_no}?`)) {
                    await api.delete(`/entries/${entry.id}`);
                    await queryClient.invalidateQueries({ queryKey: ['entries'] });
                    setLockedModalEntry(null);
                  }
                }
              : null
          }
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BranchProvider>
          <MainApp />
        </BranchProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
