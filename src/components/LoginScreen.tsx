import { useState, useEffect } from 'react';
import { Layout } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safety net: if the app returns from the OAuth browser but no session was
  // established (e.g. exchangeCodeForSession failed), reset the loading state
  // so the user can try again.
  useEffect(() => {
    if (!loading || !Capacitor.isNativePlatform()) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const sub = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // Give exchangeCodeForSession ~4 s to complete before resetting
        timerId = setTimeout(() => {
          setLoading(false);
          setError('Sign-in did not complete. Please try again.');
        }, 4000);
      }
    });

    // Also listen for an explicit error dispatched from the appUrlOpen handler
    const handleOAuthError = (e: Event) => {
      if (timerId) clearTimeout(timerId);
      setLoading(false);
      setError(`Sign-in failed: ${(e as CustomEvent<string>).detail}`);
    };
    window.addEventListener('oauth-error', handleOAuthError);

    return () => {
      sub.then(h => h.remove());
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('oauth-error', handleOAuthError);
    };
  }, [loading]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native Android: open system browser, redirect back via custom URL scheme
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'com.ics.toolorganizer://login-callback',
            skipBrowserRedirect: true,
          },
        });
        if (oauthError) throw oauthError;
        if (!data.url) throw new Error('No OAuth URL returned');
        await Browser.open({ url: data.url });
      } else {
        // Web browser: let Supabase redirect the current tab, session picked up on return
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (oauthError) throw oauthError;
        // Page will redirect to Google — no further action needed here
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm flex flex-col items-center gap-8"
      >
        {/* Branding */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center shadow-lg">
            <Layout className="w-10 h-10" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-heading font-bold tracking-tight">ToolShed AI</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your smart tool inventory</p>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="w-full glass rounded-2xl border border-white/20 dark:border-white/10 p-6 flex flex-col gap-4">
          <p className="text-sm text-center text-muted-foreground">
            Sign in to access your inventory
          </p>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 px-4 text-sm font-medium text-zinc-800 dark:text-zinc-100 shadow-sm active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Opening Google...' : 'Continue with Google'}
          </button>

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
