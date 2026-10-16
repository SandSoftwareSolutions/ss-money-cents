import assert from "node:assert/strict";
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
