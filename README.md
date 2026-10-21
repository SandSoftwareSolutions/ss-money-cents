# @sandsoftwaresolutions/money-cents

[![CI](https://github.com/SandSoftwareSolutions/ss-money-cents/actions/workflows/ci.yml/badge.svg)](https://github.com/SandSoftwareSolutions/ss-money-cents/actions/workflows/ci.yml)

Money as whole **cents**, so the totals are right: no `0.1 + 0.2 = 0.30000000000000004`. Read what people type (`"€ 1.234,56"`), show it, split a bill without losing a cent, and work out VAT both ways. No dependencies.

## Install

```bash
npm install @sandsoftwaresolutions/money-cents
```

Works with `import` and `require()`, and ships TypeScript types for both.

## Usage

```js
import { toCents, format, toDecimal, allocate, split, percentOf, vatFromNet, vatFromGross, sum, NL_VAT } from "@sandsoftwaresolutions/money-cents";

toCents("€ 1.234,56");      // 123456  (also "1234.56", "12,5", "(5,00)", "5,00-")
toCents(19.99);             // 1999    (a number is euros)
format(123456);             // "€ 1.234,56"
toDecimal(123456);          // "1234.56"  for APIs and exports

split(100, 3);                       // [34, 33, 33]   the parts add up to exactly 100
allocate(1000, [70, 30]);            // [700, 300]     by ratio: the tip pool, the shared costs

vatFromNet(10000, NL_VAT.high);      // { net: 10000, vat: 2100, gross: 12100 }
vatFromGross(1000, 21);              // { net: 826, vat: 174, gross: 1000 }   net + vat is always exactly the gross
percentOf(1999, 21);                 // 420
sum(1999, 250, -100);                // 2149, and it refuses amounts that are not whole cents
```

## Why cents

Store and calculate with integers (`1999` for €19,99). Convert only at the edges: `toCents` when something comes in, `format` when it goes out to a person.

## Rules that matter

- **A typo never becomes 0.** `toCents("12,3x")`, `""`, `"abc"`, `"12 EUR 34"` (a currency sign or code only counts at the start or the end) and `"(-5,00)"` (negative twice) throw. More than two decimals (`"12,345"`) also throws unless you choose how to round: `{ round: "half-up" }`.
- **Notation.** The last separator is the decimal one when both appear (`1.234,56` and `1,234.56` both work). A single `.` or `,` followed by one or two digits is a decimal; with exactly three digits in Dutch `1.234` is a thousands separator (1234 euro), except after a leading zero: `0.001` is a number with three decimals (it throws unless you give `round`), not 1 euro. `{ locale: "en" }` flips that: `1,234` is 1234 euro.
- **Allocation never loses a cent.** `allocate` and `split` use the largest remainder method: the parts always add up to the amount. Ratios are used exactly as written (`0.1` is one tenth, `1e-7` is one ten-millionth), not rounded.
- **Numbers** are read through their shortest decimal text (`1.005` is 101 cents, half-up), so a float with more than two decimals is rounded (half-up, or the `round` you give) instead of throwing; a number beyond about 90 trillion euro throws. `format` uses the exact decimal text, so large amounts keep every digit.
- **Rounding negative amounts** is done on the signed amount: `floor` goes toward minus infinity (`-1,005` is `-101`), `ceil` toward plus infinity.
- **VAT adds up.** From a net price the VAT is a percentage of the net; from a gross price the net is calculated and the VAT is *what remains*, so `net + vat === gross` for every amount. `NL_VAT` has 21, 9 and 0.
- **Rounding** is explicit: `half-up` (commercial: half away from zero, the default), `half-even` (banker's), `floor`, `ceil`, `trunc`. Calculations use BigInt internally, so large amounts and odd rates do not drift.
- Only EUR-style two-decimal currencies. Amounts must be safe integers (up to about 90 trillion euro); anything bigger throws.
