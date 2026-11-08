import { T } from "../lang.js";
import { intestazione } from "../net.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, hostDi, voto } from "./util.js";

const kb = (b: number) => `${Math.round(b / 1024)} KB`;

export function velocita(d: Dati): Area {
  const out: Controllo[] = [];
  const p = d.pagina;
  const h = (n: string) => intestazione(d.risposta.headers, n);

  out.push(c("ttfb", T("Risposta del server", "Server response"), d.risposta.ttfbMs < 600 ? "ok" : d.risposta.ttfbMs < 1500 ? "attenzione" : "problema",
    T(`${d.risposta.ttfbMs} ms prima del primo byte.`, `${d.risposta.ttfbMs} ms to first byte.`),
    T("Sopra il secondo il visitatore fissa una pagina bianca prima ancora che inizi a caricare.", "Above one second visitors stare at a blank page before anything starts loading."),
    T("Usa una cache di pagina o un CDN.", "Use page caching or a CDN.")));

  const enc = h("content-encoding") ?? "";
  out.push(c("compressione", T("Compressione", "Compression"), /br|zstd/i.test(enc) ? "ok" : /gzip|deflate/i.test(enc) ? "ok" : "attenzione",
    T(`HTML di ${kb(d.risposta.byte)} sulla rete${enc ? `, compresso con ${enc}` : ", non compresso"}.`, `${kb(d.risposta.byte)} of HTML on the wire${enc ? `, ${enc}-compressed` : ", uncompressed"}.`),
    T("La compressione dimezza i tempi su una rete mobile lenta.", "Compression halves load time on slow mobile networks.")));

  const pesanti = d.risorse.filter((r) => (r.byte ?? 0) > 400_000);
  const totale = d.risorse.reduce((s, r) => s + (r.byte ?? 0), 0);
  if (d.risorse.length) out.push(c("peso", T("Peso dei file", "File weight"), totale > 4_000_000 || pesanti.length > 2 ? "problema" : totale > 2_000_000 || pesanti.length ? "attenzione" : "ok",
    T(`${d.risorse.length} file principali per ${kb(totale)}${pesanti.length ? `; i più pesanti: ${pesanti.slice(0, 3).map((r) => `${r.url.split("/").pop()?.slice(0, 30)} (${kb(r.byte!)})`).join(", ")}` : ""}.`,
      `${d.risorse.length} main files totalling ${kb(totale)}${pesanti.length ? `; heaviest: ${pesanti.slice(0, 3).map((r) => `${r.url.split("/").pop()?.slice(0, 30)} (${kb(r.byte!)})`).join(", ")}` : ""}.`),
    T("Ogni megabyte su rete mobile è circa un secondo in più di attesa.", "Every megabyte on mobile data is roughly one more second of waiting."),
    T("Comprimi le immagini e servile alla misura in cui vengono mostrate.", "Compress images and serve them at the size they are displayed.")));

  const statici = d.risorse.filter((r) => r.status === 200 && /javascript|css|image|font/i.test(r.tipo ?? ""));
  const senzaCache = statici.filter((r) => !/max-age=(\d{5,})|immutable/i.test(r.cache ?? ""));
  if (statici.length) out.push(c("cache", T("Cache dei file", "Asset caching"), senzaCache.length > statici.length / 2 ? "attenzione" : "ok",
    T(`${statici.length - senzaCache.length} file su ${statici.length} restano in cache almeno un giorno.`, `${statici.length - senzaCache.length} of ${statici.length} files are cached for at least a day.`),
    T("Chi torna sul sito non dovrebbe riscaricare tutto.", "Returning visitors should not download everything again."),
    "Cache-Control: public, max-age=31536000, immutable"));

  const rotte = d.risorse.filter((r) => r.status >= 400);
  if (rotte.length) out.push(c("risorserotte", T("File che non si caricano", "Files that fail to load"), "problema",
    T(`${rotte.length} file rispondono con errore: ${rotte.slice(0, 2).map((r) => r.url.slice(0, 70)).join(", ")}.`, `${rotte.length} files return errors: ${rotte.slice(0, 2).map((r) => r.url.slice(0, 70)).join(", ")}.`),
    T("Uno script o un'immagine che manca rompe pezzi della pagina.", "A missing script or image breaks parts of the page.")));

  out.push(c("bloccanti", T("Script che bloccano la pagina", "Render-blocking scripts"), p.scriptBloccanti > 2 ? "attenzione" : "ok",
    T(`${p.scriptBloccanti} script nella testa senza async o defer.`, `${p.scriptBloccanti} scripts in the head without async or defer.`),
    T("Il browser non disegna niente finché non li ha scaricati ed eseguiti tutti.", "The browser paints nothing until it has downloaded and run them all."),
    T("Aggiungi defer agli script che non servono subito.", "Add defer to scripts that are not needed immediately.")));

  const terzi = new Set([...p.script, ...p.fogli].map(hostDi).filter((x) => x && x !== hostDi(d.url)));
  out.push(c("terzi", T("Servizi esterni", "Third-party services"), terzi.size <= 4 ? "ok" : terzi.size <= 9 ? "attenzione" : "problema",
    T(`${p.script.length} script da ${terzi.size} domini esterni${terzi.size ? ` (${[...terzi].slice(0, 5).join(", ")})` : ""}.`, `${p.script.length} scripts from ${terzi.size} external domains${terzi.size ? ` (${[...terzi].slice(0, 5).join(", ")})` : ""}.`),
    T("Ogni servizio esterno è una connessione in più, e se uno è lento rallenta tutto.", "Each external service is one more connection, and a slow one slows everything.")));

  const im = p.immagini.filter((i) => i.src);
  if (im.length) {
    const vecchie = im.filter((i) => /\.(jpe?g|png|gif|bmp)(\?|$)/i.test(i.src)).length;
    out.push(c("formati", T("Formato delle immagini", "Image formats"), vecchie > 3 ? "attenzione" : "ok",
      T(`${vecchie} immagini su ${im.length} in JPG/PNG/GIF.`, `${vecchie} of ${im.length} images are JPG/PNG/GIF.`),
      T("WebP e AVIF pesano fino al 70% in meno a parità di qualità.", "WebP and AVIF weigh up to 70% less at the same quality.")));
    const senzaMisure = im.filter((i) => !i.dimensioni).length;
    out.push(c("cls", T("Immagini senza misure", "Images without dimensions"), senzaMisure > 3 ? "attenzione" : "ok",
      T(`${senzaMisure} immagini senza width e height.`, `${senzaMisure} images without width and height.`),
      T("Senza misure la pagina «salta» mentre carica, e Google lo misura (CLS).", "Without them the layout jumps while loading, and Google measures it (CLS).")));
    if (im.length > 6) {
      const senzaLazy = im.slice(3).filter((i) => !i.lazy).length;
      out.push(c("lazy", T("Caricamento differito", "Lazy loading"), senzaLazy > 4 ? "attenzione" : "ok",
        T(`${senzaLazy} immagini più in basso si caricano subito.`, `${senzaLazy} below-the-fold images load immediately.`),
        T("Caricarle quando arrivano sullo schermo accelera l'apertura.", "Loading them when they scroll into view speeds up the first paint."),
        'loading="lazy"'));
    }
  }

  const altSvc = h("alt-svc") ?? "";
  out.push(c("http3", "HTTP/3", /h3/.test(altSvc) ? "ok" : "info",
    /h3/.test(altSvc) ? T("Il server offre HTTP/3.", "The server offers HTTP/3.") : T("Il server non annuncia HTTP/3.", "The server does not advertise HTTP/3."),
    T("Su reti mobili instabili HTTP/3 recupera meglio le perdite.", "HTTP/3 recovers better from packet loss on flaky mobile networks.")));
  return { id: "velocita", nome: T("Velocità", "Performance"), voto: voto(out), controlli: out };
}
