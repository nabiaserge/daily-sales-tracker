import { canCreateSales, canDeleteSales, canEditAllSales, canManageProducts } from "./permissions.mjs";

export function ownsSale(session, entry) {
  return Boolean(session?.userId && entry?.createdBy?.id === session.userId);
}

export function authorizeSalesMutation({ session, previous, products, entries }) {
  if (!canCreateSales(session)) return "forbidden";
  if (JSON.stringify(previous.products) !== JSON.stringify(products) && !canManageProducts(session)) {
    return "product_management_forbidden";
  }

  const previousByDate = new Map(previous.entries.map((entry) => [entry.date, entry]));
  const nextDates = new Set(entries.map((entry) => entry.date));
  const deletedEntries = previous.entries.filter((entry) => !nextDates.has(entry.date));

  if (canEditAllSales(session)) {
    if (deletedEntries.length && !canDeleteSales(session)) return "sale_delete_forbidden";
    return null;
  }

  if (entries.some((entry) => {
    const existing = previousByDate.get(entry.date);
    return existing && !ownsSale(session, existing);
  })) return "sale_owner_forbidden";
  if (deletedEntries.some((entry) => ownsSale(session, entry))) return "sale_delete_forbidden";

  return null;
}

export function mergeStaffSales({ session, previous, entries, timestamp }) {
  const untouched = previous.entries.filter((entry) => !ownsSale(session, entry));
  const previousByDate = new Map(previous.entries.map((entry) => [entry.date, entry]));
  const owned = entries.map((entry) => {
    const existing = previousByDate.get(entry.date);
    const units = entry.units.map(Number);
    const changed = existing && JSON.stringify(existing.units) !== JSON.stringify(units);
    return {
      date: entry.date,
      units,
      createdBy: existing?.createdBy ?? { id: session.userId, name: session.name, email: session.email },
      createdAt: existing?.createdAt ?? timestamp,
      ...(existing?.updatedBy ? { updatedBy: existing.updatedBy } : {}),
      ...(existing?.updatedAt ? { updatedAt: existing.updatedAt } : {}),
      ...(changed ? {
        updatedBy: { id: session.userId, name: session.name, email: session.email },
        updatedAt: timestamp
      } : {})
    };
  });
  return [...untouched, ...owned].sort((first, second) => second.date.localeCompare(first.date));
}
