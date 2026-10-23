export function quickCallsCopy(count: number) {
  return count === 0 ? "Quick Calls — nothing to sort"
    : `${count} ${count === 1 ? "note" : "notes"} I wasn't sure where to file — pick a folder for ${count === 1 ? "it" : "them"}`;
}
