const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', KR: 'KRW', JP: 'JPY', CN: 'CNY', IN: 'INR', MX: 'MXN',
  BR: 'BRL', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', SG: 'SGD', PH: 'PHP', ZA: 'ZAR',
};

export function currencyFor(locale: string): string {
  const region = locale.split('-')[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || 'USD';
}

export function formatMoney(cents: number | null | undefined, locale = 'en-US'): string {
  if (cents === null || cents === undefined) return '—';
  const currency = currencyFor(locale);
  const zeroDecimal = currency === 'KRW' || currency === 'JPY';
  // Prices are stored as hundredths of the currency unit (cents), also for won and yen.
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: zeroDecimal ? 0 : 2 }).format(cents / 100);
}

export function compactNumber(n: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { notation: n >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Simple token normalization for search ("strawberries" ~ "strawberry"). */
export function searchTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9%]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 ? t.replace(/(ies)$/, 'y').replace(/(oes|ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '') : t));
}
