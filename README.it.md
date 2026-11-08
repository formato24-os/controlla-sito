# controlla-sito · site-checkup

**Il check-up completo di un sito dal terminale, con il parere di un'AI sulla tua chiave.**
Sicurezza, privacy e GDPR, Google, visibilità sulle AI, velocità, accessibilità, contatti, dominio ed email: più di 60 controlli in pochi secondi, spiegati in parole semplici e con la soluzione accanto a ogni problema.

[🇬🇧 Read in English](README.md) · Fatto da [Formato24](https://www.formato24.com)

```bash
npx controlla-sito www.esempio.it         # italiano
npx site-checkup www.example.com          # English
```

Sono lo stesso strumento. Fa parte anche della CLI di Formato24: `f24 check www.esempio.it`.

## Cosa controlla che un test di velocità non vede

| Area | In evidenza |
|---|---|
| **Sicurezza** | validità e giorni alla scadenza del certificato, versione TLS, HSTS, qualità della CSP, clickjacking, cookie protetti, contenuti misti, PHP / jQuery / WordPress vecchi, `security.txt`, e se lo chiedi `.git` / `.env` esposti (`--sensitive`) |
| **Privacy e regole** | traccianti senza sistema di consenso (GA, GTM, Meta, TikTok, LinkedIn, Clarity, Hotjar…), cookie di tracciamento alla prima visita, Google Fonts, video e mappe incorporati, reCAPTCHA, informativa e cookie policy, **Partita IVA con verifica della cifra di controllo**, dichiarazione di accessibilità (European Accessibility Act) |
| **Google e social** | titolo, descrizione, H1 e ordine dei titoli, canonical, con e senza www, hreflang, sitemap (provando un campione dei suoi indirizzi), **link interni rotti**, soft-404, JSON-LD valido e scheda attività completa, immagine dell'anteprima che si apre davvero |
| **Visibilità sulle AI** | quali crawler delle AI blocca `robots.txt` (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…), `llms.txt`, identità leggibile dalle macchine e `sameAs`, domande e risposte |
| **Velocità** | TTFB, compressione, peso dei file principali, cache, script bloccanti, servizi esterni, formati e misure delle immagini (CLS), caricamento differito, HTTP/3 |
| **Accessibilità** | lingua, testo alternativo, etichette dei moduli, pulsanti e icone senza nome, link generici, zoom bloccato, tabindex positivi, id doppi, salta al contenuto |
| **Contatti** | chiamata con un tocco, WhatsApp, email / modulo / chat, mappa, recensioni, social |
| **Dominio ed email** | scadenza, registrar e DNSSEC (RDAP), CAA, IPv6, MX, SPF (col limite delle 10 ricerche), DKIM, politica DMARC, MTA-STS, BIMI |

Poi **un modello di AI legge la pagina come un cliente che arriva per la prima volta**: si capisce cosa fai, per chi, e cosa fare adesso? Cita le tue frasi vere, riscrive il titolo principale e mette tutto in un piano d'azione breve e ordinato.

## L'AI: usi la tua chiave

L'analisi AI gira sul **tuo** account, con uno qualsiasi di questi provider. La prima volta `controlla-sito ai` chiede la chiave, la prova e la salva in `~/.config/controlla-sito/config.json` (leggibile solo da te). Le variabili d'ambiente hanno sempre la precedenza: è così che si passano nella CI.

| Provider | Variabile | Modello predefinito |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | il `gpt-*-mini` più recente del tuo account |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | il Claude Sonnet più recente del tuo account |
| Google Gemini | `GEMINI_API_KEY` | `gemini-flash-latest` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/auto` |
| NVIDIA NIM | `NVIDIA_API_KEY` | `mistralai/mistral-large-4-1t-a52b` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` |
| Groq | `GROQ_API_KEY` | il miglior modello aperto disponibile |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Ollama (sul tuo computer) | `OLLAMA_HOST` (facoltativa) | il primo modello locale, `--provider ollama` |

Scegli con `--provider`, cambi modello con `--model`. Senza chiave il check-up tecnico gira lo stesso, completo.

**Cosa arriva all'AI:** titolo, descrizione, titoli e testi dei link della pagina, i primi ~6.000 caratteri di testo visibile e l'elenco dei controlli non superati. Nient'altro. Il testo della pagina è trattato come dato non fidato (potrebbe contenere istruzioni rivolte al modello) e la risposta deve rispettare uno schema chiuso prima di essere mostrata.

## Opzioni

```
-l, --lang it|en        lingua del rapporto (predefinita: quella del sistema)
-p, --provider <nome>   openai, anthropic, gemini, openrouter, nvidia, mistral, groq, deepseek, ollama
-m, --model <modello>   modello da usare
-f, --full              spiega anche i controlli superati
    --json              rapporto JSON su stdout
    --md <file>         salva un rapporto Markdown
    --min <voto>        esce con codice 1 sotto questo voto
    --sensitive         cerca .git/.env esposti: solo su siti tuoi o che puoi testare
    --no-ai             salta l'analisi AI
```

## Nella CI

```yaml
# .github/workflows/controlla-sito.yml
on: { schedule: [{ cron: "0 6 * * 1" }], workflow_dispatch: {} }
jobs:
  checkup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx --yes controlla-sito@1 https://www.esempio.it --min 80 --md rapporto.md
        env: { OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}" }
      - run: cat rapporto.md >> "$GITHUB_STEP_SUMMARY"
        if: always()
```

## Come libreria

```ts
import { controllaSito, impostaLingua } from "controlla-sito";

impostaLingua("it");
const referto = await controllaSito("www.esempio.it", { ai: null });
console.log(referto.voto, referto.aree.map((a) => [a.nome, a.voto]));
```

## Come si comporta

- **Passivo.** Legge ciò che riceve il browser di un visitatore qualsiasi: la pagina, `robots.txt`, la sitemap, qualche link e qualche file, DNS e RDAP. Non invia moduli e non prova password. `--sensitive` aggiunge cinque richieste per file riservati noti, ed è pensato per i tuoi siti.
- **Sicuro anche su un server.** Ogni richiesta viene risolta e rifiutata se punta a un indirizzo privato, locale o ai metadati del cloud — anche dopo un reindirizzamento o un cambio di DNS — quindi non si può usare per raggiungere una rete interna.
- **Niente tracciamento.** Parla solo col sito che controlli, con DNS e RDAP pubblici e col provider AI che hai scelto.
- Node.js 20.12 o più recente.

## Licenza

[Apache 2.0](LICENSE). Usalo, modificalo, vendici servizi sopra. Se lo ridistribuisci o ci costruisci qualcosa, tieni il file [NOTICE](NOTICE) con il riconoscimento a Formato24.

---

Fatto e mantenuto da **[Formato24](https://www.formato24.com)**: siti, app e software su misura da Napoli. Vuoi una mano a sistemare quello che ha trovato? [Scrivici](https://www.formato24.com).
