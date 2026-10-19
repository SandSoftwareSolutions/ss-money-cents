/** The Dutch VAT rates in percent. */
export const NL_VAT = Object.freeze({ high: 21, low: 9, zero: 0 });

function cents(value, name = "amount") {
  if (!Number.isSafeInteger(value)) throw new TypeError(`money-cents: ${name} must be a whole number of cents, got ${value}`);
  return value;
}

/** Rounds `numerator / denominator` (BigInt) with the chosen rule. Rules: "half-up" (half away from zero, the commercial way), "half-even" (banker's), "floor", "ceil", "trunc". */
const ROUNDINGS = new Set(["half-up", "half-even", "floor", "ceil", "trunc"]);

function divideRound(numerator, denominator, rounding) {
  if (!ROUNDINGS.has(rounding)) throw new RangeError(`money-cents: unknown rounding "${rounding}"; use half-up, half-even, floor, ceil or trunc`);
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let quotient = numerator / denominator; // truncates toward zero
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  switch (rounding) {
    case "half-up":
      if (twice >= denominator) quotient += negative ? -1n : 1n;
      break;
    case "half-even":
      if (twice > denominator || (twice === denominator && quotient % 2n !== 0n)) quotient += negative ? -1n : 1n;
      break;
    case "floor":
      if (negative) quotient -= 1n;
      break;
    case "ceil":
      if (!negative) quotient += 1n;
      break;
    case "trunc":
      break;
  }
  return quotient;
}

const toNumber = (big) => {
  const n = Number(big);
  if (!Number.isSafeInteger(n)) throw new RangeError("money-cents: the amount is too large");
  return n;
};

/** Parses a rate such as `21`, `"21%"` or `9.5` into hundredths of a percent (basis points) without floating point errors. */
function basisPoints(rate) {
  const text = typeof rate === "number" ? String(rate) : String(rate).trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new TypeError(`money-cents: "${rate}" is not a rate with at most two decimals`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return negative ? -value : value;
}

/**
 * Reads an amount of money into whole cents: `toCents("12,34")` and `toCents("12.34")` are 1234, `toCents("€ 1.234,56")` is 123456.
 * Numbers are euros (`12.34`) unless you pass `{ unit: "cents" }`. Accepts a currency sign or code, spaces, a minus before or after,
 * and brackets for negative. The decimal separator is the one used last when both appear; a single separator followed by one or
 * two digits is the decimal, followed by exactly three digits it is a thousands separator (`1.234` is 1234 euro, unless
 * `locale: "en"` where `1,234` is 1234 and `1.234` is an error). More than two decimals throws, unless `round` is given.
 * Anything it cannot read throws: a typo must never become 0.
 */
export function toCents(value, { unit = "euros", round, locale = "nl" } = {}) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("money-cents: the amount is not a finite number");
    if (unit === "cents") return cents(value, "the amount") + 0; // + 0: no -0
    // Through the shortest decimal text of the number (19.99, not 19.989999999999998...), so 1.005 is 1.005 and rounds half-up to 101.
    // Floats with more than two decimals are rounded (half-up unless `round` says otherwise); a float is never exact anyway.
    return toCents(plainDecimal(value), { round: round ?? "half-up", locale: "en" });
  }
  if (typeof value !== "string") throw new TypeError("money-cents: the amount must be a string or a number");
  const bad = () => new TypeError(`money-cents: cannot read "${value}" as an amount`);
  let text = value.replace(/[\s\u00a0]/g, "");
  // Peel brackets, a minus or plus and ONE currency sign or code at the start and the end, each at most once. A currency code in the
  // middle ("12 EUR 34") is not an amount.
  let negative = false;
  let marks = 0;
  const CURRENCY = "(?:EUR|USD|GBP|€|\\$|£)";
  const startCurrency = new RegExp(`^${CURRENCY}`, "i");
  const endCurrency = new RegExp(`${CURRENCY}$`, "i");
  let done = { bracket: false, startSign: false, endSign: false, startCurrency: false, endCurrency: false };
  for (let pass = 0, changed = true; changed && pass < 8; pass++) {
    changed = false;
    if (!done.bracket && /^\(.*\)$/.test(text)) {
      done.bracket = changed = true;
      negative = true;
      marks++;
      text = text.slice(1, -1);
    }
    if (!done.startSign && /^[-−+]/.test(text)) {
      done.startSign = changed = true;
      if (text[0] !== "+") {
        negative = true;
        marks++;
      }
      text = text.slice(1);
    }
    if (!done.endSign && /[-−]$/.test(text)) {
      done.endSign = changed = true;
      negative = true;
      marks++;
      text = text.slice(0, -1);
    }
    if (!done.startCurrency && startCurrency.test(text)) {
      done.startCurrency = changed = true;
      text = text.replace(startCurrency, "");
    }
    if (!done.endCurrency && !done.startCurrency && endCurrency.test(text)) { // one currency sign, at the start or the end, not both
      done.endCurrency = changed = true;
      text = text.replace(endCurrency, "");
    }
  }
  if (marks > 1) throw bad(); // "(-5)" or "-5-" say "negative" twice
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) throw bad();
  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  let decimalSeparator = null;
  if (dots && commas) decimalSeparator = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
  else if (dots + commas === 1) {
    const sep = dots ? "." : ",";
    const at = text.indexOf(sep);
    const digitsAfter = text.length - at - 1;
    // exactly three digits after the one separator: thousands in the chosen locale ("1.234" is 1234 in Dutch), but never after a
    // leading zero ("0.001" is a number with three decimals, not 1 euro)
    const thousands = (locale === "nl" ? sep === "." : sep === ",") && digitsAfter === 3 && at > 0 && !text.startsWith("0");
    decimalSeparator = thousands ? null : sep;
  }
  let whole = text;
  let fraction = "";
  if (decimalSeparator) {
    const at = text.lastIndexOf(decimalSeparator);
    whole = text.slice(0, at);
    fraction = text.slice(at + 1);
    if (whole.includes(decimalSeparator)) throw bad();
  }
  const group = decimalSeparator === "." ? "," : decimalSeparator === "," ? "." : dots ? "." : ",";
  const groups = whole.split(group);
  if (groups.length > 1 && (groups[0].length > 3 || groups[0] === "" || groups[0].startsWith("0") || groups.slice(1).some((g) => g.length !== 3))) throw bad();
  whole = groups.join("");
  if (whole === "") whole = "0";
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) throw bad();
  if (fraction.length <= 2) {
    const total = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return toNumber(negative ? -total : total) + 0;
  }
  if (round === undefined) throw new RangeError(`money-cents: "${value}" has more than two decimals; pass { round: "half-up" } to round it`);
  // the sign goes in before rounding, so floor and ceil go the right way for negative amounts
  const scaled = BigInt(whole + fraction);
  return toNumber(divideRound(negative ? -scaled : scaled, 10n ** BigInt(fraction.length - 2), round)) + 0;
}

// A number as plain decimal text without exponent: 1e-7 is "0.0000001", 1.5e21 is "1500000000000000000000".
function plainDecimal(value) {
  const text = String(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) return sign + text;
  const [, whole, fraction = "", exponent] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + "0".repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Shows cents as money: `format(123456)` is `"€ 1.234,56"`. Options: `locale` (default "nl-NL"), `currency` (default "EUR"), `signDisplay`. */
export function format(amount, { locale = "nl-NL", currency = "EUR", ...options } = {}) {
  cents(amount);
  // the exact decimal text, not amount / 100: a float loses the last digits of large amounts, and -0 would show as "-0,00"
  return new Intl.NumberFormat(locale, { style: "currency", currency, ...options }).format(toDecimal(amount));
}

/** The amount as a plain decimal text with a dot, like `"1234.56"`, for APIs and exports (no float errors, no symbols). */
export function toDecimal(amount) {
  cents(amount);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Splits an amount by ratios without losing or inventing a cent (largest remainder method):
 * `allocate(100, [1, 1, 1])` is `[34, 33, 33]`, `allocate(1000, [70, 30])` is `[700, 300]`. The parts always add up to the amount.
 */
export function allocate(amount, ratios) {
  cents(amount);
  if (!Array.isArray(ratios) || ratios.length === 0 || ratios.some((r) => !Number.isFinite(r) || r < 0)) throw new TypeError("money-cents: ratios must be a non-empty list of numbers, 0 or more");
  const weights = exactWeights(ratios);
  const weightTotal = weights.reduce((a, b) => a + b, 0n);
  if (weightTotal === 0n) throw new RangeError("money-cents: the ratios add up to zero");
  const negative = amount < 0;
  const abs = BigInt(Math.abs(amount));
  const shares = weights.map((w) => (abs * w) / weightTotal);
  const remainders = weights.map((w, i) => ({ i, rest: (abs * w) % weightTotal }));
  let left = abs - shares.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0n) break;
    shares[i] += 1n;
    left -= 1n;
  }
  return shares.map((s) => toNumber(negative ? -s : s) + 0); // + 0: a zero share of a negative amount is 0, not -0
}

// The ratios as whole numbers in the same proportion, exactly as written (0.1 is 1/10, 1e-7 is 1/10 000 000): no rounding of ratios.
function exactWeights(ratios) {
  const texts = ratios.map((r) => plainDecimal(r));
  const decimals = Math.max(...texts.map((t) => (t.includes(".") ? t.length - t.indexOf(".") - 1 : 0)));
  return texts.map((t) => {
    const [whole, fraction = ""] = t.split(".");
    return BigInt(whole + fraction.padEnd(decimals, "0"));
  });
}

/** `split(100, 3)` is `[34, 33, 33]`: n (nearly) equal parts that add up. */
export function split(amount, parts) {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("money-cents: parts must be a whole number of at least 1");
  return allocate(amount, Array(parts).fill(1));
}

/** A percentage of an amount: `percentOf(1999, 21)` is 420 (21% of 19,99, rounded half-up). `rate` may be `21`, `"9%"` or `4.5`. Rounding: "half-up" (default), "half-even", "floor", "ceil", "trunc". */
export function percentOf(amount, rate, { rounding = "half-up" } = {}) {
  cents(amount);
  return toNumber(divideRound(BigInt(amount) * basisPoints(rate), 10_000n, rounding));
}

/** Adds VAT to a net price: `vatFromNet(10000, 21)` is `{ net: 10000, vat: 2100, gross: 12100 }`. */
export function vatFromNet(net, rate, options) {
  const vat = percentOf(net, rate, options);
  return { net, vat, gross: net + vat };
}

/** Takes the VAT out of a gross price: `vatFromGross(12100, 21)` is `{ net: 10000, vat: 2100, gross: 12100 }`. The VAT is what remains, so net + vat is always exactly the gross. */
export function vatFromGross(gross, rate, { rounding = "half-up" } = {}) {
  cents(gross, "gross");
  const bp = basisPoints(rate);
  if (bp <= -10_000n) throw new RangeError("money-cents: a rate of -100% or less has no net price");
  const net = toNumber(divideRound(BigInt(gross) * 10_000n, 10_000n + bp, rounding)) + 0;
  return { net, vat: gross - net, gross };
}

/** Adds amounts and checks that every one is a whole number of cents and the total is safe. */
export function sum(...amounts) {
  let total = 0;
  for (const a of amounts.flat()) {
    total += cents(a, "an amount");
    if (!Number.isSafeInteger(total)) throw new RangeError("money-cents: the total is too large");
  }
  return total;
}
