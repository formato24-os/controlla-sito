/*
 * The AI review runs on the user's own account with any of these providers. Most speak the
 * OpenAI chat format; Anthropic has its own. Model names change every few months, so where a
 * provider has no stable alias the model is picked from the provider's own /models list.
 */

export type IdProvider = "openai" | "anthropic" | "gemini" | "openrouter" | "nvidia" | "mistral" | "groq" | "deepseek" | "ollama";

export type Provider = {
  id: IdProvider;
  nome: string;
  env: string[];
  base: string;
  formato: "openai" | "anthropic";
  modello?: string;
  preferiti?: RegExp[];
  escludi?: RegExp;
  dove: string;
  senzaChiave?: boolean;
  extra?: Record<string, unknown>;
};

export const PROVIDER: Provider[] = [
  { id: "openai", nome: "OpenAI (ChatGPT)", env: ["OPENAI_API_KEY"], base: "https://api.openai.com/v1", formato: "openai", preferiti: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+$/], escludi: /audio|realtime|image|search|transcribe|tts|codex|nano|instruct|chat-latest/i, dove: "https://platform.openai.com/api-keys" },
  { id: "anthropic", nome: "Anthropic (Claude)", env: ["ANTHROPIC_API_KEY"], base: "https://api.anthropic.com/v1", formato: "anthropic", preferiti: [/^claude-sonnet/, /^claude-/], dove: "https://console.anthropic.com/settings/keys" },
  { id: "gemini", nome: "Google Gemini", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], base: "https://generativelanguage.googleapis.com/v1beta/openai", formato: "openai", modello: "gemini-flash-latest", dove: "https://aistudio.google.com/apikey" },
  { id: "openrouter", nome: "OpenRouter", env: ["OPENROUTER_API_KEY"], base: "https://openrouter.ai/api/v1", formato: "openai", modello: "openrouter/auto", dove: "https://openrouter.ai/keys" },
  { id: "nvidia", nome: "NVIDIA NIM", env: ["NVIDIA_API_KEY"], base: "https://integrate.api.nvidia.com/v1", formato: "openai", modello: "mistralai/mistral-large-4-1t-a52b", extra: { reasoning_effort: "low" }, dove: "https://build.nvidia.com" },
  { id: "mistral", nome: "Mistral", env: ["MISTRAL_API_KEY"], base: "https://api.mistral.ai/v1", formato: "openai", modello: "mistral-large-latest", dove: "https://console.mistral.ai/api-keys" },
  { id: "groq", nome: "Groq", env: ["GROQ_API_KEY"], base: "https://api.groq.com/openai/v1", formato: "openai", preferiti: [/gpt-oss-120b/, /llama-3\.3-70b/, /llama/], escludi: /whisper|guard|tts|playai/i, dove: "https://console.groq.com/keys" },
  { id: "deepseek", nome: "DeepSeek", env: ["DEEPSEEK_API_KEY"], base: "https://api.deepseek.com", formato: "openai", modello: "deepseek-chat", dove: "https://platform.deepseek.com/api_keys" },
  { id: "ollama", nome: "Ollama (local)", env: ["OLLAMA_HOST"], base: "http://localhost:11434/v1", formato: "openai", preferiti: [/./], senzaChiave: true, dove: "https://ollama.com" },
];

export const provider = (id: string) => PROVIDER.find((p) => p.id === id);

export type Collegamento = { provider: Provider; chiave: string; modello?: string };

type Messaggio = { role: "system" | "user"; content: string };

async function json(r: Response) {
  const t = await r.text();
  if (!r.ok) {
    let msg = t.slice(0, 200);
    try {
      const j = JSON.parse(t) as { error?: { message?: string } | string; message?: string };
      msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? msg;
    } catch {
      /* not JSON */
    }
    throw new Error(`HTTP ${r.status}: ${msg}`);
  }
  return JSON.parse(t) as unknown;
}

const intestazioni = (c: Collegamento): Record<string, string> =>
  c.provider.formato === "anthropic"
    ? { "x-api-key": c.chiave, "anthropic-version": "2023-06-01", "content-type": "application/json" }
    : { ...(c.chiave ? { authorization: `Bearer ${c.chiave}` } : {}), "content-type": "application/json", ...(c.provider.id === "openrouter" ? { "http-referer": "https://github.com/formato24-os/controlla-sito", "x-title": "controlla-sito" } : {}) };

const baseDi = (c: Collegamento) => (c.provider.id === "ollama" && process.env.OLLAMA_HOST ? `${process.env.OLLAMA_HOST.replace(/\/$/, "")}/v1` : c.provider.base);

/** The model to use: the user's, the provider's stable alias, or the best match in its own list. */
export async function scegliModello(c: Collegamento, segnale?: AbortSignal): Promise<string> {
  if (c.modello) return c.modello;
  if (c.provider.modello) return c.provider.modello;
  const j = (await json(await fetch(`${baseDi(c)}/models`, { headers: intestazioni(c), signal: segnale }))) as { data?: { id: string; created?: number; created_at?: string }[] };
  const lista = (j.data ?? [])
    .map((m) => ({ id: m.id.replace(/^models\//, ""), quando: m.created ?? (m.created_at ? Date.parse(m.created_at) / 1000 : 0) }))
    .filter((m) => !c.provider.escludi?.test(m.id))
    .sort((a, b) => b.quando - a.quando || b.id.localeCompare(a.id, "en", { numeric: true }));
  for (const re of c.provider.preferiti ?? []) {
    const m = lista.find((x) => re.test(x.id));
    if (m) return m.id;
  }
  throw new Error(`no model found for ${c.provider.nome}: pass --model`);
}

/** One request, one answer as plain text. */
export async function chiedi(c: Collegamento, messaggi: Messaggio[], segnale?: AbortSignal): Promise<{ testo: string; modello: string }> {
  const modello = await scegliModello(c, segnale);
  if (c.provider.formato === "anthropic") {
    const j = (await json(await fetch(`${baseDi(c)}/messages`, {
      method: "POST",
      signal: segnale,
      headers: intestazioni(c),
      body: JSON.stringify({ model: modello, max_tokens: 4000, system: messaggi.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"), messages: messaggi.filter((m) => m.role !== "system") }),
    }))) as { content?: { type: string; text?: string }[] };
    return { testo: (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""), modello };
  }
  const limite = c.provider.id === "openai" ? { max_completion_tokens: 8000 } : { max_tokens: 4000 };
  const j = (await json(await fetch(`${baseDi(c)}/chat/completions`, {
    method: "POST",
    signal: segnale,
    headers: intestazioni(c),
    body: JSON.stringify({ model: modello, messages: messaggi, ...limite, ...c.provider.extra }),
  }))) as { choices?: { message?: { content?: string | null } }[] };
  return { testo: j.choices?.[0]?.message?.content ?? "", modello };
}
