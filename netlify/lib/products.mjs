// Realigns a units array after a product was added (appended) or removed.
export function alignUnits(previousProducts, nextProducts, units) {
  if (previousProducts.length < nextProducts.length) {
    return [...units, ...Array(nextProducts.length - previousProducts.length).fill(0)];
  }
  if (previousProducts.length > nextProducts.length) {
    const removedIndex = previousProducts.findIndex((product, index) => product !== nextProducts[index]);
    const index = removedIndex < 0 ? previousProducts.length - 1 : removedIndex;
    return units.filter((_, unitIndex) => unitIndex !== index);
  }
  return units;
}
