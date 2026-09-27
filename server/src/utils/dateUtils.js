export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function todayISO() {
  return toISODate(new Date());
}

export function nextNDates(startISO, n) {
  const start = startISO ? parseISODate(startISO) : new Date();
  const dates = [];
  for (let i = 0; i < n; i++) {
    dates.push(toISODate(addDays(start, i)));
  }
  return dates;
}

export function generateBatchId() {
  return `${todayISO()}-${Date.now()}`;
}
