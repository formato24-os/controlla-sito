import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const { indirizzoRiservato, apri, permettiIndirizziPrivati } = await import("../dist/net.js");
const { leggiPagina, testoVisibile } = await import("../dist/page.js");
const { pivaValida, trovaPiva, voto } = await import("../dist/checks/util.js");
const { robotsBlocca } = await import("../dist/checks/seo.js");
const { validaParere, estraiJson } = await import("../dist/ai/review.js");
const { impostaLingua, controllaSito } = await import("../dist/index.js");

test("private, loopback and cloud-metadata addresses are refused", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(indirizzoRiservato(ip), true, ip);
  for (const ip of ["76.76.21.142", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(indirizzoRiservato(ip), false, ip);
  for (const u of ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1/", "http://[::1]/"]) await assert.rejects(apri(u), (e) => e.codice === "BLOCCATO", u);
});

test("the Italian VAT check digit is verified", () => {
  const validi = [..."0123456789"].filter((d) => pivaValida(`0123456789${d}`));
  assert.equal(validi.length, 1);
  assert.equal(pivaValida("00000000000"), false);
  assert.deepEqual(trovaPiva("© 2026 Rossi srl — P.IVA IT 01234567897 — tel 0811234567"), ["01234567897"]);
  assert.deepEqual(trovaPiva("Telefono 08112345678"), []);
});

test("robots.txt: only a full Disallow for the crawler's own group blocks it", () => {
  assert.equal(robotsBlocca("User-agent: *\nDisallow: /"), true);
  assert.equal(robotsBlocca("User-agent: *\nDisallow: /admin"), false);
  assert.equal(robotsBlocca("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /", "GPTBot"), true);
  assert.equal(robotsBlocca("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /", "PerplexityBot"), false);
  assert.equal(robotsBlocca("User-agent: Googlebot\nUser-agent: *\nDisallow: /", "googlebot"), true);
});

test("page reading: labels, unnamed buttons, broken JSON-LD, split letters", () => {
  const p = leggiPagina(`<html lang="it"><head><script type="application/ld+json">{"@type":"Dentist",</script>
    <script type="application/ld+json">{"@type":"Organization","sameAs":["x"]}</script></head>
    <label for="n">Nome</label><input id="n"><input type="email" placeholder="Email"><label>Tel <input type="tel"></label>
    <button><svg></svg></button><button aria-label="Menu"></button><a href="/x"><img src="a.png"></a>`, "https://e.it/");
  assert.equal(p.campi.length, 3);
  assert.equal(p.campi.filter((c) => !c.etichettato).length, 1);
  assert.equal(p.bottoniSenzaNome, 1);
  assert.equal(p.jsonLd.errori, 1);
  assert.deepEqual(p.jsonLd.tipi, ["Organization"]);
  assert.equal(testoVisibile("<h1><span>C</span><span>i</span>ao</h1>"), "Ciao");
});

test("the mark counts a warning as half and ignores information", () => {
  assert.equal(voto([{ esito: "ok" }, { esito: "attenzione" }, { esito: "info" }]), 75);
  assert.equal(voto([{ esito: "info" }]), null);
});

test("the AI answer is parsed from noisy text and clamped to the closed shape", () => {
  const p = validaParere(estraiJson('Ecco:\n```json\n{"voto": 140, "primaImpressione": "Chiaro.", "cosaFai": {"chiaro": true, "commento": "Sì"}, "problemi": [{"titolo": "A"}], "piano": [{"azione": "Fai X", "impatto": "enorme"}], "extra": "<script>"}\n```'), "m");
  assert.equal(p.voto, 100);
  assert.equal(p.problemi.length, 0);
  assert.deepEqual(p.piano, [{ azione: "Fai X", impatto: "medio" }]);
  assert.equal("extra" in p, false);
  assert.throws(() => validaParere({ voto: "x" }, "m"));
});

test("end to end against a local site and a fake OpenAI-compatible provider", async (t) => {
  permettiIndirizziPrivati(true);
  t.after(() => permettiIndirizziPrivati(false));
  impostaLingua("en");
  const sito = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": "_ga=1; Path=/" });
      return res.end(`<html><head><title>Forno Rossi, pane a Napoli dal 1950</title><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></head>
        <body><h1>Pane</h1><a href="/rotto">Rotto</a><a href="tel:+39081">Chiama</a><footer>P.IVA 01234567890</footer></body></html>`);
    }
    if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /");
    res.writeHead(404).end();
  });
  const ai = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (d) => (corpo += d)).on("end", () => {
      const j = JSON.parse(corpo);
      assert.match(j.messages[1].content, /<<<PAGE[\s\S]*Forno Rossi[\s\S]*<<<CHECKS/);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ voto: 60, primaImpressione: "A bakery.", cosaFai: { chiaro: true, commento: "ok" }, perChi: "locals", piano: [{ azione: "Add a consent banner", impatto: "alto" }] }) } }] }));
    });
  });
  await Promise.all([new Promise((r) => sito.listen(0, "127.0.0.1", r)), new Promise((r) => ai.listen(0, "127.0.0.1", r))]);
  t.after(() => (sito.close(), ai.close()));
  const { PROVIDER } = await import("../dist/ai/providers.js");
  const finto = { ...PROVIDER.find((p) => p.id === "openai"), base: `http://127.0.0.1:${ai.address().port}/v1`, modello: "fake" };
  const r = await controllaSito(`http://127.0.0.1:${sito.address().port}/`, { ai: { provider: finto, chiave: "x" } });
  const trova = (id) => r.aree.flatMap((a) => a.controlli).find((c) => c.id === id);
  assert.equal(trova("banner").esito, "problema");
  assert.equal(trova("cookie").esito, "problema");
  assert.equal(trova("piva").esito, "problema", "01234567890 has a wrong check digit");
  assert.equal(trova("linkrotti").esito, "problema");
  assert.equal(trova("crawlerai").esito, "problema");
  assert.equal(trova("https").esito, "problema");
  assert.equal(r.ai?.voto, 60);
  assert.equal(r.ai?.modello, "fake");
  assert.equal(r.voto, Math.round(r.votoTecnico * 0.7 + 60 * 0.3));
});
