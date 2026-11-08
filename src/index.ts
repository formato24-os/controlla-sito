import { parereAI, type ParereAI } from "./ai/review.js";
import type { Collegamento } from "./ai/providers.js";
import { accessibilita } from "./checks/accessibility.js";
import { visibilitaAI } from "./checks/ai-visibility.js";
import { contatti } from "./checks/contacts.js";
import { dominio } from "./checks/domain.js";
import { velocita } from "./checks/performance.js";
import { privacy } from "./checks/privacy.js";
import { sicurezza } from "./checks/security.js";
import { seo } from "./checks/seo.js";
import { voto } from "./checks/util.js";
import { raccogli, type Avanzamento } from "./collect.js";
import { T } from "./lang.js";
import { intestazione } from "./net.js";
import type { Area, Dati } from "./types.js";

export { ErroreCheckup, dominioRegistrato, normalizza } from "./collect.js";
export { impostaLingua, linguaDiSistema, type Lingua } from "./lang.js";
export { PROVIDER, type Collegamento, type IdProvider } from "./ai/providers.js";
export type { ParereAI } from "./ai/review.js";
export type { Area, Controllo, Esito } from "./types.js";

export type Referto = {
  url: string;
  host: string;
  voto: number | null;
  votoTecnico: number | null;
  tecnologie: string[];
  aree: Area[];
  ai: ParereAI | null;
  /** why the AI section is missing, in the reader's language */
  aiAssente: string | null;
  durataMs: number;
  data: string;
};

export function tecnologie(d: Dati): string[] {
  const x = `${d.risposta.corpo.slice(0, 300_000)} ${intestazione(d.risposta.headers, "x-powered-by") ?? ""} ${intestazione(d.risposta.headers, "server") ?? ""} ${d.pagina.generatore ?? ""}`;
  const regole: [RegExp, string][] = [
    [/wp-content|wp-includes/i, "WordPress"], [/woocommerce/i, "WooCommerce"], [/elementor/i, "Elementor"], [/et_pb_|\/themes\/Divi/i, "Divi"], [/static\.wixstatic\.com|wix\.com/i, "Wix"],
    [/cdn\.shopify\.com/i, "Shopify"], [/squarespace/i, "Squarespace"], [/joomla/i, "Joomla"], [/prestashop/i, "PrestaShop"], [/magento/i, "Magento"], [/drupal/i, "Drupal"],
    [/__next|_next\/static/i, "Next.js"], [/__nuxt|_nuxt\//i, "Nuxt"], [/astro-island|_astro\//i, "Astro"], [/gatsby/i, "Gatsby"], [/webflow/i, "Webflow"], [/framer\.com|framerusercontent/i, "Framer"],
    [/cloudflare/i, "Cloudflare"], [/vercel/i, "Vercel"], [/netlify/i, "Netlify"], [/jquery/i, "jQuery"], [/bootstrap/i, "Bootstrap"], [/tailwind/i, "Tailwind"],
    [/tawk\.to/i, "Tawk.to"], [/iubenda/i, "iubenda"], [/cookiebot/i, "Cookiebot"], [/nginx/i, "nginx"], [/apache/i, "Apache"], [/litespeed/i, "LiteSpeed"], [/PHP\//i, "PHP"],
  ];
  return regole.filter(([re]) => re.test(x)).map(([, n]) => n);
}

export type OpzioniCheckup = {
  ai?: Collegamento | null;
  sensibili?: boolean;
  avanzamento?: Avanzamento;
};

export async function controllaSito(indirizzo: string, opzioni: OpzioniCheckup = {}): Promise<Referto> {
  const inizio = Date.now();
  const d = await raccogli(indirizzo, { sensibili: opzioni.sensibili, avanzamento: opzioni.avanzamento });
  const aree = [sicurezza(d), privacy(d), seo(d), visibilitaAI(d), velocita(d), accessibilita(d), contatti(d), dominio(d)];
  const tecnico = voto(aree.flatMap((a) => a.controlli));

  let ai: ParereAI | null = null;
  let aiAssente: string | null = null;
  if (opzioni.ai) {
    opzioni.avanzamento?.(T(`L'AI legge la pagina (${opzioni.ai.provider.nome})`, `AI is reading the page (${opzioni.ai.provider.nome})`));
    try {
      ai = await parereAI(opzioni.ai, d, aree);
    } catch (e) {
      aiAssente = T(`Analisi AI non riuscita: ${(e as Error).message}`, `AI review failed: ${(e as Error).message}`);
    }
  } else aiAssente = T("Analisi AI non attiva: manca la chiave di un provider.", "AI review off: no provider key configured.");

  return {
    url: d.url,
    host: d.host,
    voto: ai && tecnico !== null ? Math.round(tecnico * 0.7 + ai.voto * 0.3) : tecnico,
    votoTecnico: tecnico,
    tecnologie: tecnologie(d),
    aree,
    ai,
    aiAssente,
    durataMs: Date.now() - inizio,
    data: new Date().toISOString(),
  };
}
