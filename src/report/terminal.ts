import boxen from "boxen";
import cfonts from "cfonts";
import gradient from "gradient-string";
import pc from "picocolors";
import type { Referto } from "../index.js";
import { T } from "../lang.js";
import type { Controllo, Esito } from "../types.js";
import { aCapo, barra, coloreVoto, larghezza } from "../ui.js";

/*
 * The report as a designed page, in the spirit of modern CLIs (Vercel, Astro, Clack): a banner,
 * one score card, a scannable overview, then the detail with a left rail. Colour carries meaning
 * only (green/yellow/red); the gradient is reserved for brand and headings.
 */

const marchio = gradient(["#8b5cf6", "#6366f1", "#22d3ee"]);
const verde = gradient(["#34d399", "#22d3ee"]);
const ORDINE = { problema: 0, attenzione: 1, info: 2, ok: 3 } as const;
const colora = (v: number | null) => pc[coloreVoto(v)];

const ICONA: Record<Esito, string> = {
  ok: pc.green("✔"),
  attenzione: pc.yellow("▲"),
  problema: pc.red("✖"),
  info: pc.blue("ℹ"),
};

const binario = pc.gray("│");

export function intestazioneCli(versione: string): string {
  const w = larghezza();
  const logo = w >= 60
    ? cfonts.render("F24", { font: "block", gradient: ["#8b5cf6", "#22d3ee"], transitionGradient: true, space: false })
    : false;
  const titolo = logo ? logo.string : marchio("  F24");
  return `\n${titolo}\n  ${pc.bold(marchio("controlla-sito"))} ${pc.gray(`v${versione}`)}  ${pc.dim("·")}  ${pc.gray(T("check-up di siti web con AI, by Formato24", "AI-powered website check-up, by Formato24"))}\n`;
}

function etichetta(testo: string, sfondo: "bgRed" | "bgYellow" | "bgGreen" | "bgBlue" | "bgMagenta" | "bgBlack") {
  const scuro = sfondo === "bgYellow" || sfondo === "bgGreen";
  return pc[sfondo](scuro ? pc.black(pc.bold(` ${testo} `)) : pc.white(pc.bold(` ${testo} `)));
}

function scheda(r: Referto): string {
  const tutti = r.aree.flatMap((a) => a.controlli);
  const conta = (e: Esito) => tutti.filter((x) => x.esito === e).length;
  const v = r.voto ?? 0;
  const giudizio = v >= 85 ? T("Ottimo", "Great") : v >= 70 ? T("Buono, con margini", "Good, with room to improve") : v >= 50 ? T("Da sistemare", "Needs work") : T("Critico", "Critical");
  const righe = [
    `${pc.bold(r.host)}  ${pc.gray(`${Math.round(r.durataMs / 1000)}s`)}`,
    "",
    `${pc.bold(colora(r.voto)(String(r.voto ?? "—")))}${pc.gray("/100")}   ${barra(v, 32)}   ${colora(r.voto)(giudizio)}`,
    "",
    `${etichetta(`✖ ${conta("problema")}`, "bgRed")} ${pc.gray(T("problemi", "problems"))}   ${etichetta(`▲ ${conta("attenzione")}`, "bgYellow")} ${pc.gray(T("da migliorare", "to improve"))}   ${etichetta(`✔ ${conta("ok")}`, "bgGreen")} ${pc.gray("ok")}`,
  ];
  if (r.tecnologie.length) righe.push("", pc.gray(r.tecnologie.slice(0, 9).map((t) => `◆ ${t}`).join("  ")));
  if (r.ai && r.votoTecnico !== null) righe.push("", pc.gray(T(`Tecnico ${r.votoTecnico} · AI ${r.ai.voto} (pesa il 30%)`, `Technical ${r.votoTecnico} · AI ${r.ai.voto} (weighs 30%)`)));
  return boxen(righe.join("\n"), {
    padding: { top: 1, bottom: 1, left: 3, right: 3 },
    margin: { left: 2 },
    borderStyle: "round",
    borderColor: coloreVoto(r.voto) === "gray" ? "gray" : coloreVoto(r.voto),
    title: pc.bold(marchio(` ${T("Check-up", "Check-up")} `)),
    titleAlignment: "left",
  });
}

function panoramica(r: Referto): string[] {
  const out = [`  ${pc.bold(marchio(T("Panoramica", "Overview")))}`, ""];
  for (const a of r.aree) {
    const peggiori = a.controlli.filter((x) => x.esito === "problema").length;
    const nota = peggiori ? pc.red(T(` ${peggiori} da correggere`, ` ${peggiori} to fix`)) : "";
    out.push(`  ${a.nome.padEnd(22)} ${a.voto === null ? pc.gray("  —") : colora(a.voto)(pc.bold(String(a.voto).padStart(3)))}  ${a.voto === null ? pc.gray("░".repeat(24)) : barra(a.voto, 24)}${nota}`);
  }
  return out;
}

function sezioneAI(r: Referto, w: number): string[] {
  if (!r.ai) return r.aiAssente ? ["", `  ${ICONA.info} ${pc.gray(r.aiAssente)}`] : [];
  const ai = r.ai;
  const corpo: string[] = [];
  corpo.push(...aCapo(ai.primaImpressione, w - 14));
  corpo.push("", `${ai.cosaFai.chiaro ? ICONA.ok : ICONA.attenzione} ${pc.bold(T("Si capisce cosa fai?", "Is it clear what you do?"))} ${pc.gray(ai.cosaFai.commento)}`);
  if (ai.perChi) corpo.push(`${ICONA.info} ${pc.bold(T("Sembra rivolto a:", "Seems aimed at:"))} ${pc.gray(ai.perChi)}`);
  if (ai.puntiForza.length) corpo.push("", ...ai.puntiForza.flatMap((p) => aCapo(`${pc.green("+")} ${p}`, w - 14, "  ")));
  if (ai.problemi.length) {
    corpo.push("");
    for (const p of ai.problemi) {
      corpo.push(`${pc.red("−")} ${pc.bold(p.titolo)}`);
      corpo.push(...aCapo(p.dettaglio, w - 16).map((x) => `  ${pc.gray(x)}`));
    }
  }
  if (ai.riscrittura) {
    corpo.push("", pc.gray(T("TITOLO DI ADESSO", "CURRENT HEADLINE")), ...aCapo(`“${ai.riscrittura.prima}”`, w - 14).map((x) => pc.strikethrough(pc.gray(x))),
      "", pc.gray(T("COME LO SCRIVEREBBE L'AI", "HOW THE AI WOULD WRITE IT")), ...aCapo(`“${ai.riscrittura.dopo}”`, w - 14).map((x) => pc.bold(verde(x))));
    if (ai.riscrittura.perche) corpo.push(...aCapo(ai.riscrittura.perche, w - 14).map((x) => pc.gray(x)));
  }
  return ["", boxen(corpo.join("\n"), {
    padding: 1,
    margin: { left: 2 },
    borderStyle: "round",
    borderColor: "magenta",
    title: pc.bold(marchio(` ✦ ${T("Il parere dell'AI", "The AI's review")} `)),
    titleAlignment: "left",
    width: Math.min(w - 2, 90),
  }), pc.gray(`    ${ai.modello} · ${ai.voto}/100`)];
}

function voce(x: Controllo, w: number, completo: boolean): string[] {
  const righe = [`  ${binario}  ${ICONA[x.esito]} ${x.esito === "ok" ? x.titolo : pc.bold(x.titolo)}`];
  const rientro = `  ${binario}     `;
  for (const r of aCapo(x.dettaglio, w - 10)) righe.push(`${rientro}${x.esito === "ok" ? pc.gray(r) : r}`);
  if (completo || x.esito === "problema" || x.esito === "attenzione") {
    for (const r of aCapo(x.perche, w - 10)) righe.push(`${rientro}${pc.dim(r)}`);
    if (x.rimedio) aCapo(x.rimedio, w - 12).forEach((r, i) => righe.push(`${rientro}${i ? "  " : pc.cyan("→ ")}${pc.cyan(r)}`));
  }
  return righe;
}

function dettaglio(r: Referto, w: number, completo: boolean): string[] {
  const out = ["", `  ${pc.bold(marchio(T("Nel dettaglio", "In detail")))}`];
  for (const a of r.aree) {
    const voto = a.voto === null ? pc.gray("—") : colora(a.voto)(`${a.voto}/100`);
    out.push("", `  ${pc.gray("◇")}  ${pc.bold(a.nome)}  ${voto}`);
    const ordinati = [...a.controlli].sort((x, y) => ORDINE[x.esito] - ORDINE[y.esito]);
    const visibili = completo ? ordinati : ordinati.filter((x) => x.esito !== "ok");
    for (const x of visibili) out.push(...voce(x, w, completo));
    const nascosti = ordinati.length - visibili.length;
    if (nascosti) out.push(`  ${binario}  ${pc.green("✔")} ${pc.gray(T(`altri ${nascosti} controlli superati`, `${nascosti} more checks passed`))}`);
  }
  return out;
}

function piano(r: Referto, w: number): string[] {
  const tutti = r.aree.flatMap((a) => a.controlli);
  const voci = r.ai?.piano.length ? r.ai.piano.map((p) => ({ testo: p.azione, impatto: p.impatto }))
    : tutti.filter((x) => x.esito === "problema").slice(0, 5).map((x) => ({ testo: x.rimedio ?? x.titolo, impatto: "alto" as const }));
  if (!voci.length) return [];
  const badge = { alto: etichetta(T("ALTO", "HIGH"), "bgRed"), medio: etichetta(T("MEDIO", "MED"), "bgYellow"), basso: etichetta(T("BASSO", "LOW"), "bgBlack") };
  const corpo = voci.flatMap((p, i) => {
    const [prima = "", ...resto] = aCapo(p.testo, w - 22);
    return [`${pc.bold(marchio(`${i + 1}`))}  ${badge[p.impatto]}  ${prima}`, ...resto.map((x) => `            ${x}`)];
  });
  return ["", boxen(corpo.join("\n"), {
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    margin: { left: 2 },
    borderStyle: "round",
    borderColor: "cyan",
    title: pc.bold(marchio(` ${T("Da dove partire", "Where to start")} `)),
    titleAlignment: "left",
    width: Math.min(w - 2, 90),
  })];
}

export function stampaReferto(r: Referto, opzioni: { completo?: boolean } = {}): string {
  const w = larghezza();
  return [
    scheda(r),
    "",
    ...panoramica(r),
    ...sezioneAI(r, w),
    ...piano(r, w),
    ...dettaglio(r, w, Boolean(opzioni.completo)),
    "",
    `  ${pc.gray(T("Serve una mano a sistemarlo?", "Need a hand fixing it?"))} ${pc.bold(marchio("Formato24"))} ${pc.gray("· https://www.formato24.com")}`,
    "",
  ].join("\n");
}
