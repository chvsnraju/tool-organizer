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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-[400px] h-[400px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[320px] h-[320px] rounded-full bg-violet-500/8 blur-3xl" />
        <div className="absolute top-1/2 left-3/4 w-[200px] h-[200px] rounded-full bg-emerald-500/6 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm flex flex-col items-center gap-10 relative"
      >
        {/* Branding */}
        <div className="flex flex-col items-center gap-5">
          {/* Icon with layered glow */}
          <div className="relative">
            <div className="absolute inset-0 rounded-[28px] bg-primary/25 blur-xl scale-125" />
            <div className="relative w-[72px] h-[72px] rounded-[28px] bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary flex items-center justify-center border border-primary/20 shadow-xl shadow-primary/15">
              <Layout className="w-9 h-9" strokeWidth={1.5} />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-heading font-bold tracking-tight">ToolShed AI</h1>
            <p className="text-sm text-muted-foreground">Your smart tool inventory</p>
          </div>
        </div>

        {/* Sign-in card — M3 elevated surface */}
        <div className="w-full bg-card/85 backdrop-blur-sm rounded-3xl p-6 flex flex-col gap-5 border border-border/40"
          style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Welcome back</p>
            <p className="text-xs text-muted-foreground">Sign in to access your inventory</p>
          </div>

          {/* Google Sign-in — M3 elevated tonal button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 rounded-2xl py-3.5 px-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.14), 0 2px 12px rgba(0,0,0,0.08)' }}
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
            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-xl">
              <p className="text-xs text-destructive text-center flex-1">{error}</p>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/60 text-center">
          By continuing, you agree to our terms of service
        </p>
      </motion.div>
    </div>
  );
}
