export function isRestorableSnapshot(snapshot) {
  const data = snapshot?.data;
  return Array.isArray(data?.products)
    && data.products.length > 0
    && data.products.every((product) => typeof product === "string" && product.trim())
    && Array.isArray(data.entries)
    && data.entries.length > 0
    && data.entries.every((entry) => typeof entry?.date === "string"
      && Array.isArray(entry.units)
      && entry.units.length === data.products.length
      && entry.units.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0));
}

export function summarizeSnapshot(snapshot, key) {
  return {
    key,
    createdAt: snapshot.createdAt,
    reason: snapshot.reason,
    actor: snapshot.actor,
    products: snapshot.data.products,
    entryCount: snapshot.data.entries.length,
    totalUnits: snapshot.data.entries.reduce(
      (sum, entry) => sum + entry.units.reduce((entrySum, value) => entrySum + Number(value), 0),
      0
    )
  };
}
