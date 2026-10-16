export type Rounding = "half-up" | "half-even" | "floor" | "ceil" | "trunc";

export const NL_VAT: Readonly<{ high: 21; low: 9; zero: 0 }>;

export function toCents(value: string | number, options?: { unit?: "euros" | "cents"; round?: Rounding; locale?: "nl" | "en" }): number;
export function format(cents: number, options?: Intl.NumberFormatOptions & { locale?: string; currency?: string }): string;
export function toDecimal(cents: number): string;
export function allocate(cents: number, ratios: readonly number[]): number[];
export function split(cents: number, parts: number): number[];
export function percentOf(cents: number, rate: number | string, options?: { rounding?: Rounding }): number;
export function vatFromNet(net: number, rate: number | string, options?: { rounding?: Rounding }): { net: number; vat: number; gross: number };
export function vatFromGross(gross: number, rate: number | string, options?: { rounding?: Rounding }): { net: number; vat: number; gross: number };
export function sum(...amounts: (number | readonly number[])[]): number;
