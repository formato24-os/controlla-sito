/*
 * Two languages, one code base: every sentence is written next to its translation with `T`, so
 * a check and its words never drift apart. The language is chosen once, before anything runs.
 */
export type Lingua = "it" | "en";

let corrente: Lingua = "it";

export const lingua = () => corrente;
export function impostaLingua(l: Lingua) {
  corrente = l;
}

/** Italian when the system speaks Italian, English otherwise. */
export function linguaDiSistema(env: NodeJS.ProcessEnv = process.env): Lingua {
  const da = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || "";
  return /^it/i.test(da) ? "it" : "en";
}

export const T = (it: string, en: string) => (corrente === "it" ? it : en);

export const data = (d: Date) => d.toLocaleDateString(corrente === "it" ? "it-IT" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
