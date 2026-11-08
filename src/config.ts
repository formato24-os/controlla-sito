import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { provider, PROVIDER, type Collegamento, type IdProvider } from "./ai/providers.js";

/*
 * Where the user's AI key lives between runs. Environment variables always win (that is how CI
 * passes secrets); the file is a convenience for people at a terminal, readable only by its owner.
 */

export type Configurazione = { provider?: IdProvider; modello?: string; chiavi?: Partial<Record<IdProvider, string>> };

export const CARTELLA = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "controlla-sito");
export const FILE = join(CARTELLA, "config.json");

export function leggi(): Configurazione {
  try {
    return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Configurazione) : {};
  } catch {
    return {};
  }
}

export function salva(c: Configurazione) {
  mkdirSync(CARTELLA, { recursive: true, mode: 0o700 });
  writeFileSync(FILE, `${JSON.stringify(c, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {
    /* Windows: the file is in the user's profile, which other users cannot read */
  }
}

const daEnv = (id: IdProvider) => provider(id)!.env.map((e) => process.env[e]).find(Boolean);

/** The provider to use: the one asked for, the saved one, or the first with a key in the environment. */
export function collegamento(scelta?: string, modello?: string): Collegamento | null {
  const conf = leggi();
  const id = (scelta ?? process.env.CONTROLLA_SITO_AI ?? conf.provider) as IdProvider | undefined;
  const candidati = id ? [provider(id)].filter(Boolean) : PROVIDER.filter((p) => !p.senzaChiave);
  for (const p of candidati) {
    const chiave = daEnv(p!.id) ?? conf.chiavi?.[p!.id];
    if (chiave || (p!.senzaChiave && id === p!.id)) return { provider: p!, chiave: p!.senzaChiave ? "" : chiave!, modello: modello ?? process.env.CONTROLLA_SITO_MODEL ?? conf.modello };
  }
  return null;
}
