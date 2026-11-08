import { styleText } from "node:util";

/*
 * Terminal styling without dependencies: Node's own styleText, which also respects NO_COLOR,
 * FORCE_COLOR and non-TTY output. Truecolor gradients only when the terminal says it can.
 */

type Stile = Parameters<typeof styleText>[0];
export const st = (stile: Stile, testo: string) => styleText(stile, testo, { stream: process.stdout });

const colori = () => process.stdout.isTTY && !process.env.NO_COLOR && process.stdout.hasColors?.(256);
const truecolor = () => colori() && process.stdout.getColorDepth?.() >= 24;

/** A left-to-right gradient between two RGB colours, character by character. */
export function sfumatura(testo: string, da: [number, number, number], a: [number, number, number]): string {
  if (!truecolor()) return st(["bold", "cyan"], testo);
  const n = Math.max(1, testo.length - 1);
  return [...testo].map((ch, i) => {
    const t = i / n;
    const [r, g, b] = da.map((x, k) => Math.round(x + (a[k]! - x) * t));
    return `\x1b[38;2;${r};${g};${b}m${ch}`;
  }).join("") + "\x1b[0m";
}

export const VIOLA: [number, number, number] = [139, 92, 246];
export const CIANO: [number, number, number] = [34, 211, 238];
export const VERDE: [number, number, number] = [52, 211, 153];

export const larghezza = () => Math.min(process.stdout.columns || 80, 92);

const visibile = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
export const lungo = (s: string) => [...visibile(s)].length;

/** Wraps plain text to `w` columns with a hanging indent. */
export function aCapo(testo: string, w: number, rientro = ""): string[] {
  const righe: string[] = [];
  let r = "";
  for (const parola of testo.split(/\s+/)) {
    if (lungo(r) + lungo(parola) + 1 > w && r) {
      righe.push(r);
      r = rientro + parola;
    } else r = r ? `${r} ${parola}` : parola;
  }
  if (r) righe.push(r);
  return righe;
}

export function riquadro(righe: string[], colore: Stile = "gray"): string {
  const w = Math.max(...righe.map(lungo), 10);
  const bordo = (s: string) => st(colore, s);
  return [
    bordo(`╭${"─".repeat(w + 2)}╮`),
    ...righe.map((r) => `${bordo("│")} ${r}${" ".repeat(w - lungo(r))} ${bordo("│")}`),
    bordo(`╰${"─".repeat(w + 2)}╯`),
  ].join("\n");
}

export const coloreVoto = (v: number | null): "gray" | "green" | "yellow" | "red" => (v === null ? "gray" : v >= 85 ? "green" : v >= 60 ? "yellow" : "red");

/** A bar of `w` cells, filled in eighths for a smooth edge. */
export function barra(v: number, w = 24): string {
  const pieni = (v / 100) * w;
  const interi = Math.floor(pieni);
  const parziale = " ▏▎▍▌▋▊▉"[Math.round((pieni - interi) * 7)] ?? "";
  const vuoto = w - interi - (parziale.trim() ? 1 : 0);
  return st(coloreVoto(v), "█".repeat(interi) + (parziale.trim() ? parziale : "")) + st("gray", "░".repeat(Math.max(0, vuoto)));
}

export const ICONA = {
  ok: () => st("green", "✔"),
  attenzione: () => st("yellow", "▲"),
  problema: () => st("red", "✖"),
  info: () => st("blue", "ℹ"),
};

/** A spinner that writes on stderr, so `--json > file` stays clean. */
export function spinner() {
  const fotogrammi = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const attivo = process.stderr.isTTY;
  let i = 0;
  let testo = "";
  let timer: NodeJS.Timeout | null = null;
  const disegna = () => process.stderr.write(`\r\x1b[2K${styleText("magenta", fotogrammi[i++ % fotogrammi.length]!, { stream: process.stderr })} ${testo}`);
  return {
    avvia(t: string) {
      testo = t;
      if (!attivo) return;
      timer ??= setInterval(disegna, 80);
      disegna();
    },
    aggiorna(t: string) {
      if (attivo && testo && t !== testo) process.stderr.write(`\r\x1b[2K${styleText("green", "✔", { stream: process.stderr })} ${styleText("gray", testo, { stream: process.stderr })}\n`);
      testo = t;
    },
    ferma(fine?: string) {
      if (timer) clearInterval(timer);
      timer = null;
      if (!attivo) return;
      process.stderr.write(`\r\x1b[2K${testo ? `${styleText("green", "✔", { stream: process.stderr })} ${styleText("gray", testo, { stream: process.stderr })}\n` : ""}${fine ? `${fine}\n` : ""}`);
      testo = "";
    },
  };
}
