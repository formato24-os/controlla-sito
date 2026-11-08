import { T } from "../lang.js";
import { intestazione } from "../net.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, voto } from "./util.js";

/** True when robots.txt forbids the whole site to `agente` (or to every crawler with "*"). */
export function robotsBlocca(testo: string, agente = "*"): boolean {
  const gruppi: { agenti: string[]; regole: string[] }[] = [];
  let corrente: { agenti: string[]; regole: string[] } | null = null;
  for (const grezza of testo.split(/\r?\n/)) {
    const riga = grezza.replace(/#.*/, "").trim();
    if (!riga) continue;
    const i = riga.indexOf(":");
    if (i < 0) continue;
    const k = riga.slice(0, i).trim().toLowerCase();
    const v = riga.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!corrente || corrente.regole.length) gruppi.push((corrente = { agenti: [], regole: [] }));
      corrente.agenti.push(v.toLowerCase());
    } else if (corrente && (k === "disallow" || k === "allow")) corrente.regole.push(`${k}:${v}`);
  }
  const a = agente.toLowerCase();
  const gruppo = gruppi.find((g) => g.agenti.includes(a)) ?? gruppi.find((g) => g.agenti.includes("*"));
  return Boolean(gruppo && gruppo.regole.includes("disallow:/") && !gruppo.regole.includes("allow:/"));
}

export function seo(d: Dati): Area {
  const p = d.pagina;
  const out: Controllo[] = [];
  const lt = p.titolo?.length ?? 0;
  out.push(c("titolo", T("Titolo per Google", "Title tag"), !p.titolo ? "problema" : lt < 25 || lt > 65 ? "attenzione" : "ok",
    p.titolo ? `«${p.titolo.slice(0, 80)}» (${lt} ${T("caratteri", "characters")}).` : T("La pagina non ha un titolo.", "The page has no title."),
    T("È la riga blu nei risultati di Google: 30-60 caratteri, con cosa fai e dove.", "It is the blue line in Google results: 30–60 characters saying what you do and where.")));
  const ld = p.descrizione?.length ?? 0;
  out.push(c("descrizione", T("Descrizione per Google", "Meta description"), !p.descrizione ? "problema" : ld < 70 || ld > 170 ? "attenzione" : "ok",
    p.descrizione ? `${ld} ${T("caratteri", "characters")}.` : T("Manca: Google ne inventerà una con frasi prese a caso.", "Missing: Google will make one up from random sentences."),
    T("È il testo sotto il titolo nei risultati: è quello che convince a cliccare.", "It is the text under the title in results: it is what earns the click.")));

  const h1 = p.titoli.filter((t) => t.livello === 1);
  out.push(c("h1", T("Titolo principale (H1)", "Main heading (H1)"), h1.length === 1 ? "ok" : h1.length === 0 ? "problema" : "attenzione",
    h1.length === 1 ? `«${h1[0]!.testo.slice(0, 80)}»` : h1.length === 0 ? T("Nessun H1.", "No H1.") : T(`${h1.length} titoli H1: dovrebbe essercene uno.`, `${h1.length} H1 headings: there should be one.`),
    T("Google lo usa per capire di cosa parla la pagina.", "Google uses it to understand what the page is about.")));
  const salti = p.titoli.some((t, i) => i > 0 && t.livello > p.titoli[i - 1]!.livello + 1);
  out.push(c("gerarchia", T("Ordine dei titoli", "Heading order"), salti ? "attenzione" : "ok",
    salti ? T("Si salta qualche livello (es. da H2 a H4).", "Some levels are skipped (e.g. H2 to H4).") : T("I titoli seguono un ordine logico.", "Headings follow a logical order."),
    T("Un indice ordinato aiuta Google e chi usa un lettore di schermo.", "A tidy outline helps Google and screen-reader users.")));

  const xRobots = intestazione(d.risposta.headers, "x-robots-tag") ?? "";
  if (p.robots.includes("noindex") || /noindex/i.test(xRobots)) out.push(c("noindex", T("Pagina nascosta a Google", "Page hidden from Google"), "problema",
    T(`La pagina chiede di non comparire nei risultati (${/noindex/i.test(xRobots) ? "X-Robots-Tag" : "meta robots"}).`, `The page asks not to appear in results (${/noindex/i.test(xRobots) ? "X-Robots-Tag" : "meta robots"}).`),
    T("Con questa impostazione il sito non si trova su Google.", "With this setting the site cannot be found on Google."),
    T("Togli «noindex»: di solito è rimasto dal sito in costruzione.", "Remove “noindex”: it is usually left over from staging.")));
  if (d.robots !== null && robotsBlocca(d.robots, "googlebot")) out.push(c("robots", T("Sito bloccato per Google", "Site blocked for Google"), "problema",
    T("robots.txt vieta a Google di leggere il sito.", "robots.txt forbids Google from crawling the site."),
    T("Succede quando si dimentica l'impostazione del sito in costruzione.", "It happens when the staging setting is forgotten.")));

  if (p.canonical) {
    const stessoHost = (() => {
      try {
        return new URL(p.canonical).hostname === d.host;
      } catch {
        return false;
      }
    })();
    out.push(c("canonical", T("Indirizzo canonico", "Canonical URL"), stessoHost ? "ok" : "problema",
      stessoHost ? T(`Punta a ${p.canonical}.`, `Points to ${p.canonical}.`) : T(`Punta a un altro dominio: ${p.canonical}.`, `Points to another domain: ${p.canonical}.`),
      T("Dice a Google qual è la versione ufficiale della pagina: se punta altrove, Google mostra l'altra.", "Tells Google which version is official: if it points elsewhere, Google shows the other one.")));
  } else out.push(c("canonical", T("Indirizzo canonico", "Canonical URL"), "attenzione", T("Assente.", "Missing."),
    T("Senza, varianti dello stesso indirizzo (con ?utm, con o senza www) competono fra loro.", "Without it, URL variants (with ?utm, with/without www) compete with each other.")));

  if (d.altroHost) out.push(c("www", T("Con e senza www", "With and without www"), d.altroHost.finisceQui === true ? "ok" : d.altroHost.finisceQui === false ? "attenzione" : "info",
    d.altroHost.finisceQui === true ? T(`${d.altroHost.host} porta qui.`, `${d.altroHost.host} redirects here.`) : d.altroHost.finisceQui === false ? T(`${d.altroHost.host} apre un'altra versione invece di portare qui.`, `${d.altroHost.host} serves a separate copy instead of redirecting here.`) : T(`${d.altroHost.host} non risponde.`, `${d.altroHost.host} does not answer.`),
    T("Due versioni dello stesso sito dividono il punteggio su Google.", "Two copies of the same site split your Google ranking.")));

  if (p.hreflang.length) {
    const senzaDefault = !p.hreflang.some((h) => h.lingua === "x-default");
    out.push(c("hreflang", "hreflang", senzaDefault ? "attenzione" : "ok", T(`${p.hreflang.length} lingue dichiarate${senzaDefault ? ", senza x-default" : ""}.`, `${p.hreflang.length} languages declared${senzaDefault ? ", no x-default" : ""}.`),
      T("Indica a Google quale versione mostrare in ogni paese.", "Tells Google which version to show in each country.")));
  }

  if (d.sitemap) {
    const rotti = d.sitemap.campione.filter((s) => s.status !== 200);
    out.push(c("sitemap", "Sitemap", rotti.length ? "attenzione" : "ok",
      T(`${d.sitemap.urls} indirizzi${d.sitemap.indice ? " (nel primo file dell'indice)" : ""}${rotti.length ? `; ${rotti.length} su ${d.sitemap.campione.length} provati non rispondono 200` : ""}.`, `${d.sitemap.urls} URLs${d.sitemap.indice ? " (in the first file of the index)" : ""}${rotti.length ? `; ${rotti.length} of ${d.sitemap.campione.length} tested do not return 200` : ""}.`),
      T("Aiuta Google a trovare tutte le pagine; un indirizzo rotto nella sitemap fa perdere fiducia.", "Helps Google find every page; broken URLs in it erode trust.")));
  } else out.push(c("sitemap", "Sitemap", "attenzione", T("Non trovata (né in robots.txt né in /sitemap.xml).", "Not found (neither in robots.txt nor /sitemap.xml)."),
    T("Aiuta Google a trovare tutte le pagine, anche le nuove.", "Helps Google discover every page, new ones included.")));

  const rotti = d.linkInterni.filter((s) => s.status >= 400 || s.status === 0);
  if (d.linkInterni.length) out.push(c("linkrotti", T("Collegamenti interni rotti", "Broken internal links"), rotti.length ? "problema" : "ok",
    rotti.length ? T(`${rotti.length} su ${d.linkInterni.length}: ${rotti.slice(0, 3).map((r) => `${new URL(r.url).pathname} (${r.status || "—"})`).join(", ")}.`, `${rotti.length} of ${d.linkInterni.length}: ${rotti.slice(0, 3).map((r) => `${new URL(r.url).pathname} (${r.status || "—"})`).join(", ")}.`) : T(`Tutti i ${d.linkInterni.length} provati funzionano.`, `All ${d.linkInterni.length} tested work.`),
    T("Un link rotto è un vicolo cieco per il visitatore e per Google.", "A broken link is a dead end for visitors and for Google.")));

  if (d.pagina404 !== null) out.push(c("404", T("Pagine che non esistono", "Missing pages"), d.pagina404 === 404 || d.pagina404 === 410 ? "ok" : "attenzione",
    d.pagina404 === 404 || d.pagina404 === 410 ? T("Un indirizzo inventato risponde 404, come deve.", "A made-up URL returns 404, as it should.") : T(`Un indirizzo inventato risponde ${d.pagina404} invece di 404.`, `A made-up URL returns ${d.pagina404} instead of 404.`),
    T("Se le pagine inesistenti rispondono «tutto bene», Google le indicizza come contenuti doppi.", "If missing pages answer “OK”, Google indexes them as duplicate content (soft 404).")));

  const jl = p.jsonLd;
  const locale = jl.tipi.some((t) => /LocalBusiness|Organization|Store|Restaurant|Dentist|Physician|Professional|Service|Hotel|Shop|Corporation|Person/i.test(t));
  out.push(c("schema", T("Dati strutturati", "Structured data"), jl.errori ? "problema" : locale ? "ok" : "attenzione",
    jl.errori ? T(`${jl.errori} blocchi JSON-LD scritti male: Google li ignora.`, `${jl.errori} malformed JSON-LD blocks: Google ignores them.`) : jl.tipi.length ? T(`Presenti: ${jl.tipi.slice(0, 6).join(", ")}.`, `Present: ${jl.tipi.slice(0, 6).join(", ")}.`) : T("Nessuno.", "None."),
    T("Sono orari, indirizzo, recensioni e domande che Google mostra in evidenza.", "Opening hours, address, reviews and FAQs that Google shows as rich results."),
    T("Aggiungi uno schema LocalBusiness (o Organization) con nome, telefono, indirizzo e orari.", "Add a LocalBusiness (or Organization) schema with name, phone, address and hours.")));
  const azienda = jl.oggetti.find((o) => /LocalBusiness|Store|Restaurant|Dentist|Physician|ProfessionalService|Hotel/i.test(String((o as Record<string, unknown>)["@type"]))) as Record<string, unknown> | undefined;
  if (azienda) {
    const mancano = ["name", "telephone", "address", "openingHoursSpecification|openingHours", "url"].filter((k) => !k.split("|").some((x) => azienda[x]));
    out.push(c("schemalocale", T("Scheda attività completa", "Local business details"), mancano.length ? "attenzione" : "ok",
      mancano.length ? T(`Mancano: ${mancano.map((m) => m.split("|")[0]).join(", ")}.`, `Missing: ${mancano.map((m) => m.split("|")[0]).join(", ")}.`) : T("Nome, telefono, indirizzo, orari e sito ci sono tutti.", "Name, phone, address, hours and URL are all there."),
      T("Devono coincidere con la scheda Google Business: è così che Google capisce che sono la stessa attività.", "They must match your Google Business Profile: that is how Google links the two.")));
  }

  const og = p.og;
  const ogMancano = ["title", "description", "image"].filter((k) => !og[k]);
  const ogRotta = d.ogImmagine && (d.ogImmagine.status !== 200 || !/^image\//.test(d.ogImmagine.tipo ?? ""));
  out.push(c("anteprima", T("Anteprima su WhatsApp e social", "Link preview (WhatsApp, social)"), ogMancano.includes("image") || ogRotta ? "problema" : ogMancano.length ? "attenzione" : "ok",
    ogRotta ? T("L'immagine dell'anteprima non si apre.", "The preview image does not load.") : ogMancano.length ? T(`Mancano og:${ogMancano.join(", og:")}.`, `Missing og:${ogMancano.join(", og:")}.`) : T(`Titolo, descrizione e immagine pronti${p.twitterCard ? ", anche per X" : ""}.`, `Title, description and image ready${p.twitterCard ? ", X card too" : ""}.`),
    T("Un link con l'anteprima viene cliccato molto di più di un indirizzo nudo.", "A link with a preview gets far more clicks than a bare URL.")));

  out.push(c("mobile", T("Pensato per il telefono", "Mobile-friendly"), p.viewport ? "ok" : "problema",
    p.viewport ? T("La pagina si adatta allo schermo.", "The page adapts to the screen.") : T("Manca il meta viewport.", "The viewport meta tag is missing."),
    T("Google valuta la versione mobile del sito.", "Google ranks the mobile version of the site.")));
  out.push(c("contenuto", T("Quantità di testo", "Amount of text"), p.parole < 200 ? "attenzione" : "ok", T(`${p.parole} parole visibili.`, `${p.parole} visible words.`),
    T("Con poco testo Google non ha abbastanza per capire per quali ricerche mostrarti.", "With little text Google cannot tell which searches you should appear for.")));
  out.push(c("icona", T("Icona del sito", "Favicon"), p.icona && p.iconaApple ? "ok" : p.icona ? "attenzione" : "problema",
    p.icona ? (p.iconaApple ? T("Presente, anche per l'iPhone.", "Present, including the iPhone icon.") : T("Presente, ma non quella per l'iPhone.", "Present, but no apple-touch-icon.")) : T("Il sito non ha un'icona.", "The site has no favicon."),
    T("È il simbolo nella scheda del browser e nei risultati di Google da telefono.", "It shows in browser tabs and in Google's mobile results.")));
  return { id: "seo", nome: T("Google e social", "Google & social"), voto: voto(out), controlli: out };
}
