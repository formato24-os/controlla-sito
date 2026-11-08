import { T } from "../lang.js";
import type { Area, Controllo, Dati } from "../types.js";
import { c, voto } from "./util.js";

const GENERICI = /^(clicca qui|qui|leggi di più|leggi tutto|scopri di più|click here|here|read more|more|learn more|link)$/i;

export function accessibilita(d: Dati): Area {
  const p = d.pagina;
  const out: Controllo[] = [];
  out.push(c("lingua", T("Lingua dichiarata", "Page language"), p.lingua ? "ok" : "problema",
    p.lingua ? T(`Lingua: ${p.lingua}.`, `Language: ${p.lingua}.`) : T("La pagina non dice in che lingua è scritta.", "The page does not declare its language."),
    T("Senza, un lettore di schermo legge l'italiano con la pronuncia sbagliata.", "Without it screen readers pronounce the text with the wrong voice.")));

  const im = p.immagini.filter((i) => i.src);
  if (im.length) {
    const senza = im.filter((i) => i.alt === null).length;
    out.push(c("alt", T("Descrizione delle immagini", "Image alt text"), senza === 0 ? "ok" : senza / im.length > 0.3 ? "problema" : "attenzione",
      senza ? T(`${senza} immagini su ${im.length} senza alt.`, `${senza} of ${im.length} images have no alt.`) : T("Tutte le immagini hanno l'attributo alt.", "Every image has an alt attribute."),
      T("Serve a chi non vede e a Google Immagini.", "It serves blind users and Google Images."),
      T('Descrivi le immagini utili; per quelle decorative usa alt="".', 'Describe meaningful images; use alt="" for decorative ones.')));
  }

  if (p.campi.length) {
    const senza = p.campi.filter((f) => !f.etichettato).length;
    out.push(c("etichette", T("Campi dei moduli con etichetta", "Form labels"), senza ? "problema" : "ok",
      senza ? T(`${senza} campi su ${p.campi.length} senza etichetta (il placeholder non basta).`, `${senza} of ${p.campi.length} fields have no label (a placeholder is not enough).`) : T("Ogni campo ha la sua etichetta.", "Every field has a label."),
      T("Chi usa un lettore di schermo sente «campo di testo» senza sapere cosa scrivere.", "Screen-reader users hear “edit text” without knowing what to type.")));
  }

  const senzaNome = p.link.filter((l) => !l.testo && !l.etichetta && !l.href.startsWith("#")).length + p.bottoniSenzaNome;
  out.push(c("nomi", T("Pulsanti e link con un nome", "Named buttons and links"), senzaNome > 2 ? "problema" : senzaNome ? "attenzione" : "ok",
    senzaNome ? T(`${senzaNome} link o pulsanti senza testo né aria-label (spesso sono icone).`, `${senzaNome} links or buttons without text or aria-label (often icons).`) : T("Tutti hanno un nome.", "All have an accessible name."),
    T("Un'icona senza nome viene letta come «pulsante» e basta.", "An unnamed icon is announced as just “button”."),
    T("Aggiungi aria-label alle icone cliccabili (es. «Apri il menu»).", "Add aria-label to clickable icons (e.g. “Open menu”).")));

  const generici = p.link.filter((l) => GENERICI.test(l.testo.trim())).length;
  if (generici) out.push(c("generici", T("Link generici", "Generic link text"), generici > 3 ? "attenzione" : "info",
    T(`${generici} link dicono solo «clicca qui» o «leggi di più».`, `${generici} links only say “click here” or “read more”.`),
    T("Fuori contesto non dicono dove portano, né alle persone né a Google.", "Out of context they say nothing about where they lead, to people or to Google.")));

  const zoomBloccato = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(p.viewport ?? "");
  out.push(c("zoom", T("Zoom consentito", "Zoom allowed"), zoomBloccato ? "problema" : "ok",
    zoomBloccato ? T("La pagina impedisce di ingrandire col pinch.", "The page prevents pinch-zoom.") : T("Si può ingrandire liberamente.", "Users can zoom freely."),
    T("Chi vede poco ha bisogno di ingrandire il testo.", "Low-vision users need to enlarge text."),
    T("Togli user-scalable=no e maximum-scale dal meta viewport.", "Remove user-scalable=no and maximum-scale from the viewport meta.")));

  if (p.tabindexPositivi) out.push(c("tabindex", T("Ordine di tabulazione forzato", "Forced tab order"), "attenzione",
    T(`${p.tabindexPositivi} elementi con tabindex positivo.`, `${p.tabindexPositivi} elements with a positive tabindex.`),
    T("Sconvolge l'ordine in cui si naviga da tastiera.", "It scrambles keyboard navigation order.")));
  if (p.idDuplicati.length) out.push(c("id", T("Identificativi doppi", "Duplicate IDs"), "attenzione",
    T(`id ripetuti: ${p.idDuplicati.slice(0, 4).join(", ")}.`, `Repeated ids: ${p.idDuplicati.slice(0, 4).join(", ")}.`),
    T("Etichette e aria-* che puntano a un id doppio possono finire sull'elemento sbagliato.", "Labels and aria-* pointing to a duplicate id may reach the wrong element.")));
  out.push(c("salta", T("Salta al contenuto", "Skip link"), p.saltaAlContenuto ? "ok" : "info",
    p.saltaAlContenuto ? T("C'è un collegamento per saltare il menu.", "There is a skip-to-content link.") : T("Nessun collegamento per saltare il menu.", "No skip-to-content link."),
    T("Chi naviga con la tastiera non deve ripassare il menu a ogni pagina.", "Keyboard users should not tab through the menu on every page.")));
  return { id: "accessibilita", nome: T("Accessibilità", "Accessibility"), voto: voto(out), controlli: out };
}
