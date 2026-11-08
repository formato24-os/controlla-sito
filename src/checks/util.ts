import type { Controllo, Esito } from "../types.js";

export const c = (id: string, titolo: string, esito: Esito, dettaglio: string, perche: string, rimedio?: string): Controllo =>
  ({ id, titolo, esito, dettaglio, perche, ...(rimedio && esito !== "ok" ? { rimedio } : {}) });

export const giorni = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export const hostDi = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** 0–100 from the checks that have a verdict: a warning counts half, information does not count. */
export function voto(controlli: Pick<Controllo, "esito">[]): number | null {
  const valutati = controlli.filter((x) => x.esito !== "info");
  if (!valutati.length) return null;
  const punti = valutati.reduce((s, x) => s + (x.esito === "ok" ? 1 : x.esito === "attenzione" ? 0.5 : 0), 0);
  return Math.round((punti / valutati.length) * 100);
}

/** The Italian VAT number's own check digit (Luhn-like, on 11 digits). */
export function pivaValida(piva: string): boolean {
  if (!/^\d{11}$/.test(piva) || /^0{11}$/.test(piva)) return false;
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(piva[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
  }
  return (10 - (s % 10)) % 10 === Number(piva[10]);
}

/** Every 11-digit number written next to a VAT label in the text. */
export function trovaPiva(testo: string): string[] {
  return [...testo.matchAll(/(?:p\.?\s?iva|partita\s+iva|vat(?:\s+(?:no|number|n\.?))?|c\.?\s?f\.?\s*(?:e|\/)\s*p\.?\s?iva)\s*[:.\-]?\s*(?:IT\s?)?(\d{11})\b/gi)].map((m) => m[1]!);
}
