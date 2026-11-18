import type { OrderFilterMode, OrderRecord } from '../types/vault';

export function getLocalDateKey(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    const d = new Date();
    d.setDate(d.getDate() + deltaDays);
    return getLocalDateKey(d);
  }
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  d.setDate(d.getDate() + deltaDays);
  return getLocalDateKey(d);
}

export function formatDateKeyDisplay(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function getOrderDateKey(order: OrderRecord): string {
  const raw = (order.pickupTime || '').trim();
  if (raw) {
    // Handle YYYY-MM-DD or YYYY-MM-DDTHH:mm without timezone suffix as local date directly
    const localPrefix = /^(\d{4}-\d{2}-\d{2})(?:$|T[^Z+-]+$)/.exec(raw);
    if (localPrefix) {
      return localPrefix[1];
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return getLocalDateKey(parsed);
    }
  }
  return getLocalDateKey(new Date(order.createdAt));
}

export function filterOrdersByMode(
  orders: OrderRecord[],
  mode: OrderFilterMode,
  dateKey: string
): OrderRecord[] {
  switch (mode) {
    case 'unreceived':
      return orders.filter((o) => !o.isReceived);
    case 'not-ready':
      return orders.filter((o) => !o.isReady && !o.isReceived);
    case 'received':
      return orders.filter((o) => Boolean(o.isReceived));
    case 'by-date':
      return orders.filter((o) => getOrderDateKey(o) === dateKey);
    case 'all':
    default:
      return orders;
  }
}

export function getOrderFilterCounts(
  orders: OrderRecord[],
  dateKey: string
): Record<OrderFilterMode, number> {
  let unreceived = 0;
  let notReady = 0;
  let received = 0;
  let byDate = 0;

  for (const o of orders) {
    if (o.isReceived) {
      received++;
    } else {
      unreceived++;
      if (!o.isReady) {
        notReady++;
      }
    }
    if (getOrderDateKey(o) === dateKey) {
      byDate++;
    }
  }

  return {
    unreceived,
    'not-ready': notReady,
    received,
    all: orders.length,
    'by-date': byDate,
  };
}
