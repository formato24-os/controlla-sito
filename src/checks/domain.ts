import { data, T } from "../lang.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, giorni, voto } from "./util.js";

export function dominio(d: Dati): Area {
  const out: Controllo[] = [];
  const { spf, dmarc, mx, dkim, mtaSts, bimi } = d.posta;
  const r = d.registrazione;
  if (r?.scade) {
    const g = giorni(r.scade, d.adesso);
    out.push(c("scadenza", T("Scadenza del dominio", "Domain expiry"), g < 30 ? "problema" : g < 60 ? "attenzione" : "ok",
      T(`Scade tra ${g} giorni (${data(r.scade)})${r.registrar ? `, presso ${r.registrar}` : ""}.`, `Expires in ${g} days (${data(r.scade)})${r.registrar ? `, at ${r.registrar}` : ""}.`),
      T("Se il dominio scade spariscono sito ed email, e qualcun altro può comprarlo.", "If the domain lapses, site and email vanish and someone else can buy it."),
      T("Attiva il rinnovo automatico presso il registrar.", "Turn on auto-renew at your registrar.")));
  } else out.push(c("scadenza", T("Scadenza del dominio", "Domain expiry"), "info",
    T(`Il registro di .${d.dominio.split(".").pop()} non la pubblica (RDAP): controllala dal pannello del registrar.`, `The .${d.dominio.split(".").pop()} registry does not publish it (RDAP): check your registrar panel.`),
    T("Se il dominio scade spariscono sito ed email.", "If the domain lapses, site and email vanish.")));
  if (r && r.dnssec !== null) out.push(c("dnssec", "DNSSEC", r.dnssec ? "ok" : "info",
    r.dnssec ? T("Attivo: le risposte DNS sono firmate.", "On: DNS answers are signed.") : T("Non attivo.", "Off."),
    T("Impedisce di dirottare il dominio falsificando le risposte DNS.", "Prevents hijacking the domain with forged DNS answers.")));
  out.push(c("caa", T("Record CAA", "CAA record"), d.dns.caa.length ? "ok" : "info",
    d.dns.caa.length ? T(`Solo ${d.dns.caa.join(", ")} può emettere certificati.`, `Only ${d.dns.caa.join(", ")} may issue certificates.`) : T("Qualsiasi autorità può emettere certificati per il dominio.", "Any authority may issue certificates for the domain."),
    T("Limita chi può emettere un certificato a vostro nome.", "Limits who can issue a certificate in your name.")));
  out.push(c("ipv6", "IPv6", d.dns.ipv6 ? "ok" : "info", d.dns.ipv6 ? T("Il sito risponde anche su IPv6.", "The site answers over IPv6 too.") : T("Solo IPv4.", "IPv4 only."),
    T("Molte reti mobili sono già su IPv6.", "Many mobile networks already run on IPv6.")));

  out.push(c("mx", T("Email sul dominio", "Email on the domain"), mx.length ? "ok" : "info",
    mx.length ? T(`Riceve email (${mx[0]}).`, `Receives email (${mx[0]}).`) : T("Il dominio non ha caselle email.", "The domain has no mailboxes."),
    T("Un indirizzo @tuodominio ispira più fiducia di un @gmail.", "An @yourdomain address inspires more trust than @gmail.")));
  if (mx.length) {
    const tutti = /[+?]all\b/i.test(spf ?? "");
    const lookup = d.spfLookup ?? 0;
    out.push(c("spf", "SPF", !spf || tutti || lookup > 10 ? "problema" : /~all/i.test(spf) ? "ok" : "ok",
      !spf ? T("Manca: chiunque può mandare email a vostro nome.", "Missing: anyone can send email in your name.") : tutti ? T("Finisce con +all o ?all: autorizza chiunque.", "Ends with +all or ?all: it authorises everyone.") : lookup > 10 ? T(`Richiede ${lookup} ricerche DNS, oltre il limite di 10: i server lo considerano rotto.`, `Needs ${lookup} DNS lookups, over the limit of 10: receivers treat it as broken.`) : T(`Presente, ${lookup} ricerche DNS su 10.`, `Present, ${lookup} of 10 DNS lookups.`),
      T("Senza SPF valido le vostre email finiscono più spesso nello spam.", "Without a valid SPF your email lands in spam more often.")));
    out.push(c("dkim", "DKIM", dkim.length ? "ok" : "info",
      dkim.length ? T(`Firma trovata (selettore ${dkim.join(", ")}).`, `Signature found (selector ${dkim.join(", ")}).`) : T("Non trovata fra i selettori più comuni (potrebbe usarne uno diverso).", "Not found among common selectors (a custom one may be in use)."),
      T("Firma le email: dimostra che non sono state alterate e che partono davvero da voi.", "Signs your email, proving it is genuine and unaltered.")));
    const politica = dmarc?.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
    out.push(c("dmarc", "DMARC", !dmarc ? "problema" : politica === "none" ? "attenzione" : "ok",
      !dmarc ? T("Manca: Gmail e Yahoo lo richiedono a chi manda email.", "Missing: Gmail and Yahoo require it from senders.") : politica === "none" ? T("Solo osservazione (p=none): non blocca chi si spaccia per voi.", "Monitoring only (p=none): it does not stop spoofing.") : T(`Attivo (p=${politica})${/rua=/i.test(dmarc) ? ", con rapporti" : ""}.`, `Enforced (p=${politica})${/rua=/i.test(dmarc) ? ", with reports" : ""}.`),
      T("Blocca le email truffa mandate a vostro nome ai vostri clienti.", "Blocks phishing emails sent in your name to your customers."),
      "v=DMARC1; p=quarantine; rua=mailto:dmarc@…"));
    out.push(c("mtasts", "MTA-STS", mtaSts ? "ok" : "info", mtaSts ? T("Attivo: la posta in arrivo viaggia sempre cifrata.", "On: incoming mail is always encrypted in transit.") : T("Non attivo.", "Off."),
      T("Impedisce di intercettare le email in arrivo declassando la cifratura.", "Prevents interception of inbound mail by downgrading encryption.")));
    if (bimi) out.push(c("bimi", "BIMI", "ok", T("Il logo compare accanto alle vostre email.", "Your logo shows next to your emails."), T("Riconoscibilità nella casella di posta.", "Recognition in the inbox.")));
  }
  return { id: "dominio", nome: T("Dominio ed email", "Domain & email"), voto: voto(out), controlli: out };
}
