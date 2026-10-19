import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { allocate, format, NL_VAT, percentOf, split, sum, toCents, toDecimal, vatFromGross, vatFromNet } from "./src/index.js";

test("reading amounts in Dutch and English notation", () => {
  const cases = {
    "12,34": 1234, "12.34": 1234, "12": 1200, "0,05": 5, ",5": 50, "12,5": 1250, "12.5": 1250, "€ 1.234,56": 123456, "1,234.56": 123456, "EUR 99,99": 9999,
    "1.234": 123400, "1.234.567": 123456700, "1.234.567,89": 123456789, "-5,00": -500, "5,00-": -500, "(5,00)": -500, "−7,25": -725, "+3": 300, " 1 000,00 ": 100000, "€ 12,00": 1200
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(toCents(text), expected, JSON.stringify(text));
  assert.equal(toCents("1,234", { locale: "en" }), 123400);
  assert.equal(toCents("1,234.5", { locale: "en" }), 123450);
  assert.equal(toCents("0.005", { locale: "en", round: "half-up" }), 1);
});

test("numbers are euros unless you say cents, and float errors do not creep in", () => {
  assert.equal(toCents(12.34), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(-4.2), -420);
  assert.equal(toCents(1234, { unit: "cents" }), 1234);
  assert.throws(() => toCents(12.5, { unit: "cents" }), TypeError);
});

test("what cannot be read throws: a typo never becomes 0", () => {
  for (const bad of ["", "abc", "12,3x", "1,2,3", "1.2.3,4,5", "1.23.456", "12,34,56", "--5", "€", "1 2 3a", ".", "1.2345.", null, undefined, {}, NaN, Infinity]) {
    assert.throws(() => toCents(bad), /money-cents/, String(bad));
  }
});

test("more than two decimals needs a rounding choice", () => {
  assert.throws(() => toCents("1,005"), RangeError); // a comma is the decimal separator in Dutch: three decimals
  assert.equal(toCents("12,345", { round: "half-up" }), 1235);
  assert.equal(toCents("12,345", { round: "half-even" }), 1234);
  assert.equal(toCents("12,3451", { round: "half-even" }), 1235);
  assert.equal(toCents("12,349", { round: "floor" }), 1234);
  assert.equal(toCents("-12,345", { round: "half-up" }), -1235);
  assert.throws(() => toCents("12,3456"), RangeError);
});

test("formatting", () => {
  assert.equal(format(123456).replace(/ /g, " "), "€ 1.234,56");
  assert.equal(format(-500).replace(/ /g, " "), "€ -5,00");
  assert.equal(format(5, { locale: "en-GB", currency: "GBP" }), "£0.05");
  assert.equal(format(123456, { locale: "en-US", currency: "USD" }), "$1,234.56");
  assert.throws(() => format(12.5), TypeError);
  assert.equal(toDecimal(123456), "1234.56");
  assert.equal(toDecimal(5), "0.05");
  assert.equal(toDecimal(-5), "-0.05");
  assert.equal(toDecimal(0), "0.00");
});

test("allocate never loses or invents a cent", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(1000, [70, 30]), [700, 300]);
  assert.deepEqual(allocate(5, [1, 1]), [3, 2]);
  assert.deepEqual(allocate(1, [1, 1, 1]), [1, 0, 0]);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(allocate(100, [0, 1]), [0, 100]);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocate(100, [0.5, 0.25, 0.25]), [50, 25, 25]);
  assert.deepEqual(split(100, 3), [34, 33, 33]);
  assert.deepEqual(split(7, 1), [7]);
  assert.throws(() => allocate(100, []), TypeError);
  assert.throws(() => allocate(100, [0, 0]), RangeError);
  assert.throws(() => allocate(100, [-1, 2]), TypeError);
  assert.throws(() => split(100, 0), RangeError);
});

test("allocate: random amounts always add up and respect the ratios", () => {
  let seed = 777;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 1000; i++) {
    const amount = rand(2_000_000) - 1_000_000;
    const ratios = Array.from({ length: 1 + rand(6) }, () => rand(10));
    if (ratios.every((r) => r === 0)) continue;
    const parts = allocate(amount, ratios);
    assert.equal(sum(parts), amount);
    const total = ratios.reduce((a, b) => a + b, 0);
    parts.forEach((p, k) => assert.ok(Math.abs(p - (amount * ratios[k]) / total) < 1, `${amount} ${ratios} -> ${parts}`));
  }
});

test("percentages and rounding", () => {
  assert.equal(percentOf(1999, 21), 420);
  assert.equal(percentOf(1999, "21%"), 420);
  assert.equal(percentOf(1000, 9.5), 95);
  assert.equal(percentOf(50, 10), 5);
  assert.equal(percentOf(25, 10), 3); // 2.5 rounds up (half away from zero)
  assert.equal(percentOf(25, 10, { rounding: "half-even" }), 2);
  assert.equal(percentOf(35, 10, { rounding: "half-even" }), 4);
  assert.equal(percentOf(-25, 10), -3);
  assert.equal(percentOf(-25, 10, { rounding: "half-even" }), -2);
  assert.equal(percentOf(29, 10, { rounding: "floor" }), 2);
  assert.equal(percentOf(21, 10, { rounding: "ceil" }), 3);
  assert.equal(percentOf(-29, 10, { rounding: "floor" }), -3);
  assert.equal(percentOf(29, 10, { rounding: "trunc" }), 2);
  assert.equal(percentOf(0, 21), 0);
  assert.equal(percentOf(100, -10), -10);
  assert.throws(() => percentOf(100, 21, { rounding: "nearest" }), RangeError);
  assert.throws(() => percentOf(100, "abc"), TypeError);
  assert.throws(() => percentOf(100, 21.123), TypeError);
});

test("VAT from net and from gross always add up", () => {
  assert.deepEqual(vatFromNet(10000, NL_VAT.high), { net: 10000, vat: 2100, gross: 12100 });
  assert.deepEqual(vatFromNet(10000, NL_VAT.low), { net: 10000, vat: 900, gross: 10900 });
  assert.deepEqual(vatFromNet(10000, NL_VAT.zero), { net: 10000, vat: 0, gross: 10000 });
  assert.deepEqual(vatFromGross(12100, 21), { net: 10000, vat: 2100, gross: 12100 });
  assert.deepEqual(vatFromGross(1000, 21), { net: 826, vat: 174, gross: 1000 });
  assert.deepEqual(vatFromGross(1000, 9), { net: 917, vat: 83, gross: 1000 });
  for (let gross = 0; gross <= 5000; gross += 7) {
    for (const rate of [21, 9, 0]) {
      const r = vatFromGross(gross, rate);
      assert.equal(r.net + r.vat, gross);
      assert.ok(r.vat >= 0);
    }
  }
  assert.deepEqual(vatFromGross(-1210, 21), { net: -1000, vat: -210, gross: -1210 });
});

test("sum checks every amount", () => {
  assert.equal(sum(100, 250, -50), 300);
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum(), 0);
  assert.throws(() => sum(1.5), TypeError);
  assert.throws(() => sum(Number.MAX_SAFE_INTEGER, 5), /too large|whole number/);
  assert.throws(() => percentOf(Number.MAX_SAFE_INTEGER, 200), RangeError);
});

test("a float that is not a safe amount is an error, and -0 is 0", () => {
  assert.throws(() => toCents(1e15), RangeError);
  assert.throws(() => toCents(1e300), RangeError);
  assert.equal(Object.is(toCents(-0), 0), true);
  assert.equal(Object.is(toCents(-0.001), 0), true);
  assert.equal(Object.is(toCents("-0"), 0), true);
  assert.equal(toCents(12.345, { round: "half-even" }), 1234);
  assert.equal(toCents(1e-7), 0);
  assert.equal(toCents(12345678901234.56), 1234567890123456);
});

test("a currency sign or code only counts at the start or end: '12 EUR 34' is not 1234 euro", () => {
  for (const bad of ["1EUR2", "12 EUR 34", "$€5", "€5€", "1,2€3", "USD 5 USD"]) assert.throws(() => toCents(bad), TypeError, bad);
  for (const [text, cents] of Object.entries({ "USD 5": 500, "5 usd": 500, "EUR-5": -500, "-EUR 5,00": -500, "€ -5,00": -500, "(€ 5,00)": -500, "5,00 €-": -500, "+€5": 500 })) assert.equal(toCents(text), cents, text);
  assert.throws(() => toCents("(-5,00)"), TypeError); // negative twice
  assert.throws(() => toCents("-5-"), TypeError);
  assert.throws(() => toCents("--5"), TypeError);
});

test("a group of three digits after a leading zero is a decimal, never thousands: '0.001' is not 1 euro", () => {
  for (const bad of ["0.001", "0.005", "0.123", "0.001.000", "0,123"]) assert.throws(() => toCents(bad), /money-cents/, bad);
  assert.equal(toCents("0.005", { round: "half-up" }), 1);
  assert.equal(toCents("0,005", { round: "half-even" }), 0);
  assert.equal(toCents("1.001"), 100100); // a leading 1 is a normal thousands group
});

test("rounding of negative amounts goes the right way for floor and ceil", () => {
  assert.equal(toCents("-1,005", { round: "floor" }), -101);
  assert.equal(toCents("-1,005", { round: "ceil" }), -100);
  assert.equal(toCents("-1,001", { round: "floor" }), -101);
  assert.equal(toCents("-1,009", { round: "trunc" }), -100);
  assert.equal(toCents("-1,005", { round: "half-up" }), -101);
  assert.equal(toCents("-1,005", { round: "half-even" }), -100);
  assert.equal(percentOf(-5, 50, { rounding: "floor" }), -3);
  assert.equal(percentOf(-5, 50, { rounding: "ceil" }), -2);
});

test("allocate: exact ratios, no -0, no division by zero, skewed ratios keep their share", () => {
  assert.deepEqual(allocate(10_000_000_000, [1, 1e-7]), [9_999_999_000, 1000]);
  assert.deepEqual(allocate(100, [1e-9]), [100]);
  assert.deepEqual(allocate(100, [1e-7, 0]), [100, 0]);
  assert.deepEqual(allocate(2, [0.3, 0.3, 0.4]), [1, 0, 1]);
  assert.deepEqual(allocate(7, [0.1, 0.2, 0.3, 0.4]), [1, 1, 2, 3]);
  for (const share of allocate(-1, [1, 1])) assert.equal(Object.is(share, -0), false);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.throws(() => allocate(100, [0, 0]), RangeError);
});

test("format keeps every digit of large amounts and shows zero without a minus", () => {
  assert.equal(format(9007199254740991), "€\u00a090.071.992.547.409,91");
  assert.equal(format(-0), "€\u00a00,00");
  assert.equal(format(-5), "€\u00a0-0,05");
});

test("percentOf accepts '21 %' and vatFromGross refuses -100%", () => {
  assert.equal(percentOf(1000, "21 %"), 210);
  assert.throws(() => vatFromGross(100, -100), RangeError);
});

test("random amounts: toDecimal and format round-trip through toCents; allocate adds up; VAT adds up", () => {
  const pick = (n) => randomBytes(2).readUInt16BE() % n;
  for (let i = 0; i < 2000; i++) {
    const cents = (pick(2) ? 1 : -1) * (randomBytes(6).readUIntBE(0, 6) % 10 ** (1 + pick(13))) + 0;
    assert.equal(toCents(toDecimal(cents)), cents);
    assert.equal(toCents(format(cents)), cents);
    assert.equal(toCents(format(cents, { locale: "en-US" }), { locale: "en" }), cents);
    const ratios = Array.from({ length: 1 + pick(6) }, () => [0, 1, 2, 3, 0.5, 0.25, 0.1, 0.3, 1 / 3, 7][pick(10)]);
    if (ratios.some((r) => r > 0)) {
      const parts = allocate(cents, ratios);
      assert.equal(parts.reduce((a, b) => a + b, 0), cents);
      assert.ok(parts.every((p, k) => ratios[k] > 0 || p === 0));
    }
    const rate = [21, 9, 0, "21%", "9,5", 4.5][pick(6)];
    const gross = Math.abs(cents);
    const fromGross = vatFromGross(gross, rate);
    assert.equal(fromGross.net + fromGross.vat, gross);
    assert.equal(percentOf(-gross, rate), 0 - percentOf(gross, rate));
  }
});
