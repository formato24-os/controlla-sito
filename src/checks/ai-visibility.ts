import { T } from "../lang.js";
import type { Area, Controllo, Dati } from "../types.js";
import { robotsBlocca } from "./seo.js";
import { c, voto } from "./util.js";

/*
 * Visibility in AI answers (ChatGPT, Claude, Perplexity, Gemini). These assistants read the web
 * through their own crawlers, each with a name a site can block — often without knowing it,
 * because a security plugin or CDN setting did it.
 */
const CRAWLER_AI: [string, string][] = [
  ["GPTBot", "ChatGPT (training)"],
  ["OAI-SearchBot", "ChatGPT Search"],
  ["ChatGPT-User", "ChatGPT"],
  ["ClaudeBot", "Claude"],
  ["Claude-SearchBot", "Claude Search"],
  ["PerplexityBot", "Perplexity"],
  ["Google-Extended", "Gemini"],
  ["Applebot-Extended", "Apple Intelligence"],
  ["CCBot", "Common Crawl"],
];

export function visibilitaAI(d: Dati): Area {
  const out: Controllo[] = [];
  const bloccati = d.robots ? CRAWLER_AI.filter(([bot]) => robotsBlocca(d.robots!, bot)) : [];
  const ricerca = bloccati.filter(([bot]) => /SearchBot|ChatGPT-User|PerplexityBot/.test(bot));
  out.push(c("crawlerai", T("Assistenti AI ammessi", "AI assistants allowed"), ricerca.length ? "problema" : bloccati.length ? "info" : "ok",
    bloccati.length ? T(`robots.txt blocca: ${bloccati.map(([b, n]) => `${b} (${n})`).join(", ")}.`, `robots.txt blocks: ${bloccati.map(([b, n]) => `${b} (${n})`).join(", ")}.`) : T("Nessun assistente AI è bloccato.", "No AI assistant is blocked."),
    T("Chi chiede a ChatGPT o Perplexity «un buon … a Napoli» riceve solo i siti che i loro motori possono leggere. Bloccare l'addestramento è una scelta legittima; bloccare la ricerca fa sparire dalle risposte.", "People asking ChatGPT or Perplexity for “a good … nearby” only get sites their crawlers can read. Blocking training is a legitimate choice; blocking search removes you from the answers."),
    T("Lascia passare almeno OAI-SearchBot, ChatGPT-User, Claude-SearchBot e PerplexityBot.", "Allow at least OAI-SearchBot, ChatGPT-User, Claude-SearchBot and PerplexityBot.")));

  out.push(c("llms", "llms.txt", d.llmsTxt ? "ok" : "info",
    d.llmsTxt ? T("Pubblicato: un riassunto del sito pensato per i modelli.", "Published: a site summary written for language models.") : T("Assente.", "Missing."),
    T("È una proposta di standard (llmstxt.org): un file Markdown che dice agli assistenti AI chi sei e quali pagine contano.", "A proposed standard (llmstxt.org): a Markdown file telling AI assistants who you are and which pages matter.")));

  const ld = d.pagina.jsonLd.tipi;
  const entita = ld.some((t) => /Organization|LocalBusiness|Person|Corporation|Store|Service/i.test(t));
  out.push(c("entita", T("Chi sei, in forma leggibile dalle AI", "Machine-readable identity"), entita ? "ok" : "attenzione",
    entita ? T("I dati strutturati dicono chi è l'attività.", "Structured data states who the business is.") : T("Nessun dato strutturato dice chi è l'attività.", "No structured data says who the business is."),
    T("Gli assistenti si fidano di più dei fatti scritti in modo esplicito (nome, città, servizi, profili) che di quelli da indovinare.", "Assistants trust explicit facts (name, city, services, profiles) more than guessed ones.")));
  const sameAs = d.pagina.jsonLd.oggetti.some((o) => Array.isArray((o as Record<string, unknown>).sameAs) || typeof (o as Record<string, unknown>).sameAs === "string");
  out.push(c("sameas", T("Profili collegati (sameAs)", "Linked profiles (sameAs)"), sameAs ? "ok" : "attenzione",
    sameAs ? T("I dati strutturati collegano i profili ufficiali.", "Structured data links the official profiles.") : T("Nessun collegamento ai profili ufficiali nei dati strutturati.", "Structured data links no official profiles."),
    T("Collegare scheda Google, LinkedIn e social aiuta motori e AI a capire che sono la stessa attività.", "Linking Google Business, LinkedIn and socials helps engines and AI see they are one business.")));

  const faq = ld.some((t) => /FAQPage|QAPage/i.test(t)) || d.pagina.titoli.filter((t) => t.testo.trim().endsWith("?")).length >= 3;
  out.push(c("domande", T("Risposte a domande vere", "Answers to real questions"), faq ? "ok" : "info",
    faq ? T("La pagina risponde a domande esplicite.", "The page answers explicit questions.") : T("Nessuna sezione di domande e risposte.", "No questions-and-answers section."),
    T("Le AI citano volentieri pagine che rispondono a una domanda in modo diretto.", "AI assistants like to quote pages that answer a question directly.")));
  return { id: "ai", nome: T("Visibilità sulle AI", "AI visibility"), voto: voto(out), controlli: out };
}
