import { randomBytes } from "node:crypto";
import { aGruppi, apri, dnsVari, ErroreRete, intestazione, lookupSpf, posta, rdap, tlsInfo, type Risposta } from "./net.js";
import { leggiPagina } from "./page.js";
import { T } from "./lang.js";
import type { Dati, Sonda } from "./types.js";

export class ErroreCheckup extends Error {}

const SECONDO_LIVELLO = /\.(co|com|net|org|gov|edu|ac|gv|or)\.[a-z]{2}$/i;

/** The registered domain behind a host, for DNS and expiry: www.shop.example.co.uk → example.co.uk. */
export function dominioRegistrato(host: string): string {
  const parti = host.toLowerCase().replace(/\.$/, "").split(".");
  return parti.slice(SECONDO_LIVELLO.test(host) ? -3 : -2).join(".");
}

export function normalizza(indirizzo: string): string {
  const s = indirizzo.trim();
  const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  if (!u.hostname.includes(".")) throw new ErroreCheckup(T("Indirizzo non valido.", "Invalid address."));
  return u.toString();
}

const tipo = (r: Risposta) => intestazione(r.headers, "content-type") ?? "";

const sonda = (url: string) =>
  apri(url, { timeoutMs: 8000, soloIntestazioni: true }).then(
    (r): Sonda => ({
      url,
      status: r.status,
      byte: r.byte,
      tipo: tipo(r),
      cache: intestazione(r.headers, "cache-control"),
      compresso: /br|gzip|deflate|zstd/i.test(intestazione(r.headers, "content-encoding") ?? ""),
    }),
    (): Sonda => ({ url, status: 0 }),
  );

const testoSe = (url: string, accetta: (r: Risposta) => boolean) => apri(url, { timeoutMs: 6000 }).then((r) => (r.status === 200 && accetta(r) ? r.corpo : null), () => null);

/** Paths that should never be public, checked only when the user asks and only by their exact content. */
const SENSIBILI: [string, (corpo: string) => boolean][] = [
  ["/.git/HEAD", (c) => /^ref: refs\//.test(c.trim())],
  ["/.env", (c) => /^[A-Z][A-Z0-9_]+=.+/m.test(c) && !/<html/i.test(c)],
  ["/.DS_Store", (c) => c.includes("Bud1")],
  ["/wp-config.php.bak", (c) => /DB_PASSWORD/.test(c)],
  ["/phpinfo.php", (c) => /phpinfo\(\)|PHP Version/i.test(c)],
];

export type Avanzamento = (fase: string) => void;

export async function raccogli(indirizzo: string, opzioni: { sensibili?: boolean; avanzamento?: Avanzamento } = {}): Promise<Dati> {
  const passo = opzioni.avanzamento ?? (() => {});
  passo(T("Apro la pagina", "Opening the page"));
  let risposta: Risposta;
  try {
    risposta = await apri(normalizza(indirizzo));
  } catch (e) {
    if (e instanceof ErroreCheckup) throw e;
    const codice = e instanceof ErroreRete ? e.codice : "NON_RAGGIUNGIBILE";
    throw new ErroreCheckup(
      codice === "BLOCCATO" ? T("Questo indirizzo non è un sito pubblico.", "This address is not a public website.")
        : codice === "TEMPO" ? T("Il sito non ha risposto in tempo.", "The site did not answer in time.")
        : codice === "TROPPO_GRANDE" ? T("La pagina è troppo pesante da analizzare.", "The page is too large to analyse.")
        : T("Il sito non risponde.", "The site does not answer."),
    );
  }
  if (risposta.status >= 400) throw new ErroreCheckup(T(`Il sito risponde con un errore (${risposta.status}).`, `The site answers with an error (${risposta.status}).`));
  if (!/html/i.test(tipo(risposta))) throw new ErroreCheckup(T("A questo indirizzo non c'è una pagina web.", "There is no web page at this address."));

  const finale = new URL(risposta.url);
  const host = finale.hostname;
  const dominio = dominioRegistrato(host);
  const origine = finale.origin;
  const pagina = leggiPagina(risposta.corpo, risposta.url);

  passo(T("Controllo certificato, dominio ed email", "Checking certificate, domain and email"));
  const altro = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const [httpVaSuHttps, altroHost, tls, mail, dns, registrazione] = await Promise.all([
    finale.protocol === "https:" ? apri(`http://${host}/`, { timeoutMs: 6000 }).then((r) => r.url.startsWith("https://"), () => null) : null,
    host === dominio || host === `www.${dominio}`
      ? apri(`https://${altro}/`, { timeoutMs: 6000 }).then((r) => ({ host: altro, finisceQui: new URL(r.url).hostname === host }), () => ({ host: altro, finisceQui: null }))
      : null,
    finale.protocol === "https:" ? tlsInfo(host) : null,
    posta(dominio),
    dnsVari(host, dominio),
    rdap(dominio),
  ]);
  const spfLookup = mail.spf ? await lookupSpf(mail.spf).catch(() => null) : null;

  passo(T("Leggo robots.txt, sitemap e file per le AI", "Reading robots.txt, sitemap and AI files"));
  const casuale = `/${randomBytes(6).toString("hex")}-controlla-sito`;
  const [robots, llms, security, pagina404] = await Promise.all([
    testoSe(`${origine}/robots.txt`, (r) => !/html/i.test(tipo(r))),
    testoSe(`${origine}/llms.txt`, (r) => !/html/i.test(tipo(r))),
    testoSe(`${origine}/.well-known/security.txt`, (r) => /contact:/i.test(r.corpo)),
    apri(`${origine}${casuale}`, { timeoutMs: 6000, soloIntestazioni: true }).then((r) => r.status, () => null),
  ]);
  const candidate = [...(robots ?? "").matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  let sitemap: Dati["sitemap"] = null;
  for (const url of [...candidate, `${origine}/sitemap.xml`, `${origine}/sitemap_index.xml`]) {
    const corpo = await testoSe(url, (r) => /<(urlset|sitemapindex)/i.test(r.corpo)).catch(() => null);
    if (!corpo) continue;
    const indice = /<sitemapindex/i.test(corpo);
    let locs = [...corpo.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!);
    let urls = locs.length;
    if (indice && locs[0]) {
      const figlio = await testoSe(locs[0], () => true);
      locs = [...(figlio ?? "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!);
      urls = locs.length;
    }
    sitemap = { url, urls, indice, campione: [] };
    sitemap.campione = await aGruppi(locs.filter((u) => u.startsWith("http")).slice(0, 8), 4, sonda);
    break;
  }

  passo(T("Provo i collegamenti e i file della pagina", "Testing links and page files"));
  const interni = [...new Set(pagina.link.map((l) => {
    try {
      const u = new URL(l.href, risposta.url);
      u.hash = "";
      return u.protocol.startsWith("http") && u.hostname === host && u.toString() !== risposta.url ? u.toString() : null;
    } catch {
      return null;
    }
  }).filter((x): x is string => x !== null))].slice(0, 25);
  const risorse = [...new Set([...pagina.script, ...pagina.fogli, ...pagina.immagini.map((i) => i.src)].filter((u) => u.startsWith("http")))].slice(0, 30);
  const [linkInterni, sondeRisorse, ogImmagine, sensibili] = await Promise.all([
    aGruppi(interni, 5, sonda),
    aGruppi(risorse, 6, sonda),
    pagina.og.image ? sonda(new URL(pagina.og.image, risposta.url).toString()) : null,
    opzioni.sensibili
      ? aGruppi(SENSIBILI, 3, async ([percorso, prova]) => ({ percorso, esposto: Boolean(await testoSe(`${origine}${percorso}`, (r) => prova(r.corpo))) }))
      : null,
  ]);

  return {
    url: risposta.url,
    host,
    dominio,
    risposta,
    pagina,
    httpVaSuHttps,
    altroHost,
    tls,
    posta: mail,
    spfLookup,
    dns,
    registrazione,
    robots,
    sitemap,
    llmsTxt: llms !== null,
    securityTxt: security !== null,
    pagina404,
    risorse: sondeRisorse,
    linkInterni,
    ogImmagine,
    sensibili,
    adesso: new Date(),
  };
}
