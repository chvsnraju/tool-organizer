import { App as CapacitorApp } from '@capacitor/app';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Camera, Settings, Home, MapPin, ShoppingCart, ArrowLeftRight } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { supabase } from './lib/supabase';
import { triggerSmartReminderSync } from './lib/notifications';
import { InventoryList } from './components/InventoryList';
import { ToastContainer } from './components/ui/Toast';
import { ToastContext, useToastState } from './hooks/useToast';
import { ErrorBoundary } from './components/ErrorBoundary';

const ScanPage = lazy(() => import('./pages/ScanPage').then(module => ({ default: module.ScanPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })));
const LocationsPage = lazy(() => import('./pages/LocationsPage').then(module => ({ default: module.LocationsPage })));
const ContainersPage = lazy(() => import('./pages/ContainersPage').then(module => ({ default: module.ContainersPage })));
const WorkAssistantPage = lazy(() => import('./pages/WorkAssistantPage').then(module => ({ default: module.WorkAssistantPage })));
const ItemDetailPage = lazy(() => import('./pages/ItemDetailPage').then(module => ({ default: module.ItemDetailPage })));
const ShoppingListPage = lazy(() => import('./pages/ShoppingListPage').then(module => ({ default: module.ShoppingListPage })));
const LendingPage = lazy(() => import('./pages/LendingPage').then(module => ({ default: module.LendingPage })));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then(module => ({ default: module.MaintenancePage })));

const PageWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
};

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInAnonymously();
      } else {
        triggerSmartReminderSync();
      }
    });

    const authListener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        triggerSmartReminderSync();
      }
    });

    // Configure status bar for native platforms
    if (Capacitor.isNativePlatform()) {
      StatusBar.setOverlaysWebView({ overlay: true });
      StatusBar.setStyle({ style: Style.Light });
    }

    // Handle Hardware Back Button
    const backListener = CapacitorApp.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack) {
        navigate(-1);
      } else {
        CapacitorApp.exitApp();
      }
    });

    const appStateListener = CapacitorApp.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
      if (isActive) {
        triggerSmartReminderSync();
      }
    });

    return () => {
      backListener.then((h) => h.remove());
      appStateListener.then((h) => h.remove());
      authListener.data.subscription.unsubscribe();
    };
  }, [navigate]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/20 dark:border-white/10"
      >
        <div className="pt-safe" />
        <div className="px-5 py-3 flex items-center justify-between">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl font-heading font-bold tracking-tight flex items-center gap-2.5"
          >
            <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
              <Layout className="w-5 h-5" />
            </span>
            ToolShed AI
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Link to="/settings" className="p-2.5 hover:bg-secondary/80 rounded-full transition-colors active:scale-95 block" aria-label="Open settings">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </Link>
          </motion.div>
        </div>
      </motion.header>

      <main className="flex-1 bg-muted/10 pt-[calc(env(safe-area-inset-top)+64px)] pb-[100px] px-safe">
        <Suspense fallback={<div className="flex items-center justify-center py-24 text-sm text-muted-foreground">Loading...</div>}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageWrapper><InventoryList /></PageWrapper>} />
              <Route path="/items/:itemId" element={<PageWrapper><ItemDetailPage /></PageWrapper>} />
              <Route path="/scan" element={<PageWrapper><ScanPage /></PageWrapper>} />
              <Route path="/settings" element={<PageWrapper><SettingsPage /></PageWrapper>} />
              <Route path="/locations" element={<PageWrapper><LocationsPage /></PageWrapper>} />
              <Route path="/locations/:locationId/containers" element={<PageWrapper><ContainersPage /></PageWrapper>} />
              <Route path="/assistant" element={<PageWrapper><WorkAssistantPage /></PageWrapper>} />
              <Route path="/shopping" element={<PageWrapper><ShoppingListPage /></PageWrapper>} />
              <Route path="/lending" element={<PageWrapper><LendingPage /></PageWrapper>} />
              <Route path="/maintenance" element={<PageWrapper><MaintenancePage /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </main>

      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 pb-safe pointer-events-none">
        <div className="mx-4 mb-4 pointer-events-auto">
          <div className="glass rounded-2xl shadow-xl shadow-black/5 border border-white/20 dark:border-white/10 flex justify-around items-center px-1 h-[68px]">
            <NavIcon to="/" icon={Home} label="Home" active={isActive('/')} />
            <NavIcon 
              to="/locations" 
              icon={MapPin} 
              label="Places" 
              active={isActive('/locations') || location.pathname.includes('/containers')} 
            />

            {/* Scan Button (Floating Prominent) */}
            <Link 
              to="/scan"
              onClick={(e) => {
                if (location.pathname === '/scan') {
                  e.preventDefault();
                  navigate('/scan', { replace: true, state: { reset: Date.now() } });
                }
              }}
              className="relative -top-6 group z-50"
            >
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                animate={{ 
                  boxShadow: isActive('/scan') 
                    ? ['0px 0px 0px rgba(99,102,241,0)', '0px 0px 0px rgba(99,102,241,0)']
                    : ['0px 0px 0px rgba(99,102,241,0.4)', '0px 0px 20px rgba(99,102,241,0.6)', '0px 0px 0px rgba(99,102,241,0.4)']
                }}
                transition={{ 
                  boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }}
                className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-colors duration-300 ${isActive('/scan') ? 'bg-[#6366f1] ring-4 ring-white dark:ring-black' : 'bg-[#6366f1] text-white ring-4 ring-white dark:ring-black'}`}
              >
                <Camera className="w-7 h-7 text-white" strokeWidth={2} />
              </motion.div>
            </Link>

            <NavIcon to="/lending" icon={ArrowLeftRight} label="Lend" active={isActive('/lending')} />
            <NavIcon to="/shopping" icon={ShoppingCart} label="Shop" active={isActive('/shopping')} />
          </div>
        </div>
      </nav>
    </div>
  );
}

function NavIcon({ to, icon: Icon, label, active }: { to: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { className?: string; strokeWidth?: number }>; label: string; active: boolean }) {
  return (
    <Link 
      to={to} 
      className={`flex flex-col items-center justify-center w-14 h-full gap-1 transition-all duration-300 active:scale-95 ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <div className={`relative p-1 rounded-xl transition-all ${active ? 'bg-primary/10' : ''}`}>
        <Icon className={`w-6 h-6 ${active ? 'fill-primary/20' : ''}`} strokeWidth={2} />
      </div>
      <span className="text-[10px] font-medium tracking-tight">{label}</span>
      {active && <span className="absolute bottom-2 w-1 h-1 rounded-full bg-primary" />}
    </Link>
  );
}

function App() {
  const toastState = useToastState();

  return (
    <ErrorBoundary>
      <ToastContext.Provider value={toastState}>
        <Router>
          <AppContent />
        </Router>
        <ToastContainer toasts={toastState.toasts} onRemove={toastState.removeToast} />
      </ToastContext.Provider>
    </ErrorBoundary>
  );
}

export default App;
