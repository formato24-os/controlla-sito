#!/usr/bin/env node
import * as p from "@clack/prompts";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import pc from "picocolors";
import { PROVIDER, provider, scegliModello, type Collegamento, type IdProvider } from "./ai/providers.js";
import { collegamento, FILE, leggi, salva } from "./config.js";
import { controllaSito, ErroreCheckup } from "./index.js";
import { impostaLingua, linguaDiSistema, T, type Lingua } from "./lang.js";
import { markdown } from "./report/markdown.js";
import { intestazioneCli, stampaReferto } from "./report/terminal.js";

const VERSIONE = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: "string", short: "l" },
    provider: { type: "string", short: "p" },
    model: { type: "string", short: "m" },
    "no-ai": { type: "boolean" },
    json: { type: "boolean" },
    md: { type: "string" },
    full: { type: "boolean", short: "f" },
    min: { type: "string" },
    sensitive: { type: "boolean" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

const lang = (o.lang ?? (process.argv[1]?.includes("site-checkup") ? "en" : linguaDiSistema())) as Lingua;
impostaLingua(lang === "it" ? "it" : "en");
const interattivo = Boolean(process.stdin.isTTY && process.stdout.isTTY);

function aiuto() {
  const r = (a: string, b: string) => `  ${pc.cyan(a.padEnd(26))}${pc.gray(b)}`;
  console.log(`${intestazioneCli(VERSIONE)}
${pc.bold(T("Uso", "Usage"))}
  ${pc.bold("f24 check")} ${pc.cyan("<sito>")} ${pc.gray(T("[opzioni]", "[options]"))}  ${pc.gray(T("oppure", "or"))} controlla-sito <sito>
  ${pc.bold("f24 ai")}                    ${pc.gray(T("collega il provider AI", "connect the AI provider"))}

${pc.bold(T("Opzioni", "Options"))}
${r("-l, --lang it|en", T("lingua del rapporto", "report language"))}
${r("-p, --provider <nome>", PROVIDER.map((x) => x.id).join(", "))}
${r("-m, --model <modello>", T("modello (predefinito: automatico)", "model (default: automatic)"))}
${r("-f, --full", T("mostra anche i controlli superati", "show passed checks too"))}
${r("--md <file>", T("salva un rapporto Markdown", "save a Markdown report"))}
${r("--json", T("rapporto JSON su stdout", "JSON report on stdout"))}
${r("--min <voto>", T("codice d'uscita 1 sotto il voto (CI)", "exit code 1 below the score (CI)"))}
${r("--sensitive", T("cerca .git/.env esposti, solo su siti tuoi", "look for exposed .git/.env, own sites only"))}
${r("--no-ai", T("salta l'analisi AI", "skip the AI review"))}

${pc.bold(T("Esempi", "Examples"))}
  ${pc.gray("$")} f24 check www.esempio.it
  ${pc.gray("$")} f24 check esempio.it --full --md rapporto.md
  ${pc.gray("$")} OPENAI_API_KEY=… f24 check esempio.it --lang en --min 80
`);
}

async function configuraAI(): Promise<Collegamento | null> {
  const conf = leggi();
  const scelta = await p.select({
    message: T("Quale AI vuoi usare?", "Which AI do you want to use?"),
    initialValue: conf.provider,
    options: PROVIDER.map((x) => ({ value: x.id, label: x.nome, hint: x.senzaChiave ? T("gratis, sul tuo computer", "free, on your machine") : x.dove })),
  });
  if (p.isCancel(scelta)) return null;
  const prov = provider(scelta)!;
  let chiave = "";
  if (!prov.senzaChiave) {
    const v = await p.password({ message: `${T("Incolla la chiave", "Paste the key")} ${pc.gray(`(${prov.env[0]})`)}`, mask: "•", validate: (x) => (x && x.trim().length > 8 ? undefined : T("Chiave troppo corta", "Key too short")) });
    if (p.isCancel(v)) return null;
    chiave = v.trim();
  }
  const col: Collegamento = { provider: prov, chiave };
  const s = p.spinner();
  s.start(T("Provo la chiave", "Testing the key"));
  try {
    const modello = await scegliModello(col, AbortSignal.timeout(20_000));
    s.stop(`${T("Funziona", "It works")} ${pc.gray(`· ${modello}`)}`);
  } catch (e) {
    s.stop(pc.red(`${T("Non funziona", "It does not work")}: ${(e as Error).message}`));
    return null;
  }
  salva({ ...conf, provider: prov.id, chiavi: { ...conf.chiavi, ...(chiave ? { [prov.id]: chiave } : {}) } });
  p.log.success(pc.gray(`${T("Salvata in", "Saved to")} ${FILE}`));
  return col;
}

async function main() {
  if (o.version) return console.log(VERSIONE);
  const [comando] = positionals;
  if (o.help || !comando) return aiuto();
  const umano = !o.json;

  if (comando === "ai" || comando === "config") {
    console.log(intestazioneCli(VERSIONE));
    p.intro(pc.bgMagenta(pc.white(pc.bold(` ${T("Collega l'AI", "Connect the AI")} `))));
    const ok = await configuraAI();
    p.outro(ok ? T("Pronto. Prova: f24 check www.esempio.it", "Ready. Try: f24 check www.example.com") : T("Nessuna modifica.", "Nothing changed."));
    return;
  }

  if (o.provider && !provider(o.provider)) throw new ErroreCheckup(T(`Provider sconosciuto: ${o.provider}`, `Unknown provider: ${o.provider}`));
  if (umano) {
    console.log(intestazioneCli(VERSIONE));
    p.intro(pc.bgMagenta(pc.white(pc.bold(` ${comando.replace(/^https?:\/\//, "").replace(/\/$/, "")} `))));
  }

  let ai: Collegamento | null = o["no-ai"] ? null : collegamento(o.provider as IdProvider | undefined, o.model);
  if (!ai && !o["no-ai"] && umano && interattivo) {
    p.note(T("L'analisi AI usa una tua chiave: OpenAI, Claude, Gemini,\nOpenRouter, NVIDIA, Mistral, Groq, DeepSeek o Ollama in locale.", "The AI review uses your own key: OpenAI, Claude, Gemini,\nOpenRouter, NVIDIA, Mistral, Groq, DeepSeek or local Ollama."), T("AI non collegata", "AI not connected"));
    const si = await p.confirm({ message: T("Vuoi collegarla adesso?", "Connect it now?") });
    if (!p.isCancel(si) && si) ai = await configuraAI();
  }

  // In CI logs and pipes an animated spinner is just escape codes: there, only the report is printed.
  const s = umano && process.stdout.isTTY ? p.spinner() : null;
  let fase = "";
  let inizioFase = Date.now();
  const chiudiFase = () => {
    if (fase) p.log.step(`${fase} ${pc.gray(`${((Date.now() - inizioFase) / 1000).toFixed(1)}s`)}`);
  };
  s?.start(T("Avvio", "Starting"));
  let referto;
  try {
    referto = await controllaSito(comando, {
      ai,
      sensibili: o.sensitive,
      avanzamento: (f) => {
        if (!s) return;
        s.stop();
        chiudiFase();
        fase = f;
        inizioFase = Date.now();
        s.start(f);
      },
    });
    s?.stop();
    chiudiFase();
  } catch (e) {
    s?.stop(pc.red(T("Interrotto", "Stopped")));
    throw e;
  }

  if (o.json) process.stdout.write(`${JSON.stringify(referto, null, 2)}\n`);
  else {
    p.outro(T("Ecco il rapporto", "Here is the report"));
    console.log(stampaReferto(referto, { completo: o.full }));
  }
  if (o.md) {
    writeFileSync(o.md, markdown(referto));
    if (umano) console.log(pc.gray(`  ${T("Rapporto salvato in", "Report saved to")} ${o.md}\n`));
  }
  const minimo = o.min ? Number(o.min) : null;
  if (minimo !== null && (referto.voto ?? 0) < minimo) {
    if (umano) console.log(pc.red(`  ${T(`Voto ${referto.voto} sotto il minimo di ${minimo}.`, `Score ${referto.voto} is below the minimum of ${minimo}.`)}\n`));
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof ErroreCheckup ? e.message : `${T("Errore inatteso", "Unexpected error")}: ${(e as Error).message}`;
  console.error(`\n  ${pc.red("✖")} ${msg}\n`);
  process.exitCode = 2;
});
