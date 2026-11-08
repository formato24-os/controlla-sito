import { T } from "../lang.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, voto } from "./util.js";

export function contatti(d: Dati): Area {
  const hrefs = d.pagina.link.map((l) => l.href.toLowerCase());
  const out: Controllo[] = [];
  const tel = hrefs.some((x) => x.startsWith("tel:"));
  const wa = hrefs.some((x) => /wa\.me|whatsapp\.com|api\.whatsapp/.test(x));
  const mail = hrefs.some((x) => x.startsWith("mailto:"));
  const modulo = /<form\b/i.test(d.risposta.corpo);
  const chat = /tawk\.to|crisp\.chat|intercom|tidio|livechatinc|zopim|zendesk|hubspot.*conversations|freshchat|smartsupp/i.test(d.risposta.corpo);
  const mappa = hrefs.some((x) => /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com/.test(x)) || d.pagina.iframe.some((u) => /maps/i.test(u));
  const social = ["facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "youtube.com", "x.com", "twitter.com"].filter((s) => hrefs.some((x) => x.includes(s)));
  const recensioni = hrefs.some((x) => /g\.page|search\.google\.com\/local|trustpilot|tripadvisor|google\.[a-z.]+\/maps\/place/.test(x));
  out.push(c("telefono", T("Chiamata con un tocco", "Tap to call"), tel ? "ok" : "attenzione",
    tel ? T("Il numero si chiama toccandolo.", "The number is tappable.") : T("Nessun numero chiamabile con un tocco.", "No tappable phone number."),
    T("Da telefono, copiare un numero a mano fa perdere clienti.", "On a phone, copying a number by hand loses customers."), '<a href="tel:+39…">'));
  out.push(c("whatsapp", "WhatsApp", wa ? "ok" : "attenzione", wa ? T("C'è un collegamento a WhatsApp.", "There is a WhatsApp link.") : T("Nessun collegamento a WhatsApp.", "No WhatsApp link."),
    T("In Italia è il modo in cui la maggior parte delle persone preferisce scrivere a un'attività.", "In Italy (and much of Europe) it is how most people prefer to message a business."), "https://wa.me/39…"));
  out.push(c("scrivere", T("Email, modulo o chat", "Email, form or chat"), mail || modulo || chat ? "ok" : "attenzione",
    [mail && T("email cliccabile", "clickable email"), modulo && T("modulo", "form"), chat && T("chat dal vivo", "live chat")].filter(Boolean).join(", ") || T("Nessun modo di scrivere.", "No way to write."),
    T("Chi non vuole telefonare deve poter scrivere.", "People who would rather not call must be able to write.")));
  out.push(c("mappa", T("Dove trovarvi", "Location"), mappa ? "ok" : "info", mappa ? T("C'è la mappa o il collegamento a Maps.", "There is a map or a Maps link.") : T("Nessuna mappa: serve se ricevete clienti di persona.", "No map: needed if customers visit in person."),
    T("Un tocco per avere le indicazioni stradali.", "One tap for directions.")));
  out.push(c("recensioni", T("Recensioni raggiungibili", "Reviews linked"), recensioni ? "ok" : "info",
    recensioni ? T("C'è un collegamento alle recensioni.", "There is a link to reviews.") : T("Nessun collegamento alle recensioni.", "No link to reviews."),
    T("Un link diretto alla scheda Google aiuta i clienti contenti a lasciarne una.", "A direct link to your Google profile helps happy customers leave one.")));
  out.push(c("social", T("Social collegati", "Social profiles"), social.length ? "ok" : "info",
    social.length ? social.map((s) => s.replace(/\.com$/, "")).join(", ") : T("Nessun profilo social collegato.", "No social profile linked."),
    T("Chi non vi conosce guarda i social prima di contattarvi.", "People who do not know you check your socials before getting in touch.")));
  return { id: "contatti", nome: T("Contatti", "Contact"), voto: voto(out), controlli: out };
}
