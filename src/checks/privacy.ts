import { T } from "../lang.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, pivaValida, trovaPiva, voto } from "./util.js";

const TRACCIANTI: [RegExp, string][] = [
  [/googletagmanager\.com\/gtag|google-analytics\.com|gtag\(\s*['"]config/i, "Google Analytics"],
  [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i, "Google Tag Manager"],
  [/googleadservices\.com|AW-\d{6,}|googlesyndication\.com|doubleclick\.net/i, "Google Ads"],
  [/connect\.facebook\.net|fbq\(/i, "Meta Pixel"],
  [/static\.hotjar\.com|hotjar\.com/i, "Hotjar"],
  [/analytics\.tiktok\.com|ttq\.load/i, "TikTok Pixel"],
  [/snap\.licdn\.com|_linkedin_partner_id/i, "LinkedIn Insight"],
  [/clarity\.ms/i, "Microsoft Clarity"],
  [/bat\.bing\.com/i, "Microsoft Ads"],
  [/js\.hs-scripts\.com|js\.hs-analytics\.net/i, "HubSpot"],
  [/s\.pinimg\.com\/ct|pintrk\(/i, "Pinterest Tag"],
  [/static\.ads-twitter\.com|twq\(/i, "X (Twitter) Pixel"],
  [/mc\.yandex\.ru/i, "Yandex Metrica"],
  [/criteo\.(com|net)/i, "Criteo"],
];
const COOKIE_TRACCIANTI = /^(_ga|_gid|_gat|_gcl_|_fbp|_fbc|_hj|_clck|_clsk|_ttp|_uetsid|_uetvid|__hstc|hubspotutk|_pin_unauth|li_|ajs_|mp_|_tt_)/i;
const CMP = /iubenda|cookiebot|cookieyes|complianz|onetrust|usercentrics|klaro|cookie-law-info|cookiehub|didomi|termly|consentmanager|cookie-?consent|tarteaucitron|osano|quantcast|cookiefirst|axeptio|silktide/i;

export function privacy(d: Dati): Area {
  const out: Controllo[] = [];
  const html = d.risposta.corpo;
  const cmp = CMP.test(html);
  const tracce = TRACCIANTI.filter(([re]) => re.test(html)).map(([, n]) => n);

  out.push(c("banner", T("Banner dei cookie", "Cookie banner"), cmp ? "ok" : tracce.length ? "problema" : "info",
    cmp ? T("C'è un sistema per chiedere il consenso.", "There is a consent management platform.") : tracce.length ? T("Nessun sistema di consenso, ma la pagina usa strumenti di tracciamento.", "No consent system, yet the page uses tracking tools.") : T("Nessun banner: serve solo con cookie non tecnici.", "No banner: only needed with non-essential cookies."),
    T("Il Garante Privacy (e ogni autorità europea) sanziona i siti che tracciano senza chiedere prima.", "EU data protection authorities fine sites that track without asking first."),
    T("Usa un sistema di consenso (iubenda, Cookiebot, Complianz…) che blocchi gli script fino al «sì».", "Use a consent platform (iubenda, Cookiebot, Complianz…) that blocks scripts until “yes”.")));

  if (tracce.length) {
    out.push(c("traccianti", T("Strumenti di tracciamento", "Tracking tools"), cmp ? "info" : "problema",
      `${tracce.join(", ")}${cmp ? T(": verifica che partano solo dopo il consenso.", ": check they only start after consent.") : T(", senza un sistema di consenso.", ", without any consent system.")}`,
      T("Devono partire solo dopo che il visitatore ha detto sì.", "They must only start after the visitor says yes.")));
  }

  const cookie = d.risposta.headers["set-cookie"];
  const nomi = (Array.isArray(cookie) ? cookie : cookie ? [cookie] : []).map((x) => x.split("=")[0]!.trim()).filter(Boolean);
  const daTraccia = nomi.filter((n) => COOKIE_TRACCIANTI.test(n));
  if (nomi.length) out.push(c("cookie", T("Cookie prima del consenso", "Cookies before consent"), daTraccia.length ? "problema" : "attenzione",
    daTraccia.length ? T(`Alla prima visita arrivano cookie di tracciamento: ${daTraccia.join(", ")}.`, `Tracking cookies are set on the first visit: ${daTraccia.join(", ")}.`) : T(`Alla prima visita il server imposta ${nomi.length} cookie (${nomi.slice(0, 4).join(", ")}).`, `The server sets ${nomi.length} cookies on the first visit (${nomi.slice(0, 4).join(", ")}).`),
    T("Senza consenso sono ammessi solo i cookie tecnici.", "Only strictly necessary cookies are allowed without consent.")));

  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html)) out.push(c("font", T("Font caricati da Google", "Fonts loaded from Google"), "attenzione",
    T("I caratteri arrivano dai server di Google, che ricevono l'IP di ogni visitatore.", "Fonts come from Google's servers, which receive every visitor's IP."),
    T("Un tribunale tedesco (LG München, 2022) l'ha giudicato un trasferimento di dati senza consenso.", "A German court (LG München, 2022) ruled it an unlawful data transfer."),
    T("Scarica i font e servili dal tuo dominio: è anche più veloce.", "Self-host the fonts: it is also faster.")));

  const embed = d.pagina.iframe.filter((u) => /youtube\.com\/embed|google\.[a-z.]+\/maps|maps\.google|player\.vimeo\.com/i.test(u));
  if (embed.length) out.push(c("embed", T("Video e mappe incorporati", "Embedded videos and maps"), "attenzione",
    T(`${embed.length} contenuti esterni che contattano altri server appena si apre la pagina.`, `${embed.length} embeds that contact third-party servers as soon as the page opens.`),
    T("YouTube e Maps impostano cookie di tracciamento prima di ogni consenso.", "YouTube and Maps set tracking cookies before any consent."),
    T("Mostra un'anteprima e carica il contenuto al clic, o usa youtube-nocookie.com.", "Show a preview and load on click, or use youtube-nocookie.com.")));

  if (/google\.com\/recaptcha|recaptcha\/api\.js/i.test(html)) out.push(c("recaptcha", "reCAPTCHA", "info",
    T("La pagina usa reCAPTCHA, che manda dati del visitatore a Google.", "The page uses reCAPTCHA, which sends visitor data to Google."),
    T("Va nominato nell'informativa; esistono alternative europee senza cookie.", "It must be listed in the privacy policy; cookieless EU alternatives exist.")));

  const testiLink = d.pagina.link.map((l) => `${l.href} ${l.testo}`.toLowerCase());
  const haPrivacy = testiLink.some((l) => /privacy|datenschutz|confidentialit/.test(l));
  const haCookie = testiLink.some((l) => l.includes("cookie"));
  out.push(c("informativa", T("Informativa privacy", "Privacy policy"), haPrivacy ? "ok" : "problema",
    haPrivacy ? T("C'è un collegamento all'informativa.", "There is a link to the privacy policy.") : T("Nessun collegamento all'informativa.", "No link to a privacy policy."),
    T("È obbligatoria per qualsiasi sito che raccoglie dati, anche solo con un modulo.", "Required for any site collecting data, even through a contact form.")));
  if (cmp || tracce.length || nomi.length) out.push(c("cookiepolicy", "Cookie policy", haCookie ? "ok" : "attenzione",
    haCookie ? T("C'è la pagina sui cookie.", "There is a cookie policy page.") : T("Nessuna pagina che spiega i cookie.", "No page explaining the cookies."),
    T("Va pubblicata quando il sito usa cookie.", "Required when the site uses cookies.")));

  const piva = trovaPiva(d.pagina.testo);
  const valide = piva.filter(pivaValida);
  const italiano = /^it/i.test(d.pagina.lingua ?? "") || d.host.endsWith(".it");
  if (piva.length || italiano) out.push(c("piva", T("Partita IVA", "Italian VAT number"),
    valide.length ? "ok" : piva.length ? "problema" : "attenzione",
    valide.length ? T(`Presente e con la cifra di controllo corretta (${valide[0]}).`, `Present, with a valid check digit (${valide[0]}).`)
      : piva.length ? T(`Scritta ${piva[0]}, ma la cifra di controllo non torna: probabilmente c'è un errore di battitura.`, `Written as ${piva[0]}, but the check digit is wrong: probably a typo.`)
      : T("Non trovo la Partita IVA nella pagina.", "No VAT number found on the page."),
    T("Le imprese italiane devono indicarla nella home del sito (art. 35 DPR 633/72), pena una sanzione.", "Italian businesses must show it on the home page (art. 35 DPR 633/72), or face a fine."),
    T("Scrivila nel piè di pagina insieme alla ragione sociale.", "Put it in the footer with the company name.")));

  const accessibilita = testiLink.some((l) => /accessibilit/.test(l));
  out.push(c("dichiarazione", T("Dichiarazione di accessibilità", "Accessibility statement"), accessibilita ? "ok" : "info",
    accessibilita ? T("C'è un collegamento alla dichiarazione di accessibilità.", "There is a link to an accessibility statement.") : T("Nessuna dichiarazione di accessibilità.", "No accessibility statement."),
    T("Dal 28 giugno 2025 l'European Accessibility Act la richiede a molte imprese che vendono online (escluse le microimprese di servizi).", "Since 28 June 2025 the European Accessibility Act requires it from many businesses selling online (service micro-enterprises excluded).")));

  return { id: "privacy", nome: T("Privacy e regole", "Privacy & compliance"), voto: voto(out), controlli: out };
}
