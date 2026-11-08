import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";

/*
 * Every request goes through here. The address is resolved inside `lookup` and refused when it is
 * private, loopback, link-local or reserved, so pointing the tool at an internal service — directly,
 * through a redirect or through a DNS answer that changes between two lookups — never reaches it.
 * This matters when the CLI runs in CI or on a server that takes addresses from other people.
 * Only GET, ports 80 and 443, at most five redirects (each checked again), capped time and size.
 */

const MAX_BYTE = 4 * 1024 * 1024;
// "(compatible; …)" is what common WAF rules match as a bot and reset; this form still says who we are.
export const UA = "Mozilla/5.0 controlla-sito/1.0 (+https://github.com/formato24-os/controlla-sito)";

export type CodiceRete = "BLOCCATO" | "NON_RAGGIUNGIBILE" | "TROPPO_GRANDE" | "TEMPO";
export class ErroreRete extends Error {
  readonly codice: CodiceRete;
  constructor(codice: CodiceRete, messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

/** True for every address a public website cannot legitimately live on. */
export function indirizzoRiservato(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return indirizzoRiservato(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^(fc|fd|fe[89ab]|ff|64:ff9b|2001:db8)/.test(v6);
}

let consentiPrivati = false;
/** Only for tests against a local server. */
export function permettiIndirizziPrivati(si: boolean) {
  consentiPrivati = si;
}

export const lookupSicuro: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, indirizzi) => {
    if (err) return callback(err, "", 4);
    const lista = indirizzi as dns.LookupAddress[];
    if (!lista.length || (!consentiPrivati && lista.some((a) => indirizzoRiservato(a.address)))) {
      return callback(Object.assign(new Error("not a public address"), { code: "BLOCCATO" }), "", 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, lista);
    callback(null, lista[0]!.address, lista[0]!.family);
  });
};

export type Intestazioni = Record<string, string | string[] | undefined>;
export type Risposta = {
  url: string;
  status: number;
  headers: Intestazioni;
  corpo: string;
  ttfbMs: number;
  totaleMs: number;
  /** bytes on the wire, before decompression */
  byte: number;
  catena: { url: string; status: number }[];
};

export const intestazione = (h: Intestazioni, nome: string): string | null => {
  const v = h[nome];
  return Array.isArray(v) ? v.join(", ") : v ?? null;
};

type Opzioni = { timeoutMs?: number; soloIntestazioni?: boolean };

function una(url: URL, { timeoutMs = 12_000, soloIntestazioni = false }: Opzioni) {
  return new Promise<Omit<Risposta, "catena" | "url"> & { location?: string }>((resolve, reject) => {
    const modulo = url.protocol === "https:" ? https : http;
    const inizio = performance.now();
    const req = modulo.request(
      url,
      {
        method: "GET",
        lookup: lookupSicuro,
        timeout: timeoutMs,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-encoding": "br, gzip, deflate", "accept-language": "it-IT,it;q=0.9,en;q=0.8" },
      },
      (res) => {
        const ttfbMs = Math.round(performance.now() - inizio);
        const status = res.statusCode ?? 0;
        const location = status >= 300 && status < 400 ? res.headers.location : undefined;
        if (soloIntestazioni || location) {
          const lunghezza = Number(res.headers["content-length"] ?? 0);
          res.destroy();
          return resolve({ status, headers: res.headers, corpo: "", ttfbMs, totaleMs: ttfbMs, byte: lunghezza, location });
        }
        const enc = String(res.headers["content-encoding"] ?? "");
        const flusso = enc.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : enc.includes("gzip") ? res.pipe(zlib.createGunzip()) : enc.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
        const pezzi: Buffer[] = [];
        let byteRete = 0;
        let byte = 0;
        res.on("data", (d: Buffer) => (byteRete += d.length));
        flusso.on("data", (d: Buffer) => {
          byte += d.length;
          if (byte > MAX_BYTE) return req.destroy(new ErroreRete("TROPPO_GRANDE", "too large"));
          pezzi.push(d);
        });
        flusso.on("end", () => resolve({ status, headers: res.headers, corpo: Buffer.concat(pezzi).toString("utf8"), ttfbMs, totaleMs: Math.round(performance.now() - inizio), byte: byteRete }));
        flusso.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new ErroreRete("TEMPO", "timeout")));
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof ErroreRete) return reject(e);
      reject(new ErroreRete(e.code === "BLOCCATO" ? "BLOCCATO" : "NON_RAGGIUNGIBILE", e.code ?? e.message));
    });
    req.end();
  });
}

/** GET with redirects followed by hand, so each hop passes the same checks as the first. */
export async function apri(indirizzo: string, opzioni: Opzioni = {}): Promise<Risposta> {
  let url = new URL(indirizzo);
  const catena: Risposta["catena"] = [];
  for (let salto = 0; salto <= 5; salto++) {
    if (!["http:", "https:"].includes(url.protocol) || (url.port && !["80", "443"].includes(url.port) && !consentiPrivati) || url.username || url.password) {
      throw new ErroreRete("BLOCCATO", "unsupported address");
    }
    const ip = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(ip) && indirizzoRiservato(ip) && !consentiPrivati) throw new ErroreRete("BLOCCATO", "not a public address");
    const r = await una(url, opzioni);
    catena.push({ url: url.toString(), status: r.status });
    if (!r.location) return { ...r, url: url.toString(), catena };
    url = new URL(r.location, url);
  }
  throw new ErroreRete("NON_RAGGIUNGIBILE", "redirect loop");
}

/** Runs `fn` over `voci` with at most `n` at a time. */
export async function aGruppi<T, R>(voci: T[], n: number, fn: (v: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(voci.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, voci.length) }, async () => {
    while (i < voci.length) {
      const k = i++;
      out[k] = await fn(voci[k]!);
    }
  }));
  return out;
}

export type InfoTls = {
  valido: boolean;
  errore: string | null;
  protocollo: string | null;
  scade: Date;
  emittente: string;
  nomi: string[];
};

/** The certificate as presented, checked by Node itself (chain, name, dates) without refusing to read it. */
export function tlsInfo(host: string): Promise<InfoTls | null> {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, lookup: lookupSicuro, timeout: 8000, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      const info = c?.valid_to
        ? {
            valido: s.authorized,
            errore: s.authorizationError ? String(s.authorizationError) : null,
            protocollo: s.getProtocol(),
            scade: new Date(c.valid_to),
            emittente: String(c.issuer?.O ?? c.issuer?.CN ?? ""),
            nomi: (c.subjectaltname ?? "").split(",").map((x) => x.trim().replace(/^DNS:/, "")).filter(Boolean),
          }
        : null;
      s.end();
      resolve(info);
    });
    s.on("error", () => resolve(null));
    s.on("timeout", () => {
      s.destroy();
      resolve(null);
    });
  });
}

/*
 * DNS records other than A/AAAA go through c-ares, which talks to the configured servers
 * directly. On machines whose resolver is a local stub (127.0.0.1 behind a VPN or a filter) that
 * stub often refuses those queries, and every mail check would silently read "missing". When the
 * system resolver cannot be reached at all, the same question goes to public resolvers.
 */
const pubblico = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
pubblico.setServers(["1.1.1.1", "8.8.8.8", "9.9.9.9"]);
const IRRAGGIUNGIBILE = new Set(["ECONNREFUSED", "ETIMEOUT", "ECONNRESET", "EREFUSED"]);
let soloPubblico = false;

export async function chiediDns<T>(fn: (r: Pick<dns.promises.Resolver, "resolveTxt" | "resolveMx" | "resolve6" | "resolveCaa" | "resolveNs">) => Promise<T>): Promise<T> {
  if (!soloPubblico) {
    try {
      return await fn(dns.promises);
    } catch (e) {
      if (!IRRAGGIUNGIBILE.has((e as NodeJS.ErrnoException).code ?? "")) throw e;
      soloPubblico = true;
    }
  }
  return fn(pubblico);
}

const txt = (nome: string) => chiediDns((r) => r.resolveTxt(nome)).then((r) => r.map((x) => x.join("")), () => [] as string[]);

/** Common DKIM selectors of the big providers; DKIM keys cannot be listed, only guessed. */
const SELETTORI_DKIM = ["google", "selector1", "selector2", "default", "k1", "k2", "s1", "s2", "mail", "dkim", "zoho", "zmail", "mxvault", "protonmail", "fm1", "smtp", "aruba", "register"];

export type Posta = {
  mx: string[];
  spf: string | null;
  dmarc: string | null;
  dkim: string[];
  mtaSts: boolean;
  bimi: boolean;
};

export async function posta(dominio: string): Promise<Posta> {
  const [radice, dmarc, mx, sts, bimi, dkim] = await Promise.all([
    txt(dominio),
    txt(`_dmarc.${dominio}`),
    chiediDns((r) => r.resolveMx(dominio)).catch(() => []),
    txt(`_mta-sts.${dominio}`),
    txt(`default._bimi.${dominio}`),
    aGruppi(SELETTORI_DKIM, 6, async (s) => ((await txt(`${s}._domainkey.${dominio}`)).some((r) => /p=/i.test(r)) ? s : null)),
  ]);
  return {
    mx: mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange.toLowerCase()),
    spf: radice.find((r) => /^v=spf1/i.test(r)) ?? null,
    dmarc: dmarc.find((r) => /^v=dmarc1/i.test(r)) ?? null,
    dkim: dkim.filter((x): x is string => x !== null),
    mtaSts: sts.some((r) => /^v=stsv1/i.test(r)),
    bimi: bimi.some((r) => /^v=bimi1/i.test(r)),
  };
}

/** Counts the DNS lookups an SPF record costs; above ten, receivers treat it as broken. */
export async function lookupSpf(record: string, profondita = 0): Promise<number> {
  if (profondita > 5) return 0;
  let n = 0;
  for (const parte of record.split(/\s+/)) {
    const m = parte.match(/^[+~?-]?(include|redirect)[:=](.+)$/i);
    if (m) {
      n++;
      const figlio = (await txt(m[2]!)).find((r) => /^v=spf1/i.test(r));
      if (figlio) n += await lookupSpf(figlio, profondita + 1);
    } else if (/^[+~?-]?(a|mx|ptr|exists)([:/]|$)/i.test(parte)) n++;
  }
  return n;
}

export async function dnsVari(host: string, dominio: string) {
  const [aaaa, caa, ns] = await Promise.all([
    chiediDns((r) => r.resolve6(host)).catch(() => [] as string[]),
    chiediDns((r) => r.resolveCaa(dominio)).catch(() => [] as dns.CaaRecord[]),
    chiediDns((r) => r.resolveNs(dominio)).catch(() => [] as string[]),
  ]);
  return { ipv6: aaaa.length > 0, caa: caa.map((c) => c.issue ?? c.issuewild ?? "").filter(Boolean), ns: ns.map((n) => n.toLowerCase()) };
}

let registri: Promise<Map<string, string>> | null = null;
function serverRdap(): Promise<Map<string, string>> {
  registri ??= fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(8000) })
    .then((r) => r.json() as Promise<{ services: [string[], string[]][] }>)
    .then((j) => new Map(j.services.flatMap(([tld, url]) => tld.map((t) => [t.toLowerCase(), url[0] ?? ""] as const))))
    .catch(() => new Map<string, string>());
  return registri;
}

export type Registrazione = { scade: Date | null; registrar: string | null; dnssec: boolean | null };

/** Expiry, registrar and DNSSEC from RDAP, the public successor of whois. Some registries (.it) do not offer it. */
export async function rdap(dominio: string): Promise<Registrazione | null> {
  try {
    const base = (await serverRdap()).get(dominio.split(".").pop() ?? "");
    if (!base) return null;
    const r = await fetch(`${base.replace(/\/?$/, "/")}domain/${encodeURIComponent(dominio)}`, { signal: AbortSignal.timeout(8000), headers: { accept: "application/rdap+json, application/json" } });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      events?: { eventAction?: string; eventDate?: string }[];
      secureDNS?: { delegationSigned?: boolean };
      entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[];
    };
    const e = j.events?.find((x) => x.eventAction === "expiration")?.eventDate;
    const reg = j.entities?.find((x) => x.roles?.includes("registrar"));
    const fn = reg?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3];
    return { scade: e ? new Date(e) : null, registrar: typeof fn === "string" ? fn : null, dnssec: j.secureDNS?.delegationSigned ?? null };
  } catch {
    return null;
  }
}
