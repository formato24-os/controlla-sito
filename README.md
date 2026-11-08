# site-checkup · controlla-sito

**A full website check-up from your terminal, with an AI review on your own key.**
Security, privacy & GDPR, Google, visibility in AI assistants, performance, accessibility, contact options, domain and email — 60+ checks in a few seconds, explained in plain words with the fix next to each problem.

[🇮🇹 Leggi in italiano](README.it.md) · Made by [Formato24](https://www.formato24.com)

```bash
npx site-checkup www.example.com          # English
npx controlla-sito www.esempio.it         # Italiano
```

Both commands are the same tool. It is also part of the Formato24 CLI: `f24 check www.example.com`.

## What it checks that a speed test does not

| Area | Highlights |
|---|---|
| **Security** | certificate validity and days to expiry, TLS version, HSTS, CSP quality, clickjacking, cookie flags, mixed content, outdated PHP / jQuery / WordPress, `security.txt`, optional exposed `.git` / `.env` (`--sensitive`) |
| **Privacy & compliance** | trackers loaded without a consent platform (GA, GTM, Meta, TikTok, LinkedIn, Clarity, Hotjar…), tracking cookies set on the first visit, Google Fonts, YouTube/Maps embeds, reCAPTCHA, privacy and cookie policy, **Italian VAT number with check-digit validation**, European Accessibility Act statement |
| **Google & social** | title, description, H1 and heading order, canonical, www vs non-www, hreflang, sitemap (with a sample of its URLs tested), **broken internal links**, soft-404, JSON-LD validity and LocalBusiness completeness, Open Graph image actually loading |
| **AI visibility** | which AI crawlers `robots.txt` blocks (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…), `llms.txt`, machine-readable identity and `sameAs`, Q&A content |
| **Performance** | TTFB, compression, weight of the main files, asset caching, render-blocking scripts, third parties, image formats and dimensions (CLS), lazy loading, HTTP/3 |
| **Accessibility** | page language, alt text, form labels, unnamed buttons and icon links, generic link text, zoom blocked, positive tabindex, duplicate IDs, skip link |
| **Contact** | tap-to-call, WhatsApp, email / form / live chat, map, reviews, socials |
| **Domain & email** | domain expiry, registrar and DNSSEC (RDAP), CAA, IPv6, MX, SPF (with the 10-lookup limit), DKIM, DMARC policy, MTA-STS, BIMI |

Then an **AI model reads the page like a first-time customer**: is it clear what you do, for whom, and what to do next? It quotes your real sentences, rewrites your main headline and turns everything into a short, ordered action plan.

## The AI part: bring your own key

The AI review runs on **your** account with any of these providers. The first time, `site-checkup ai` asks for the key, tests it and stores it in `~/.config/controlla-sito/config.json` (readable only by you). Environment variables always win, which is how CI passes them.

| Provider | Variable | Model used by default |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | newest `gpt-*-mini` in your account |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | newest Claude Sonnet in your account |
| Google Gemini | `GEMINI_API_KEY` | `gemini-flash-latest` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/auto` |
| NVIDIA NIM | `NVIDIA_API_KEY` | `mistralai/mistral-large-4-1t-a52b` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` |
| Groq | `GROQ_API_KEY` | best available open model |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Ollama (local) | `OLLAMA_HOST` (optional) | first local model, `--provider ollama` |

Pick one with `--provider`, override the model with `--model`. With no key the technical check-up still runs in full.

**What is sent to the AI:** the page's title, description, headings, link texts, the first ~6,000 characters of visible text and the list of failed checks. Nothing else. The page text is treated as untrusted data (it may contain instructions aimed at the model) and the answer must match a closed schema before it is shown.

## Options

```
-l, --lang it|en        report language (default: your system's)
-p, --provider <name>   openai, anthropic, gemini, openrouter, nvidia, mistral, groq, deepseek, ollama
-m, --model <model>     model to use
-f, --full              also explain passed checks
    --json              JSON report on stdout
    --md <file>         save a Markdown report
    --min <score>       exit with code 1 below this score
    --sensitive         look for exposed .git/.env — only on sites you own or may test
    --no-ai             skip the AI review
```

## In CI

```yaml
# .github/workflows/site-checkup.yml
on: { schedule: [{ cron: "0 6 * * 1" }], workflow_dispatch: {} }
jobs:
  checkup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx --yes site-checkup@1 https://www.example.com --min 80 --md report.md
        env: { OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}" }
      - run: cat report.md >> "$GITHUB_STEP_SUMMARY"
        if: always()
```

## As a library

```ts
import { controllaSito, impostaLingua } from "controlla-sito";

impostaLingua("en");
const report = await controllaSito("www.example.com", { ai: null });
console.log(report.voto, report.aree.map((a) => [a.nome, a.voto]));
```

## How it behaves

- **Passive by default.** It reads what any visitor's browser receives: the page, `robots.txt`, the sitemap, a handful of links and files, DNS and RDAP. It never submits forms or tries passwords. `--sensitive` adds five requests for well-known secret files and is meant for your own sites.
- **Safe to run on a server.** Every request is resolved and refused when it points to a private, loopback or cloud-metadata address — also after redirects and DNS changes — so it cannot be used to reach an internal network.
- **No tracking, no telemetry.** It talks only to the site you check, to public DNS/RDAP, and to the AI provider you chose.
- Node.js 20.12 or newer.

## License

[Apache 2.0](LICENSE). Use it, change it, sell services with it. If you redistribute it or build on it, keep the [NOTICE](NOTICE) file with the attribution to Formato24.

---

Built and maintained by **[Formato24](https://www.formato24.com)** — websites, apps and custom software from Naples, Italy. Need a hand fixing what it found? [Write to us](https://www.formato24.com).
