type ListKind = 'inventory' | 'locations' | 'containers' | 'lending' | 'maintenance' | 'shopping';

const DEFAULT_BATCH_SIZES: Record<ListKind, number> = {
  inventory: 40,
  locations: 30,
  containers: 40,
  lending: 30,
  maintenance: 30,
  shopping: 40,
};

const LOW_END_BATCH_SIZES: Record<ListKind, number> = {
  inventory: 24,
  locations: 16,
  containers: 24,
  lending: 20,
  maintenance: 20,
  shopping: 24,
};

const isLowEndDevice = () => {
  if (typeof window === 'undefined') return false;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 0;
  const memory = nav.deviceMemory || 0;
  const mobile = /Android|iPhone|iPad|iPod/i.test(nav.userAgent || '');

  return mobile && ((cores > 0 && cores <= 4) || (memory > 0 && memory <= 4));
};

export const getListBatchSize = (listKind: ListKind): number => {
  return isLowEndDevice() ? LOW_END_BATCH_SIZES[listKind] : DEFAULT_BATCH_SIZES[listKind];
};
