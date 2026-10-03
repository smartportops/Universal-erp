/** Calendar periods in UTC. `period` is y, q1–q4 or m1–m12. */
export function periodRange(year: number, period: string) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) year = new Date().getUTCFullYear();
  if (period === "y" || !period) return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
  const quarter = /^q([1-4])$/.exec(period);
  if (quarter) {
    const start = (Number(quarter[1]) - 1) * 3;
    return { from: new Date(Date.UTC(year, start, 1)), to: new Date(Date.UTC(year, start + 3, 1)) };
  }
  const month = /^m(1[0-2]|[1-9])$/.exec(period);
  if (month) {
    const index = Number(month[1]) - 1;
    return { from: new Date(Date.UTC(year, index, 1)), to: new Date(Date.UTC(year, index + 1, 1)) };
  }
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

export function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
