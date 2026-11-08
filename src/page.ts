/*
 * Reading a page without a browser: just enough HTML parsing to answer the checks. Regular
 * expressions on purpose — a full parser would be a dependency for a few attributes — and every
 * function tolerates broken markup by returning "not found" instead of throwing.
 */

const decodifica = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));

export const pulisci = (s: string) => decodifica(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function attributo(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (m) return decodifica(m[1] ?? m[2] ?? m[3] ?? "");
  return new RegExp(`\\s${nome}(?=[\\s>/])`, "i").test(tag) ? "" : null;
}

const tags = (html: string, nome: string) => html.match(new RegExp(`<${nome}\\b[^>]*>`, "gi")) ?? [];

function meta(html: string, chiave: string): string | null {
  for (const t of tags(html, "meta")) {
    const n = (attributo(t, "name") ?? attributo(t, "property") ?? attributo(t, "http-equiv") ?? "").toLowerCase();
    if (n === chiave) return attributo(t, "content");
  }
  return null;
}

const rel = (t: string) => (attributo(t, "rel") ?? "").toLowerCase().split(/\s+/);

/** The page as its visitors read it: no scripts, no styles, no markup. */
export function testoVisibile(html: string): string {
  return pulisci(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Inline tags join without a space: animated titles split words into one <span> per letter.
      .replace(/<\/?(span|a|b|strong|em|i|u|small|mark|sup|sub|abbr)\b[^>]*>/gi, ""),
  );
}

export type Immagine = { src: string; alt: string | null; lazy: boolean; dimensioni: boolean };
export type Campo = { tipo: string; etichettato: boolean };

export type Pagina = {
  titolo: string | null;
  descrizione: string | null;
  lingua: string | null;
  canonical: string | null;
  hreflang: { lingua: string; href: string }[];
  viewport: string | null;
  robots: string;
  refresh: string | null;
  titoli: { livello: number; testo: string }[];
  og: Record<string, string>;
  twitterCard: string | null;
  icona: boolean;
  iconaApple: boolean;
  manifest: boolean;
  jsonLd: { tipi: string[]; errori: number; oggetti: unknown[] };
  immagini: Immagine[];
  script: string[];
  scriptBloccanti: number;
  fogli: string[];
  preconnect: number;
  iframe: string[];
  link: { href: string; testo: string; etichetta: string | null }[];
  campi: Campo[];
  bottoniSenzaNome: number;
  tabindexPositivi: number;
  idDuplicati: string[];
  saltaAlContenuto: boolean;
  generatore: string | null;
  testo: string;
  parole: number;
};

function leggiJsonLd(html: string): Pagina["jsonLd"] {
  const tipi = new Set<string>();
  const oggetti: unknown[] = [];
  let errori = 0;
  const visita = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(visita);
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const t = o["@type"];
    for (const v of Array.isArray(t) ? t : [t]) if (typeof v === "string") tipi.add(v);
    if (t) oggetti.push(o);
    for (const v of Object.values(o)) if (v && typeof v === "object") visita(v);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visita(JSON.parse((m[1] ?? "").trim()));
    } catch {
      errori++;
    }
  }
  return { tipi: [...tipi], errori, oggetti };
}

function campi(html: string): Campo[] {
  const etichette = new Set(tags(html, "label").map((t) => attributo(t, "for")).filter((x): x is string => Boolean(x)));
  // Inputs wrapped inside a <label> are labelled by it.
  const avvolti = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].flatMap((m) => tags(m[1] ?? "", "(?:input|select|textarea)"));
  return [...tags(html, "input"), ...tags(html, "select"), ...tags(html, "textarea")]
    .map((t) => ({ t, tipo: (attributo(t, "type") ?? t.match(/^<(\w+)/)?.[1] ?? "text").toLowerCase() }))
    .filter(({ tipo }) => !["hidden", "submit", "button", "reset", "image"].includes(tipo))
    .map(({ t, tipo }) => {
      const id = attributo(t, "id");
      const etichettato = Boolean((id && etichette.has(id)) || attributo(t, "aria-label") || attributo(t, "aria-labelledby") || attributo(t, "title") || avvolti.includes(t));
      return { tipo, etichettato };
    });
}

export function leggiPagina(html: string, base: string): Pagina {
  const assoluto = (u: string | null) => {
    if (!u) return null;
    try {
      return new URL(u, base).toString();
    } catch {
      return null;
    }
  };
  const testa = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? "";
  const og: Record<string, string> = {};
  for (const t of tags(html, "meta")) {
    const p = (attributo(t, "property") ?? attributo(t, "name") ?? "").toLowerCase();
    const v = attributo(t, "content");
    if (p.startsWith("og:") && v) og[p.slice(3)] = v;
  }
  const ids = tags(html, "[a-z][a-z0-9]*").map((t) => attributo(t, "id")).filter((x): x is string => Boolean(x));
  const visti = new Set<string>();
  const doppi = new Set<string>();
  for (const id of ids) (visti.has(id) ? doppi : visti).add(id);
  const testo = testoVisibile(html);
  return {
    titolo: (() => {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return m?.[1] ? pulisci(m[1]) || null : null;
    })(),
    descrizione: meta(html, "description"),
    lingua: attributo(tags(html, "html")[0] ?? "", "lang"),
    canonical: assoluto(tags(html, "link").find((t) => rel(t).includes("canonical")) ? attributo(tags(html, "link").find((t) => rel(t).includes("canonical"))!, "href") : null),
    hreflang: tags(html, "link").filter((t) => rel(t).includes("alternate") && attributo(t, "hreflang")).map((t) => ({ lingua: attributo(t, "hreflang")!, href: assoluto(attributo(t, "href")) ?? "" })),
    viewport: meta(html, "viewport"),
    robots: `${meta(html, "robots") ?? ""} ${meta(html, "googlebot") ?? ""}`.toLowerCase().trim(),
    refresh: meta(html, "refresh"),
    titoli: [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ livello: Number(m[1]), testo: pulisci(m[2] ?? "") })).filter((t) => t.testo).slice(0, 80),
    og,
    twitterCard: meta(html, "twitter:card"),
    icona: tags(html, "link").some((t) => rel(t).includes("icon")),
    iconaApple: tags(html, "link").some((t) => rel(t).includes("apple-touch-icon")),
    manifest: tags(html, "link").some((t) => rel(t).includes("manifest")),
    jsonLd: leggiJsonLd(html),
    immagini: tags(html, "img").map((t) => ({
      src: assoluto(attributo(t, "src") ?? attributo(t, "data-src")) ?? "",
      alt: attributo(t, "alt"),
      lazy: (attributo(t, "loading") ?? "").toLowerCase() === "lazy",
      dimensioni: attributo(t, "width") !== null && attributo(t, "height") !== null,
    })),
    script: tags(html, "script").map((t) => assoluto(attributo(t, "src"))).filter((s): s is string => Boolean(s)),
    scriptBloccanti: tags(testa, "script").filter((t) => attributo(t, "src") && attributo(t, "async") === null && attributo(t, "defer") === null && (attributo(t, "type") ?? "") !== "module").length,
    fogli: tags(html, "link").filter((t) => rel(t).includes("stylesheet")).map((t) => assoluto(attributo(t, "href"))).filter((s): s is string => Boolean(s)),
    preconnect: tags(html, "link").filter((t) => rel(t).some((r) => r === "preconnect" || r === "dns-prefetch")).length,
    iframe: tags(html, "iframe").map((t) => assoluto(attributo(t, "src") ?? attributo(t, "data-src"))).filter((s): s is string => Boolean(s)),
    link: [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map((m) => {
        const t = ` ${m[1] ?? ""}`;
        const alt = (m[2] ?? "").match(/<img\b[^>]*>/i)?.[0];
        return { href: attributo(t, "href") ?? "", testo: pulisci(m[2] ?? "") || (alt ? attributo(alt, "alt") ?? "" : ""), etichetta: attributo(t, "aria-label") ?? attributo(t, "title") };
      })
      .filter((l) => l.href)
      .slice(0, 600),
    campi: campi(html),
    bottoniSenzaNome: [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].filter((m) => {
      const t = ` ${m[1] ?? ""}`;
      return !pulisci(m[2] ?? "") && !attributo(t, "aria-label") && !attributo(t, "aria-labelledby") && !attributo(t, "title") && !/<img\b[^>]*\salt\s*=\s*["'][^"']+/i.test(m[2] ?? "");
    }).length,
    tabindexPositivi: (html.match(/\stabindex\s*=\s*["']?[1-9]/gi) ?? []).length,
    idDuplicati: [...doppi].slice(0, 10),
    saltaAlContenuto: /<a\b[^>]*href\s*=\s*["']#(main|content|contenuto|maincontent|main-content)/i.test(html),
    generatore: meta(html, "generator"),
    testo,
    parole: testo.split(/\s+/).filter(Boolean).length,
  };
}
