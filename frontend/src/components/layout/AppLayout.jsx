import React, { useState, useEffect } from 'react';
import DesktopSidebar from './DesktopSidebar';
import MobileTouchHeader from './MobileTouchHeader';
import MobileTouchNav from './MobileTouchNav';

export default function AppLayout({ children, activeTab, onSelectTab }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Desktop Sidebar (>= 1024px) - Pinned 100% height */}
      <DesktopSidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        isOnline={isOnline}
      />

      {/* Main View Area - Independent Scroll Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Mobile Header (< 1024px) */}
        <MobileTouchHeader isOnline={isOnline} />

        {/* Global Offline Warning Banner */}
        {!isOnline && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 font-bold text-xs px-4 py-2 flex items-center justify-between shrink-0">
            <span>⚠️ Operating in Offline Mode. Masters and entries will use local IndexedDB cache.</span>
            <span className="text-[10px] bg-amber-200/80 px-2 py-0.5 rounded font-semibold">Auto-sync on reconnect</span>
          </div>
        )}

        {/* Main Dynamic Content Area with mobile bottom padding to clear nav */}
        <main className="flex-1 p-3 md:p-6 pb-24 desktop:pb-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Mobile Bottom Navigation (< 1024px) */}
        <MobileTouchNav activeTab={activeTab} onSelectTab={onSelectTab} />
      </div>
    </div>
  );
}
