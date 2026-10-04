'use strict';

const { PRICE_LIST } = require('./receipts');

const inrFormat = new Intl.NumberFormat('en-IN');
const inr = (n) => `₹${inrFormat.format(n)}`;

/**
 * Estimate the price of a booking from the website price list.
 * Returns null when there is no fixed price (custom trips).
 */
function estimate(activity, date, people) {
  const p = PRICE_LIST[activity];
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const n = Number(people) || 1;
  if (p.weekendRate) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = day === 0 || day === 6;
    const rate = weekend ? p.weekendRate : p.rate;
    return {
      total: rate * n,
      text: `${inr(rate * n)} (${n} × ${inr(rate)} per person, ${weekend ? 'weekend' : 'weekday'} price)`,
    };
  }
  if (p.seasonalRate) {
    const rate = p.seasonalRate[Number(date.slice(5, 7))];
    return { total: null, text: `from ${inr(rate)} per room per night for that season` };
  }
  return { total: p.rate * n, text: `from ${inr(p.rate * n)} per night (${n} × ${inr(p.rate)} per person)` };
}

module.exports = { estimate, inr };
