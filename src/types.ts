import type { InfoTls, Posta, Registrazione, Risposta } from "./net.js";
import type { Pagina } from "./page.js";

export type Esito = "ok" | "attenzione" | "problema" | "info";

export type Controllo = {
  id: string;
  titolo: string;
  esito: Esito;
  dettaglio: string;
  perche: string;
  /** how to fix it, when there is something to fix */
  rimedio?: string;
};

export type Area = { id: string; nome: string; voto: number | null; controlli: Controllo[] };

export type Sonda = { url: string; status: number; byte?: number; tipo?: string; cache?: string | null; compresso?: boolean };

/** Everything downloaded once, read by every check. The checks themselves never touch the network. */
export type Dati = {
  url: string;
  host: string;
  dominio: string;
  risposta: Risposta;
  pagina: Pagina;
  httpVaSuHttps: boolean | null;
  altroHost: { host: string; finisceQui: boolean | null } | null;
  tls: InfoTls | null;
  posta: Posta;
  spfLookup: number | null;
  dns: { ipv6: boolean; caa: string[]; ns: string[] };
  registrazione: Registrazione | null;
  robots: string | null;
  sitemap: { url: string; urls: number; indice: boolean; campione: Sonda[] } | null;
  llmsTxt: boolean;
  securityTxt: boolean;
  pagina404: number | null;
  risorse: Sonda[];
  linkInterni: Sonda[];
  ogImmagine: Sonda | null;
  sensibili: { percorso: string; esposto: boolean }[] | null;
  adesso: Date;
};
