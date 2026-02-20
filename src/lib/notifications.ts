import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from './supabase';

export const SMART_REMINDERS_ENABLED_KEY = 'SMART_REMINDERS_ENABLED';
export const SMART_REMINDERS_LAST_SYNC_KEY = 'SMART_REMINDERS_LAST_SYNC';
export const SMART_REMINDERS_SYNCED_EVENT = 'smart-reminders-synced';

const NOTIFICATION_IDS = {
	maintenance: 7101,
	loans: 7102,
	stock: 7103,
};

export interface ReminderCounts {
	maintenanceDue: number;
	overdueLoans: number;
	lowStockItems: number;
}

export const isSmartRemindersEnabled = (): boolean => {
	const raw = localStorage.getItem(SMART_REMINDERS_ENABLED_KEY);
	return raw === null ? true : raw === 'true';
};

export const setSmartRemindersEnabled = (enabled: boolean) => {
	localStorage.setItem(SMART_REMINDERS_ENABLED_KEY, String(enabled));
};

export const getSmartRemindersLastSync = (): string | null => {
	return localStorage.getItem(SMART_REMINDERS_LAST_SYNC_KEY);
};

const setSmartRemindersLastSync = (timestamp: string) => {
	localStorage.setItem(SMART_REMINDERS_LAST_SYNC_KEY, timestamp);
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(SMART_REMINDERS_SYNCED_EVENT, { detail: { timestamp } }));
	}
};

export const clearSmartRemindersLastSync = () => {
	localStorage.removeItem(SMART_REMINDERS_LAST_SYNC_KEY);
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(SMART_REMINDERS_SYNCED_EVENT, { detail: { timestamp: null } }));
	}
};

const getNextReminderTime = () => {
	const now = new Date();
	const next = new Date(now);
	next.setHours(9, 0, 0, 0);

	if (next <= now) {
		next.setDate(next.getDate() + 1);
	}

	return next;
};

const hasGrantedPermission = async () => {
	const permissionResult = await LocalNotifications.checkPermissions();
	if (permissionResult.display === 'granted') return true;

	const requestResult = await LocalNotifications.requestPermissions();
	return requestResult.display === 'granted';
};

export const getReminderCounts = async (): Promise<ReminderCounts> => {
	const today = new Date().toISOString().split('T')[0];

	const [maintenanceResult, loansResult, consumablesResult] = await Promise.all([
		supabase
			.from('maintenance_reminders')
			.select('id', { count: 'exact', head: true })
			.lte('next_due', today),
		supabase
			.from('tool_loans')
			.select('expected_return_date')
			.is('returned_date', null)
			.not('expected_return_date', 'is', null),
		supabase
			.from('items')
			.select('quantity, low_stock_threshold')
			.eq('is_consumable', true),
	]);

	if (maintenanceResult.error) throw maintenanceResult.error;
	if (loansResult.error) throw loansResult.error;
	if (consumablesResult.error) throw consumablesResult.error;

	const overdueLoans = (loansResult.data || []).filter((loan) => {
		if (!loan.expected_return_date) return false;
		return new Date(loan.expected_return_date) < new Date(today);
	}).length;

	const lowStockItems = (consumablesResult.data || []).filter((item) => {
		const threshold = item.low_stock_threshold ?? 0;
		const quantity = item.quantity ?? 1;
		return threshold > 0 && quantity <= threshold;
	}).length;

	return {
		maintenanceDue: maintenanceResult.count || 0,
		overdueLoans,
		lowStockItems,
	};
};

export const syncSmartReminders = async (options?: { immediate?: boolean }) => {
	if (!Capacitor.isNativePlatform()) {
		return { scheduled: 0, counts: { maintenanceDue: 0, overdueLoans: 0, lowStockItems: 0 } };
	}

	if (!isSmartRemindersEnabled()) {
		await LocalNotifications.cancel({
			notifications: [
				{ id: NOTIFICATION_IDS.maintenance },
				{ id: NOTIFICATION_IDS.loans },
				{ id: NOTIFICATION_IDS.stock },
			],
		});
		clearSmartRemindersLastSync();
		return { scheduled: 0, counts: { maintenanceDue: 0, overdueLoans: 0, lowStockItems: 0 } };
	}

	const hasPermission = await hasGrantedPermission();
	if (!hasPermission) {
		throw new Error('Notification permission not granted.');
	}

	const { data: { user } } = await supabase.auth.getUser();
	if (!user) {
		throw new Error('Not authenticated.');
	}

	const counts = await getReminderCounts();

	await LocalNotifications.cancel({
		notifications: [
			{ id: NOTIFICATION_IDS.maintenance },
			{ id: NOTIFICATION_IDS.loans },
			{ id: NOTIFICATION_IDS.stock },
		],
	});

	const scheduleAt = options?.immediate
		? new Date(Date.now() + 5_000)
		: getNextReminderTime();

	const notifications = [] as {
		id: number;
		title: string;
		body: string;
		schedule: { at: Date };
		smallIcon?: string;
	}[];

	if (counts.maintenanceDue > 0) {
		notifications.push({
			id: NOTIFICATION_IDS.maintenance,
			title: 'Maintenance due',
			body: `${counts.maintenanceDue} tool${counts.maintenanceDue > 1 ? 's are' : ' is'} due for maintenance.`,
			schedule: { at: scheduleAt },
			smallIcon: 'ic_stat_name',
		});
	}

	if (counts.overdueLoans > 0) {
		notifications.push({
			id: NOTIFICATION_IDS.loans,
			title: 'Overdue tool loans',
			body: `${counts.overdueLoans} loan${counts.overdueLoans > 1 ? 's are' : ' is'} overdue.`,
			schedule: { at: scheduleAt },
			smallIcon: 'ic_stat_name',
		});
	}

	if (counts.lowStockItems > 0) {
		notifications.push({
			id: NOTIFICATION_IDS.stock,
			title: 'Low stock alert',
			body: `${counts.lowStockItems} consumable item${counts.lowStockItems > 1 ? 's are' : ' is'} low on stock.`,
			schedule: { at: scheduleAt },
			smallIcon: 'ic_stat_name',
		});
	}

	if (notifications.length > 0) {
		await LocalNotifications.schedule({ notifications });
	}

	setSmartRemindersLastSync(new Date().toISOString());

	return { scheduled: notifications.length, counts };
};

export const triggerSmartReminderSync = (options?: { immediate?: boolean }) => {
	void syncSmartReminders(options).catch((err) => {
		console.debug('[Smart Reminders] Sync failed (non-critical):', err);
	});
};

