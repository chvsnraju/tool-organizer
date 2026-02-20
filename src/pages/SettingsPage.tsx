import React, { useState, useEffect, useRef } from 'react';
import { Save, KeyRound, ShieldCheck, Loader2, Download, FileText, FileJson, Mail, User, Upload, LogOut, Bell, BellOff, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { clearSmartRemindersLastSync, getSmartRemindersLastSync, isSmartRemindersEnabled, setSmartRemindersEnabled, SMART_REMINDERS_SYNCED_EVENT, syncSmartReminders, triggerSmartReminderSync } from '../lib/notifications';
import { generateWithConfiguredProvider } from '../lib/aiClient';
import { getActiveAIProvider, getApiKeyForProvider, getDefaultModels, getProviderLabel, setActiveAIProvider, setApiKeyForProvider, type AIProvider } from '../lib/aiConfig';
import type { Workspace } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- backup data is unstructured external JSON
type BackupRecord = Record<string, any>;

interface BackupPayload {
  version: number;
  app: string;
  exported_at: string;
  data: {
    locations?: BackupRecord[];
    containers?: BackupRecord[];
    items?: BackupRecord[];
    shopping_list?: BackupRecord[];
    tool_loans?: BackupRecord[];
    maintenance_reminders?: BackupRecord[];
  };
}

export const SettingsPage: React.FC = () => {
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [accountEmail, setAccountEmail] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isAnonymousUser, setIsAnonymousUser] = useState(true);
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [smartRemindersEnabled, setSmartRemindersEnabledState] = useState(true);
  const [syncingReminders, setSyncingReminders] = useState(false);
  const [lastReminderSync, setLastReminderSync] = useState<string | null>(null);
  const [totalAssetValue, setTotalAssetValue] = useState<number | null>(null);
  
  // Workspaces
  const [workspaces, setWorkspaces] = useState<(Workspace & { role?: string })[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [joinWorkspaceId, setJoinWorkspaceId] = useState('');
  const [joining, setJoining] = useState(false);

  const backupInputRef = useRef<HTMLInputElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const providerPlaceholder: Record<AIProvider, string> = {
    gemini: 'AIzaSy...',
    openai: 'sk-...',
    anthropic: 'sk-ant-...',
  };

  const loadAccountState = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserEmail(user?.email ?? null);
      setIsAnonymousUser((user as unknown as { is_anonymous?: boolean })?.is_anonymous ?? !user?.email);
      if (user?.email) {
        setAccountEmail(user.email);
      }
      
      // Load Workspaces
      if (user) {
        loadWorkspaces(user.id);
      } else {
        setLoadingWorkspaces(false);
      }
    } finally {
      setLoadingAccount(false);
    }
  };

  const loadWorkspaces = async (userId: string) => {
    setLoadingWorkspaces(true);
    const { data, error } = await supabase.from('workspace_members')
      .select(`
        role,
        workspace:workspaces (
          id,
          name,
          owner_id,
          created_at
        )
      `)
      .eq('user_id', userId);

    if (!error && data) {
      const formatted = data.map((item: any) => ({
        ...item.workspace,
        role: item.role
      }));
      setWorkspaces(formatted);
    }
    setLoadingWorkspaces(false);
  };

  useEffect(() => {
    const activeProvider = getActiveAIProvider();
    setProvider(activeProvider);
    setApiKey(getApiKeyForProvider(activeProvider));
    setSmartRemindersEnabledState(isSmartRemindersEnabled());
    setLastReminderSync(getSmartRemindersLastSync());

    loadAccountState();

    const loadAssetValue = async () => {
      try {
        const { data, error } = await supabase.from('items').select('purchase_price, quantity');
        if (error) throw error;
        let total = 0;
        data?.forEach(item => {
          if (item.purchase_price) {
            total += Number(item.purchase_price) * (item.quantity || 1);
          }
        });
        setTotalAssetValue(total);
      } catch (e) {
        console.error('Failed to load asset value', e);
      }
    };
    loadAssetValue();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadAccountState();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setApiKey(getApiKeyForProvider(provider));
    setTestStatus('idle');
    setTestMessage('');
  }, [provider]);

  useEffect(() => {
    const handleRemindersSynced = () => {
      setLastReminderSync(getSmartRemindersLastSync());
    };

    window.addEventListener(SMART_REMINDERS_SYNCED_EVENT, handleRemindersSynced);

    return () => {
      window.removeEventListener(SMART_REMINDERS_SYNCED_EVENT, handleRemindersSynced);
    };
  }, []);

  const handleSave = () => {
    setActiveAIProvider(provider);
    setApiKeyForProvider(provider, apiKey.trim());
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    const trimmedKey = apiKey.trim();
    setTestStatus('testing');
    setTestMessage(`Testing ${getProviderLabel(provider)}...`);
    try {
      if (!trimmedKey) throw new Error('Please enter a key first');

      const modelsToTest = getDefaultModels(provider);
      let successModel = '';
      let lastError: unknown = null;

      for (const modelName of modelsToTest) {
        try {
          setTestMessage(`Testing ${modelName}...`);
          const result = await generateWithConfiguredProvider({
            provider,
            apiKey: trimmedKey,
            modelCandidates: [modelName],
            prompt: "Reply with exactly: OK",
          });

          if (!result.text.toUpperCase().includes('OK')) {
            throw new Error(`Unexpected response from ${modelName}`);
          }

          successModel = modelName;
          break;
        } catch (error) {
          console.warn(`${modelName} failed`, error);
          lastError = error;
        }
      }

      if (!successModel) {
        throw (lastError instanceof Error ? lastError : new Error('No model succeeded'));
      }

      setTestMessage(`Success! Connected to ${getProviderLabel(provider)} using ${successModel}.`);
      setTestStatus('success');

    } catch (e: unknown) {
      console.error(e);
      setTestStatus('error');

      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('404') || msg.includes('not found')) {
         setTestMessage('Error: Model not found (404). Verify provider/model mapping and your account access for this provider.');
      } else {
         setTestMessage(`Error: ${msg}`);
      }
    }
  };

  const exportInsurancePDF = async () => {
    try {
      const { data: items, error } = await supabase
        .from('items')
        .select('name, category, purchase_date, purchase_price, quantity, condition')
        .not('purchase_price', 'is', null)
        .order('name');
        
      if (error) throw error;
      if (!items || items.length === 0) {
        addToast('No items with a purchase price found to export. Add prices to items first.', 'info');
        return;
      }
      
      const total = items.reduce((sum, item) => sum + (Number(item.purchase_price) * (item.quantity || 1)), 0);
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      
      const html = `
        <html>
          <head>
            <title>Insurance Inventory Report</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #333; }
              h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 5px; }
              .meta { color: #666; font-size: 0.9em; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { text-align: left; padding: 12px; border-bottom: 1px solid #ddd; font-size: 0.9em; }
              th { background-color: #f8f9fa; font-weight: 600; color: #444; }
              .total { font-size: 1.5rem; font-weight: bold; margin-top: 30px; text-align: right; color: #111; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <h1>Tool Inventory - Valuations</h1>
            <div class="meta">Generated on ${new Date().toLocaleDateString()}</div>
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Condition</th>
                  <th>Purchase Date</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td><strong>${item.name || 'Unknown'}</strong></td>
                    <td>${item.category || '-'}</td>
                    <td>${item.condition || '-'}</td>
                    <td>${item.purchase_date ? new Date(item.purchase_date).toLocaleDateString() : '-'}</td>
                    <td>${item.quantity || 1}</td>
                    <td>$${Number(item.purchase_price).toFixed(2)}</td>
                    <td>$${(Number(item.purchase_price) * (item.quantity || 1)).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="total">Total Insured Value: $${total.toFixed(2)}</div>
            <script>window.print();</script>
          </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (e) {
      addToast('Failed to generate Insurance Report', 'error');
    }
  };

  const exportInventory = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const { data: items, error } = await supabase
        .from('items')
        .select(`
          *,
          container:containers(name, location:locations(name))
        `)
        .order('name');

      if (error) throw error;
      if (!items || items.length === 0) {
        addToast('No items to export.', 'info');
        return;
      }

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'csv') {
        const headers = ['Name', 'Description', 'Category', 'Tags', 'Condition', 'Quantity', 'Estimated Price', 'Location', 'Container', 'Created At', 'Favorite', 'Consumable'];
        const rows = items.map(item => {
          const location = item.container?.location?.name || '';
          const container = item.container?.name || '';
          return [
            `"${(item.name || '').replace(/"/g, '""')}"`,
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.category || '',
            (item.tags || []).join('; '),
            item.condition || '',
            item.quantity || 1,
            item.estimated_price || '',
            location,
            container,
            item.created_at,
            item.is_favorite ? 'Yes' : 'No',
            item.is_consumable ? 'Yes' : 'No',
          ].join(',');
        });
        content = [headers.join(','), ...rows].join('\n');
        filename = `tool-inventory-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else {
        const exportData = items.map(item => ({
          name: item.name,
          description: item.description,
          category: item.category,
          tags: item.tags,
          condition: item.condition,
          quantity: item.quantity,
          estimated_price: item.estimated_price,
          location: item.container?.location?.name || null,
          container: item.container?.name || null,
          specs: item.specs,
          is_favorite: item.is_favorite,
          is_consumable: item.is_consumable,
          image_url: item.image_url,
          created_at: item.created_at,
        }));
        content = JSON.stringify(exportData, null, 2);
        filename = `tool-inventory-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      }

      // Trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast(`Exported ${items.length} items as ${format.toUpperCase()}!`, 'success');
    } catch (err) {
      addToast('Export failed: ' + (err as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const sendMagicLink = async () => {
    const email = accountEmail.trim();
    if (!email) {
      addToast('Enter your email first.', 'info');
      return;
    }

    setSendingMagicLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      addToast('Magic link sent. Open your email to complete account upgrade/sign-in.', 'success');
    } catch (error) {
      addToast('Failed to send magic link: ' + (error as Error).message, 'error');
    } finally {
      setSendingMagicLink(false);
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      addToast('Signed out. A fresh anonymous session will be created automatically.', 'success');
    } catch (error) {
      addToast('Failed to sign out: ' + (error as Error).message, 'error');
    }
  };

  const handleJoinWorkspace = async () => {
    const id = joinWorkspaceId.trim();
    if (!id) {
      addToast('Please enter a workspace ID.', 'info');
      return;
    }

    setJoining(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to join a workspace.');

      // Check if workspace exists
      const { data: wsData, error: wsError } = await supabase.from('workspaces').select('id, name').eq('id', id).single();
      if (wsError || !wsData) throw new Error('Workspace not found or invalid ID.');

      // Check if already a member
      if (workspaces.some(w => w.id === id)) {
        throw new Error('You are already a member of this workspace.');
      }

      // Join
      const { error: joinError } = await supabase.from('workspace_members').insert({
        workspace_id: id,
        user_id: user.id,
        role: 'member',
      });
      if (joinError) throw joinError;

      addToast(`Successfully joined workspace: ${wsData.name}!`, 'success');
      setJoinWorkspaceId('');
      loadWorkspaces(user.id);
    } catch (error) {
      addToast('Failed to join workspace: ' + (error as Error).message, 'error');
    } finally {
      setJoining(false);
    }
  };

  const handleToggleSmartReminders = async (enabled: boolean) => {
    setSmartRemindersEnabledState(enabled);
    setSmartRemindersEnabled(enabled);

    if (!enabled) {
      clearSmartRemindersLastSync();
      addToast('Smart reminders disabled.', 'info');
      return;
    }

    try {
      setSyncingReminders(true);
      const result = await syncSmartReminders();
      setLastReminderSync(getSmartRemindersLastSync());
      addToast(`Smart reminders enabled. ${result.scheduled} reminder(s) scheduled.`, 'success');
    } catch (error) {
      addToast('Could not enable reminders: ' + (error as Error).message, 'error');
    } finally {
      setSyncingReminders(false);
    }
  };

  const handleSyncRemindersNow = async () => {
    try {
      setSyncingReminders(true);
      const result = await syncSmartReminders();
      setLastReminderSync(getSmartRemindersLastSync());
      addToast(
        `Synced reminders: ${result.counts.maintenanceDue} maintenance, ${result.counts.overdueLoans} overdue loans, ${result.counts.lowStockItems} low stock.`,
        'success'
      );
    } catch (error) {
      addToast('Reminder sync failed: ' + (error as Error).message, 'error');
    } finally {
      setSyncingReminders(false);
    }
  };

  const exportFullBackup = async () => {
    setExportingBackup(true);
    try {
      const [
        locationsResult,
        containersResult,
        itemsResult,
        shoppingResult,
        loansResult,
        maintenanceResult,
      ] = await Promise.all([
        supabase.from('locations').select('id, name, description, image_url, created_at').order('created_at', { ascending: true }),
        supabase.from('containers').select('id, name, description, image_url, location_id, created_at').order('created_at', { ascending: true }),
        supabase.from('items').select('id, name, description, category, tags, image_url, images, container_id, location_id, product_url, user_description, specs, quantity, condition, is_favorite, is_consumable, low_stock_threshold, estimated_price, manual_url, video_url, created_at').order('created_at', { ascending: true }),
        supabase.from('shopping_list').select('tool_name, estimated_price, notes, purchased, created_at').order('created_at', { ascending: true }),
        supabase.from('tool_loans').select('borrower_name, borrowed_date, expected_return_date, returned_date, notes, item_id, created_at').order('created_at', { ascending: true }),
        supabase.from('maintenance_reminders').select('task_description, interval_days, last_performed, next_due, is_recurring, item_id, created_at').order('created_at', { ascending: true }),
      ]);

      const firstError = [
        locationsResult.error,
        containersResult.error,
        itemsResult.error,
        shoppingResult.error,
        loansResult.error,
        maintenanceResult.error,
      ].find(Boolean);

      if (firstError) throw firstError;

      const payload: BackupPayload = {
        version: 1,
        app: 'ToolShed AI',
        exported_at: new Date().toISOString(),
        data: {
          locations: locationsResult.data || [],
          containers: containersResult.data || [],
          items: itemsResult.data || [],
          shopping_list: shoppingResult.data || [],
          tool_loans: loansResult.data || [],
          maintenance_reminders: maintenanceResult.data || [],
        },
      };

      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `toolshed-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      const total = (payload.data.locations?.length || 0)
        + (payload.data.containers?.length || 0)
        + (payload.data.items?.length || 0)
        + (payload.data.shopping_list?.length || 0)
        + (payload.data.tool_loans?.length || 0)
        + (payload.data.maintenance_reminders?.length || 0);

      addToast(`Backup exported (${total} records).`, 'success');
    } catch (error) {
      addToast('Backup export failed: ' + (error as Error).message, 'error');
    } finally {
      setExportingBackup(false);
    }
  };

  const restoreFromBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoringBackup(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileText = await file.text();
      let payload: BackupPayload;
      try {
        payload = JSON.parse(fileText) as BackupPayload;
      } catch {
        throw new Error('Invalid backup file: the file does not contain valid JSON.');
      }

      if (!payload?.data || typeof payload.data !== 'object') {
        throw new Error('Invalid backup file format.');
      }

      const locationIdMap = new Map<string, string>();
      const containerIdMap = new Map<string, string>();
      const itemIdMap = new Map<string, string>();

      let restoredCount = 0;

      for (const location of payload.data.locations || []) {
        const { data, error } = await supabase.from('locations').insert({
          name: location.name,
          description: location.description || null,
          image_url: location.image_url || null,
          user_id: user.id,
        }).select('id').single();
        if (error) throw error;
        if (location.id) locationIdMap.set(location.id, data.id);
        restoredCount += 1;
      }

      for (const container of payload.data.containers || []) {
        const mappedLocationId = container.location_id ? locationIdMap.get(container.location_id) ?? null : null;
        const { data, error } = await supabase.from('containers').insert({
          name: container.name,
          description: container.description || null,
          image_url: container.image_url || null,
          location_id: mappedLocationId,
          user_id: user.id,
        }).select('id').single();
        if (error) throw error;
        if (container.id) containerIdMap.set(container.id, data.id);
        restoredCount += 1;
      }

      for (const item of payload.data.items || []) {
        const mappedContainerId = item.container_id ? containerIdMap.get(item.container_id) ?? null : null;
        const mappedLocationId = item.location_id ? locationIdMap.get(item.location_id) ?? null : null;

        const { data, error } = await supabase.from('items').insert({
          name: item.name,
          description: item.description || null,
          category: item.category || null,
          tags: Array.isArray(item.tags) ? item.tags : [],
          image_url: item.image_url || null,
          images: Array.isArray(item.images) ? item.images : (item.image_url ? [item.image_url] : []),
          container_id: mappedContainerId,
          location_id: mappedLocationId,
          product_url: item.product_url || null,
          user_description: item.user_description || null,
          specs: item.specs || {},
          quantity: typeof item.quantity === 'number' ? item.quantity : 1,
          condition: item.condition || 'good',
          is_favorite: !!item.is_favorite,
          is_consumable: !!item.is_consumable,
          low_stock_threshold: typeof item.low_stock_threshold === 'number' ? item.low_stock_threshold : 0,
          estimated_price: item.estimated_price || null,
          manual_url: item.manual_url || null,
          video_url: item.video_url || null,
          user_id: user.id,
        }).select('id').single();

        if (error) throw error;
        if (item.id) itemIdMap.set(item.id, data.id);
        restoredCount += 1;
      }

      const shoppingRows = (payload.data.shopping_list || []).map((entry) => ({
        tool_name: entry.tool_name,
        estimated_price: entry.estimated_price || null,
        notes: entry.notes || null,
        purchased: !!entry.purchased,
        user_id: user.id,
      }));

      if (shoppingRows.length > 0) {
        const { error } = await supabase.from('shopping_list').insert(shoppingRows);
        if (error) throw error;
        restoredCount += shoppingRows.length;
      }

      const loanRows = (payload.data.tool_loans || [])
        .map((loan) => {
          const mappedItemId = loan.item_id ? itemIdMap.get(loan.item_id) : null;
          if (!mappedItemId) return null;

          return {
            item_id: mappedItemId,
            borrower_name: loan.borrower_name,
            borrowed_date: loan.borrowed_date,
            expected_return_date: loan.expected_return_date || null,
            returned_date: loan.returned_date || null,
            notes: loan.notes || null,
            user_id: user.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (loanRows.length > 0) {
        const { error } = await supabase.from('tool_loans').insert(loanRows);
        if (error) throw error;
        restoredCount += loanRows.length;
      }

      const maintenanceRows = (payload.data.maintenance_reminders || [])
        .map((reminder) => {
          const mappedItemId = reminder.item_id ? itemIdMap.get(reminder.item_id) : null;
          if (!mappedItemId) return null;

          return {
            item_id: mappedItemId,
            task_description: reminder.task_description,
            interval_days: typeof reminder.interval_days === 'number' ? reminder.interval_days : null,
            last_performed: reminder.last_performed || null,
            next_due: reminder.next_due || null,
            is_recurring: !!reminder.is_recurring,
            user_id: user.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (maintenanceRows.length > 0) {
        const { error } = await supabase.from('maintenance_reminders').insert(maintenanceRows);
        if (error) throw error;
        restoredCount += maintenanceRows.length;
      }

      triggerSmartReminderSync();

      addToast(`Restore complete. Imported ${restoredCount} records.`, 'success');
    } catch (error) {
      addToast('Restore failed: ' + (error as Error).message, 'error');
    } finally {
      if (backupInputRef.current) {
        backupInputRef.current.value = '';
      }
      setRestoringBackup(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto pb-24 space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage AI connectivity and app preferences.</p>
      </div>

      {/* API Key */}
      <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="w-4 h-4 text-primary" />
          AI Provider & API Key
        </div>

        <label className="block">
          <span className="text-xs text-muted-foreground">Provider</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as AIProvider)}
            className="mt-1 block w-full px-3 py-2.5 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
        </label>

        <label className="block">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="mt-1 block w-full px-3 py-2.5 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
            placeholder={providerPlaceholder[provider]}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Required for image identification and work planning. Stored locally for {getProviderLabel(provider)}.
          </p>
        </label>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </button>

          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-60 whitespace-nowrap transition-colors flex items-center gap-2"
          >
            {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
            Test
          </button>
        </div>

        {saved && (
          <p className="text-sm text-center text-primary flex items-center justify-center gap-1">
            <ShieldCheck className="w-4 h-4" /> Settings saved
          </p>
        )}

        {testStatus !== 'idle' && (
          <div className={`p-3 rounded-lg text-xs break-words border ${
            testStatus === 'success'
              ? 'bg-primary/10 text-primary border-primary/20'
              : testStatus === 'error'
                ? 'bg-destructive/10 text-destructive border-destructive/20'
                : 'bg-secondary text-secondary-foreground border-border'
          }`}>
            {testStatus === 'testing' ? 'Testing connection...' : testMessage}
          </div>
        )}
      </div>

      {/* Account Upgrade / Sync */}
      <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <User className="w-4 h-4 text-primary" />
          Account & Sync
        </div>

        {loadingAccount ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking account state...
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              Current session: {isAnonymousUser ? 'Anonymous' : 'Email account'}
            </p>
            {currentUserEmail && (
              <p className="text-foreground/80">Signed in as: {currentUserEmail}</p>
            )}
          </div>
        )}

        <label className="block">
          <input
            type="email"
            value={accountEmail}
            onChange={(event) => setAccountEmail(event.target.value)}
            className="mt-1 block w-full px-3 py-2.5 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none"
            placeholder="you@example.com"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Send a magic link to upgrade/sign in with email on this device.
          </p>
        </label>

        <div className="flex gap-2">
          <button
            onClick={sendMagicLink}
            disabled={sendingMagicLink}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {sendingMagicLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send Magic Link
          </button>

          <button
            onClick={signOut}
            className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Workspaces */}
      <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-violet-500" />
            Shared Workspaces
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Manage access to your data. Share your Workspace ID to let others view and modify your tool shed.
        </p>

        {loadingWorkspaces ? (
           <div className="text-xs text-muted-foreground flex items-center gap-2">
             <Loader2 className="w-4 h-4 animate-spin" /> Loading workspaces...
           </div>
        ) : workspaces.length === 0 ? (
          <div className="text-xs text-muted-foreground">No workspaces found.</div>
        ) : (
          <div className="space-y-3">
            {workspaces.map(ws => (
              <div key={ws.id} className="p-3 bg-muted/50 border border-border/80 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{ws.name}</p>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                    {ws.role}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                  <input 
                    readOnly
                    value={ws.id}
                    className="flex-1 bg-background border border-border px-2 py-1 text-xs rounded-md text-muted-foreground outline-none font-mono"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(ws.id);
                      addToast('Workspace ID copied to clipboard!', 'success');
                    }}
                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Copy invite ID
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t space-y-3">
          <p className="text-xs font-semibold">Join a Workspace</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste Workspace ID..."
              value={joinWorkspaceId}
              onChange={(e) => setJoinWorkspaceId(e.target.value)}
              className="flex-1 bg-background border border-border px-3 py-2 text-sm rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            />
            <button
              onClick={handleJoinWorkspace}
              disabled={joining || !joinWorkspaceId.trim() || isAnonymousUser}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm font-medium whitespace-nowrap"
            >
              {joining ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Join'}
            </button>
          </div>
          {isAnonymousUser && (
            <p className="text-[10px] text-destructive">You must be signed into an email account to join shared workspaces.</p>
          )}
        </div>
      </div>

      {/* Smart Reminders */}
      <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          {smartRemindersEnabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          Smart Reminders
        </div>

        <p className="text-xs text-muted-foreground">
          Local notifications for maintenance due, overdue loans, and low-stock consumables.
        </p>

        <label className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-background/50">
          <span className="text-sm">Enable smart reminders</span>
          <input
            type="checkbox"
            checked={smartRemindersEnabled}
            onChange={(event) => handleToggleSmartReminders(event.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
        </label>

        <button
          onClick={handleSyncRemindersNow}
          disabled={!smartRemindersEnabled || syncingReminders}
          className="w-full px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {syncingReminders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          Sync Reminders Now
        </button>

        <p className="text-xs text-muted-foreground">
          Last sync: {lastReminderSync ? new Date(lastReminderSync).toLocaleString() : 'Never'}
        </p>
      </div>

      {/* Insurance & Valuation */}
      <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Insurance & Valuation
        </div>
        
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Asset Value</p>
            <p className="text-2xl font-bold text-foreground">
              {totalAssetValue !== null ? `$${totalAssetValue.toFixed(2)}` : '...'}
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-emerald-500/50" />
        </div>

        <button
          onClick={exportInsurancePDF}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
        >
          <FileText className="w-4 h-4" />
          Generate Insurance Report (PDF)
        </button>
      </div>

      {/* Export / Share */}
      <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Download className="w-4 h-4 text-primary" />
          Export Inventory
        </div>
        <p className="text-xs text-muted-foreground">Download your entire tool inventory for backup or sharing.</p>

        <div className="flex gap-2">
          <button
            onClick={() => exportInventory('csv')}
            disabled={exporting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            CSV
          </button>
          <button
            onClick={() => exportInventory('json')}
            disabled={exporting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            JSON
          </button>
        </div>

        <div className="border-t pt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Full backup includes locations, containers, items, loans, maintenance, and shopping list.
          </p>

          <div className="flex gap-2">
            <button
              onClick={exportFullBackup}
              disabled={exportingBackup}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 rounded-lg hover:bg-violet-500/20 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {exportingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Full Backup
            </button>

            <button
              onClick={() => backupInputRef.current?.click()}
              disabled={restoringBackup}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {restoringBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Restore Backup
            </button>

            <input
              ref={backupInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={restoreFromBackup}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
