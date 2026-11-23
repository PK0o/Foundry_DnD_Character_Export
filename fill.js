/**
 * Fills the official D&D 5E form-fillable character sheet with prepared sheet data.
 * Independent of Foundry so it can be tested outside the client: pass in the pdf-lib namespace.
 *
 * @typedef {object} SheetData
 * @property {Record<string, string|number>} fields   Single-line text fields (auto-shrunk to fit).
 * @property {string[]} checks                         Checkbox field names to tick.
 * @property {{fields: string[], text: string, title: string, max?: number, min?: number}[]} flows
 *           Multi-line text that flows through the given fields; anything that still doesn't fit goes into the appendix.
 * @property {{title: string, text?: string, entries?: {name: string, text: string}[]}[]} appendix
 *           Sections that always go into the appendix (plain text or named entries).
 * @property {{bytes: Uint8Array, type: "png"|"jpg"}|null} portrait
 * @property {string} title                            Shown in the appendix header (character name).
 * @property {{appendix: string, continued: string, page: string}} labels
 */

const REPLACEMENTS = {
  "−": "-", "‐": "-", "‑": "-", " ": " ", " ": " ", " ": " ", " ": " ",
  "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "→": "->", "←": "<-", "≤": "<=", "≥": ">=",
  "✓": "X", "✔": "X", "✕": "x", "●": "•", "▪": "•", "​": "", "﻿": ""
};

/** Replace characters the standard Helvetica (WinAnsi) font cannot encode. */
function makeSanitizer(font) {
  const cache = new Map();
  const ok = ch => {
    if ( cache.has(ch) ) return cache.get(ch);
    let res = true;
    try { font.encodeText(ch); } catch { res = false; }
    cache.set(ch, res);
    return res;
  };
  return text => {
    let out = "";
    for ( const ch of String(text ?? "").normalize("NFC") ) {
      if ( ch === "\n" ) { out += ch; continue; }
      if ( ch === "\t" ) { out += " "; continue; }
      const rep = REPLACEMENTS[ch];
      if ( rep !== undefined ) { out += rep; continue; }
      if ( ok(ch) ) { out += ch; continue; }
      const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += (stripped && [...stripped].every(ok)) ? stripped : "?";
    }
    return out;
  };
}

/** Word-wrap text into lines that fit `width` at `size`. */
function wrap(text, font, size, width) {
  const lines = [];
  for ( const para of text.split("\n") ) {
    if ( !para.trim() ) { lines.push(""); continue; }
    let line = "";
    for ( let word of para.split(/ +/) ) {
      const candidate = line ? `${line} ${word}` : word;
      if ( font.widthOfTextAtSize(candidate, size) <= width ) { line = candidate; continue; }
      if ( line ) lines.push(line);
      // Break words that are longer than a whole line.
      while ( font.widthOfTextAtSize(word, size) > width ) {
        let i = word.length - 1;
        while ( i > 1 && font.widthOfTextAtSize(word.slice(0, i), size) > width ) i--;
        lines.push(word.slice(0, i));
        word = word.slice(i);
      }
      line = word;
    }
    lines.push(line);
  }
  return lines;
}

function widgetBox(field) {
  const widget = field.acroField.getWidgets()[0];
  const rect = widget.getRectangle();
  const border = widget.getBorderStyle()?.getWidth() ?? 0;
  const pad = border + 1;
  // A little extra margin so pdf-lib never re-wraps our pre-wrapped lines.
  return { width: rect.width - 2 * pad - 1.5, height: rect.height - 2 * pad, rawHeight: rect.height };
}

/** The template's fields have no /DA entry of their own, so set one (Helvetica, black). */
function setFontSize(field, size) {
  field.acroField.setDefaultAppearance(`/Helv ${Math.round(size * 100) / 100} Tf 0 g`);
}

const lineHeight = (font, size) => font.heightAtSize(size) * 1.2;

/**
 * @param {object} PDFLib            The pdf-lib namespace.
 * @param {ArrayBuffer|Uint8Array} templateBytes
 * @param {SheetData} sheet
 * @param {{flatten?: boolean}} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(PDFLib, templateBytes, sheet, { flatten=false }={}) {
  const { PDFDocument, StandardFonts, PDFTextField, PDFCheckBox } = PDFLib;
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const clean = makeSanitizer(font);
  const warnings = [];

  const getText = name => {
    try {
      const f = form.getField(name);
      return f instanceof PDFTextField ? f : null;
    } catch { warnings.push(`Missing field: ${name}`); return null; }
  };

  // Single-line fields: shrink font until it fits.
  for ( const [name, raw] of Object.entries(sheet.fields ?? {}) ) {
    if ( raw === undefined || raw === null || raw === "" ) continue;
    const field = getText(name);
    if ( !field ) continue;
    const text = clean(raw).replace(/\n+/g, " ").trim();
    const box = widgetBox(field);
    let size = Math.min(Math.max(box.rawHeight * 0.62, 6), 14);
    while ( size > 4 && font.widthOfTextAtSize(text, size) > box.width ) size -= 0.25;
    field.setText(text);
    setFontSize(field, size);
  }

  // Multi-line flows.
  const overflow = [];
  for ( const flow of sheet.flows ?? [] ) {
    const max = flow.max ?? 9;
    const min = flow.min ?? 6;
    let rest = clean(flow.text ?? "").replace(/\n{3,}/g, "\n\n").trim();
    for ( const name of flow.fields ) {
      if ( !rest ) break;
      const field = getText(name);
      if ( !field ) continue;
      field.enableMultiline();
      const box = widgetBox(field);
      let size = max;
      let lines;
      for ( ; size >= min; size -= 0.5 ) {
        lines = wrap(rest, font, size, box.width);
        if ( lines.length * lineHeight(font, size) <= box.height ) break;
      }
      if ( size < min ) {
        size = min;
        lines = wrap(rest, font, size, box.width);
        const fit = Math.max(1, Math.floor(box.height / lineHeight(font, size)));
        rest = lines.slice(fit).join("\n").trim();
        lines = lines.slice(0, fit);
      } else rest = "";
      field.setText(lines.join("\n"));
      setFontSize(field, size);
    }
    if ( rest ) overflow.push({ title: `${flow.title} ${sheet.labels?.continued ?? ""}`.trim(), text: rest });
  }

  for ( const name of sheet.checks ?? [] ) {
    try {
      const f = form.getField(name);
      if ( f instanceof PDFCheckBox ) f.check();
    } catch { warnings.push(`Missing checkbox: ${name}`); }
  }

  // Portrait.
  if ( sheet.portrait?.bytes ) {
    try {
      const img = sheet.portrait.type === "jpg"
        ? await pdf.embedJpg(sheet.portrait.bytes) : await pdf.embedPng(sheet.portrait.bytes);
      form.getButton("CHARACTER IMAGE").setImage(img);
    } catch ( err ) { warnings.push(`Portrait: ${err.message}`); }
  }

  // Appendix pages.
  const tidy = t => clean(t ?? "").replace(/\n{3,}/g, "\n\n").trim();
  const sections = [...overflow, ...(sheet.appendix ?? [])].map(s => ({
    title: clean(s.title),
    entries: (s.entries ?? [{ name: "", text: s.text }])
      .map(e => ({ name: clean(e.name ?? "").trim(), text: tidy(e.text) }))
      .filter(e => e.name || e.text)
  })).filter(s => s.entries.length);
  if ( sections.length ) await drawAppendix(pdf, PDFLib, sections, sheet, clean);

  form.updateFieldAppearances(font);
  if ( flatten ) form.flatten();
  pdf.setTitle(clean(sheet.title ?? "Character"));
  pdf.setCreator("Foundry VTT - D&D 5e PDF Export");
  const bytes = await pdf.save();
  return { bytes, warnings };
}

async function drawAppendix(pdf, PDFLib, sections, sheet, clean) {
  const { StandardFonts, rgb } = PDFLib;
  const [first] = pdf.getPages();
  const { width: W, height: H } = first.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const red = rgb(0.46, 0.09, 0.07);
  const ink = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.55, 0.55, 0.55);
  const M = 48;
  const colGap = 18;
  const colW = (W - 2 * M - colGap) / 2;
  const size = 8.5;
  const lh = size * 1.3;
  const top = H - M - 44;
  const bottom = M + 20;
  const title = clean(`${sheet.title ?? ""} – ${sheet.labels?.appendix ?? "Appendix"}`);

  let page, col, y, pageNo = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pageNo++;
    col = 0;
    y = top;
    page.drawText(title, { x: M, y: H - M - 18, size: 18, font: serif, color: ink });
    page.drawLine({ start: { x: M, y: H - M - 26 }, end: { x: W - M, y: H - M - 26 }, thickness: 1.5, color: red });
    page.drawLine({ start: { x: M, y: H - M - 29 }, end: { x: W - M, y: H - M - 29 }, thickness: 0.5, color: red });
    page.drawText(`${sheet.labels?.page ?? "Page"} ${3 + pageNo}`, { x: W - M - 40, y: M - 4, size: 7, font: body, color: grey });
  };
  const advance = need => {
    if ( y - need >= bottom ) return;
    if ( col === 0 ) { col = 1; y = top; return; }
    newPage();
  };
  const x = () => M + col * (colW + colGap);

  newPage();
  for ( const section of sections ) {
    advance(lh * 3);
    y -= 12;
    page.drawText(section.title.toUpperCase(), { x: x(), y, size: 9.5, font: bold, color: red });
    y -= 3;
    page.drawLine({ start: { x: x(), y }, end: { x: x() + colW, y }, thickness: 0.6, color: red });
    y -= 4;
    for ( const entry of section.entries ) {
      if ( entry.name ) {
        advance(lh * 2);
        y -= 3;
        for ( const line of wrap(entry.name, bold, size, colW) ) {
          y -= lh;
          page.drawText(line, { x: x(), y, size, font: bold, color: ink });
        }
      }
      for ( const line of wrap(entry.text, body, size, colW) ) {
        advance(lh);
        y -= line ? lh : lh * 0.5;
        if ( line ) page.drawText(line, { x: x(), y, size, font: body, color: ink });
      }
    }
    y -= 6;
  }
}
