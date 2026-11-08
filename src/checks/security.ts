import { T } from "../lang.js";
import { intestazione } from "../net.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, giorni, voto } from "./util.js";

export function sicurezza(d: Dati): Area {
  const out: Controllo[] = [];
  const h = (n: string) => intestazione(d.risposta.headers, n);
  const https = d.url.startsWith("https://");

  out.push(https
    ? c("https", T("Connessione protetta", "Secure connection"), d.httpVaSuHttps === false ? "attenzione" : "ok",
      d.httpVaSuHttps === false ? T("Il sito ha HTTPS, ma chi scrive http:// resta sulla versione non protetta.", "The site has HTTPS, but http:// does not redirect to it.") : T("HTTPS attivo, e http:// porta alla versione protetta.", "HTTPS is on and http:// redirects to it."),
      T("Senza HTTPS il browser scrive «Non sicuro» accanto all'indirizzo.", "Without HTTPS the browser labels the site “Not secure”."),
      T("Aggiungi un reindirizzamento permanente (301) da http:// a https://.", "Add a permanent (301) redirect from http:// to https://."))
    : c("https", T("Connessione protetta", "Secure connection"), "problema", T("Il sito non usa HTTPS.", "The site does not use HTTPS."),
      T("Chrome e Safari lo segnalano come «Non sicuro» e Google lo penalizza.", "Chrome and Safari flag it as “Not secure” and Google ranks it lower."),
      T("Attiva un certificato gratuito (Let's Encrypt) dal pannello dell'hosting.", "Enable a free certificate (Let's Encrypt) from your hosting panel.")));

  if (d.tls) {
    const g = giorni(d.tls.scade, d.adesso);
    out.push(c("certificato", T("Certificato di sicurezza", "TLS certificate"),
      !d.tls.valido || g < 14 ? "problema" : g < 30 ? "attenzione" : "ok",
      !d.tls.valido ? T(`Il browser non lo accetta (${d.tls.errore ?? "non valido"}).`, `Browsers reject it (${d.tls.errore ?? "invalid"}).`)
        : T(`Valido, scade tra ${g} giorni${d.tls.emittente ? ` (${d.tls.emittente})` : ""}.`, `Valid, expires in ${g} days${d.tls.emittente ? ` (${d.tls.emittente})` : ""}.`),
      T("Con un certificato scaduto o sbagliato, chi apre il sito vede una pagina d'errore rossa.", "With an expired or wrong certificate visitors get a red error page instead of the site."),
      T("Attiva il rinnovo automatico del certificato.", "Turn on automatic certificate renewal.")));
    const vecchio = /TLSv1(\.[01])?$/.test(d.tls.protocollo ?? "");
    out.push(c("tls", T("Versione del protocollo", "Protocol version"), vecchio ? "problema" : "ok",
      T(`Il server ha negoziato ${d.tls.protocollo ?? "?"}.`, `The server negotiated ${d.tls.protocollo ?? "?"}.`),
      T("TLS 1.0 e 1.1 sono dismessi da tutti i browser dal 2020.", "TLS 1.0 and 1.1 have been retired by every browser since 2020."),
      T("Disattiva TLS 1.0/1.1 sul server: bastano 1.2 e 1.3.", "Disable TLS 1.0/1.1 on the server: 1.2 and 1.3 are enough.")));
  }

  const hsts = h("strict-transport-security");
  if (https) {
    const eta = Number(hsts?.match(/max-age=(\d+)/i)?.[1] ?? 0);
    out.push(c("hsts", "HSTS", !hsts ? "attenzione" : eta < 15_552_000 ? "attenzione" : "ok",
      !hsts ? T("Assente.", "Missing.") : T(`max-age di ${Math.round(eta / 86400)} giorni${/includesubdomains/i.test(hsts) ? ", sottodomini compresi" : ""}${/preload/i.test(hsts) ? ", pronto per il preload" : ""}.`, `max-age of ${Math.round(eta / 86400)} days${/includesubdomains/i.test(hsts) ? ", subdomains included" : ""}${/preload/i.test(hsts) ? ", preload-ready" : ""}.`),
      T("Obbliga il browser a usare sempre HTTPS, anche se qualcuno prova a dirottare la prima connessione.", "Forces browsers to always use HTTPS, even if someone tries to hijack the first connection."),
      "Strict-Transport-Security: max-age=31536000; includeSubDomains"));
  }

  const csp = h("content-security-policy");
  out.push(c("csp", "Content-Security-Policy", !csp ? "attenzione" : /'unsafe-inline'/.test(csp) && /script-src|default-src/.test(csp) && !/'nonce-|'strict-dynamic'/.test(csp) ? "attenzione" : "ok",
    !csp ? T("Assente.", "Missing.") : /'unsafe-inline'/.test(csp) && !/'nonce-|'strict-dynamic'/.test(csp) ? T("Presente, ma permette script inline: protegge poco dagli attacchi XSS.", "Present, but allows inline scripts: little protection against XSS.") : T("Presente.", "Present."),
    T("Dice al browser da dove possono arrivare gli script: se qualcuno riesce a iniettarne uno, il browser lo blocca.", "Tells the browser where scripts may come from, so an injected one gets blocked."),
    T("Parti da una policy in sola osservazione (Content-Security-Policy-Report-Only) e stringila.", "Start with a report-only policy (Content-Security-Policy-Report-Only) and tighten it.")));

  const clickjacking = h("x-frame-options") !== null || /frame-ancestors/i.test(csp ?? "");
  out.push(c("frame", T("Protezione dal clickjacking", "Clickjacking protection"), clickjacking ? "ok" : "attenzione",
    clickjacking ? T("Il sito non può essere mostrato dentro pagine altrui.", "The site cannot be framed by other pages.") : T("Il sito può essere incorporato in una pagina truffa.", "The site can be embedded in a fraudulent page."),
    T("Chi attacca mette il sito in una cornice invisibile e fa cliccare i visitatori dove vuole lui.", "Attackers load the site in an invisible frame and trick visitors into clicking."),
    "X-Frame-Options: SAMEORIGIN"));

  const minori = [
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "Referrer-Policy"],
    ["permissions-policy", "Permissions-Policy"],
  ].filter(([n]) => h(n!) === null).map(([, nome]) => nome!);
  out.push(c("intestazioni", T("Altre protezioni del browser", "Other browser protections"), minori.length === 0 ? "ok" : minori.length === 1 ? "attenzione" : "problema",
    minori.length ? T(`Mancano: ${minori.join(", ")}.`, `Missing: ${minori.join(", ")}.`) : T("Tutte presenti.", "All present."),
    T("Bloccano attacchi comuni e limitano cosa il sito comunica ad altri siti.", "They block common attacks and limit what the site leaks to other sites."),
    T("Si aggiungono in un minuto nella configurazione del server o del CDN.", "They take a minute to add in the server or CDN configuration.")));

  const cookie = d.risposta.headers["set-cookie"];
  const cookies = Array.isArray(cookie) ? cookie : cookie ? [cookie] : [];
  if (cookies.length && https) {
    const deboli = cookies.filter((x) => !/;\s*secure/i.test(x) || !/;\s*samesite/i.test(x)).map((x) => x.split("=")[0]!.trim());
    out.push(c("cookieflag", T("Cookie protetti", "Cookie flags"), deboli.length ? "attenzione" : "ok",
      deboli.length ? T(`Senza Secure o SameSite: ${deboli.slice(0, 4).join(", ")}.`, `Missing Secure or SameSite: ${deboli.slice(0, 4).join(", ")}.`) : T("Tutti con Secure e SameSite.", "All set with Secure and SameSite."),
      T("Un cookie senza questi attributi può viaggiare in chiaro o essere usato da altri siti.", "Without these flags a cookie can travel unencrypted or be used by other sites.")));
  }

  const server = `${h("server") ?? ""} ${h("x-powered-by") ?? ""}`.trim();
  const php = server.match(/PHP\/(\d+)\.(\d+)/i);
  if (php) {
    const vecchio = Number(php[1]) < 8 || (Number(php[1]) === 8 && Number(php[2]) < 2);
    out.push(c("php", T("Versione di PHP", "PHP version"), vecchio ? "problema" : "attenzione",
      T(`Il server dichiara PHP ${php[1]}.${php[2]}${vecchio ? ", senza più aggiornamenti di sicurezza" : ""}.`, `The server announces PHP ${php[1]}.${php[2]}${vecchio ? ", which no longer gets security fixes" : ""}.`),
      T("Una versione senza aggiornamenti ha falle pubbliche, e dichiararla aiuta chi le cerca.", "An unsupported version has public vulnerabilities, and announcing it helps whoever looks for them."),
      T("Aggiorna PHP dal pannello dell'hosting e nascondi l'intestazione X-Powered-By.", "Upgrade PHP from the hosting panel and hide the X-Powered-By header.")));
  } else if (/\/\d/.test(server)) {
    out.push(c("server", T("Il server dice troppo", "Server version disclosed"), "attenzione", T(`Risponde dichiarando «${server.slice(0, 60)}».`, `It announces “${server.slice(0, 60)}”.`),
      T("La versione esatta del software aiuta chi cerca siti da attaccare.", "The exact software version helps attackers pick targets.")));
  }

  const misti = [...d.pagina.script, ...d.pagina.fogli, ...d.pagina.iframe, ...d.pagina.immagini.map((i) => i.src)].filter((u) => u.startsWith("http://"));
  if (https) out.push(c("misto", T("Contenuti non protetti", "Mixed content"), misti.length ? "problema" : "ok",
    misti.length ? T(`${misti.length} file caricati senza HTTPS (es. ${misti[0]!.slice(0, 70)}).`, `${misti.length} files loaded over plain HTTP (e.g. ${misti[0]!.slice(0, 70)}).`) : T("Tutti i file arrivano su HTTPS.", "Every file is served over HTTPS."),
    T("Il browser blocca i file non protetti e la pagina può comparire rotta.", "Browsers block insecure files and the page may look broken.")));

  const html = d.risposta.corpo;
  const jq = html.match(/jquery[.-]?(\d)\.(\d+)(?:\.\d+)?(?:\.min)?\.js/i) ?? html.match(/jquery(?:\.min)?\.js\?ver=(\d)\.(\d+)/i);
  if (jq && (Number(jq[1]) < 3 || (Number(jq[1]) === 3 && Number(jq[2]) < 5))) {
    out.push(c("jquery", T("Libreria jQuery vecchia", "Outdated jQuery"), "attenzione", T(`jQuery ${jq[1]}.${jq[2]}, con vulnerabilità note corrette dalla 3.5.`, `jQuery ${jq[1]}.${jq[2]}, with known vulnerabilities fixed in 3.5.`),
      T("Le falle di una libreria vecchia sono pubbliche e si sfruttano in automatico.", "Old library flaws are public and exploited automatically.")));
  }
  const wp = (d.pagina.generatore ?? "").match(/WordPress\s*(\d+(?:\.\d+)*)/i);
  if (wp) out.push(c("wordpress", T("Versione di WordPress esposta", "WordPress version exposed"), "attenzione", T(`La pagina dichiara WordPress ${wp[1]}.`, `The page announces WordPress ${wp[1]}.`),
    T("Chi attacca i siti WordPress cerca proprio questa riga per sapere quali falle provare.", "WordPress attackers look for exactly this line to know which exploits to try."),
    T("Rimuovi il meta «generator» (molti plugin di sicurezza lo fanno).", "Remove the “generator” meta tag (most security plugins do).")));

  out.push(c("securitytxt", "security.txt", d.securityTxt ? "ok" : "info",
    d.securityTxt ? T("Pubblicato: chi trova una falla sa a chi scriverla.", "Published: whoever finds a flaw knows whom to tell.") : T("Assente: chi trova una falla non sa a chi segnalarla.", "Missing: whoever finds a flaw does not know whom to tell."),
    T("È lo standard (RFC 9116) per ricevere segnalazioni di sicurezza invece di scoprirle dai giornali.", "It is the standard (RFC 9116) for receiving vulnerability reports.")));

  if (d.sensibili) {
    const esposti = d.sensibili.filter((s) => s.esposto).map((s) => s.percorso);
    out.push(c("esposti", T("File riservati raggiungibili", "Sensitive files exposed"), esposti.length ? "problema" : "ok",
      esposti.length ? T(`Leggibili da chiunque: ${esposti.join(", ")}.`, `Readable by anyone: ${esposti.join(", ")}.`) : T(`Nessuno dei ${d.sensibili.length} file controllati è esposto.`, `None of the ${d.sensibili.length} files checked is exposed.`),
      T("Possono contenere password del database, chiavi o l'intero codice del sito.", "They can contain database passwords, keys or the whole source code."),
      T("Bloccali subito dal server e cambia le password che contenevano.", "Block them on the server now and rotate any secret they contained.")));
  }
  return { id: "sicurezza", nome: T("Sicurezza", "Security"), voto: voto(out), controlli: out };
}
