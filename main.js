import { MODULE_ID, extractSheet } from "./extract.js";
import { buildPdf } from "./fill.js";

const ACTION = "dnd5ePdfExport";
const DEFAULT_TEMPLATE = `modules/${MODULE_ID}/assets/character-sheet.pdf`;
const L = key => game.i18n.localize(`${MODULE_ID}.${key}`);
const running = new Set();

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "template", {
    name: `${MODULE_ID}.Settings.Template.Name`,
    hint: `${MODULE_ID}.Settings.Template.Hint`,
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_TEMPLATE,
    filePicker: "any"
  });
  game.settings.register(MODULE_ID, "lastOptions", {
    scope: "client",
    config: false,
    type: Object,
    default: { portrait: true, featureDescriptions: false, spellDescriptions: false, flatten: false }
  });

  const module = game.modules.get(MODULE_ID);
  module.api = { exportActor, buildPdfBytes };
});

/* -------------------------------------------- */
/*  Export                                      */
/* -------------------------------------------- */

const canExport = actor => actor?.type === "character" && actor.testUserPermission(game.user, "OBSERVER");

/**
 * Build the filled PDF for an actor.
 * @param {Actor} actor
 * @param {object} [options]
 * @returns {Promise<{bytes: Uint8Array, warnings: string[]}>}
 */
async function buildPdfBytes(actor, options={}) {
  const PDFLib = globalThis.PDFLib;
  if ( !PDFLib ) throw new Error("pdf-lib was not loaded.");
  const path = game.settings.get(MODULE_ID, "template") || DEFAULT_TEMPLATE;
  const response = await fetch(foundry.utils.getRoute ? foundry.utils.getRoute(path) : path);
  if ( !response.ok ) throw new Error(`${L("Error.Template")} (${path})`);
  const template = await response.arrayBuffer();
  const sheet = await extractSheet(actor, options);
  return buildPdf(PDFLib, template, sheet, { flatten: options.flatten });
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ask for export options. Resolves to null when cancelled. */
async function promptOptions(actor) {
  const last = game.settings.get(MODULE_ID, "lastOptions") ?? {};
  const box = (name, checked) => `
    <div class="form-group">
      <label class="checkbox" style="display:flex;gap:.5em;align-items:center">
        <input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${L(`Dialog.${name}`)}
      </label>
    </div>`;
  const content = `<p>${L("Dialog.Intro")}</p>
    ${box("portrait", last.portrait ?? true)}
    ${box("featureDescriptions", last.featureDescriptions)}
    ${box("spellDescriptions", last.spellDescriptions)}
    ${box("flatten", last.flatten)}`;

  const DialogV2 = foundry.applications?.api?.DialogV2;
  const read = form => ({
    portrait: !!form.elements.portrait?.checked,
    featureDescriptions: !!form.elements.featureDescriptions?.checked,
    spellDescriptions: !!form.elements.spellDescriptions?.checked,
    flatten: !!form.elements.flatten?.checked
  });

  let result = null;
  if ( DialogV2 ) {
    result = await DialogV2.wait({
      window: { title: `${L("Dialog.Title")}: ${actor.name}`, icon: "fa-solid fa-file-pdf" },
      content,
      rejectClose: false,
      buttons: [
        { action: "export", label: L("Dialog.Export"), icon: "fa-solid fa-download", default: true,
          callback: (event, button) => read(button.form) },
        { action: "cancel", label: L("Dialog.Cancel"), icon: "fa-solid fa-xmark", callback: () => null }
      ]
    });
  } else {
    result = await Dialog.wait({
      title: `${L("Dialog.Title")}: ${actor.name}`,
      content: `<form>${content}</form>`,
      buttons: {
        export: { label: L("Dialog.Export"), callback: html => read(html[0].querySelector("form")) },
        cancel: { label: L("Dialog.Cancel"), callback: () => null }
      },
      default: "export",
      close: () => null
    });
  }
  if ( result && typeof result === "object" ) {
    await game.settings.set(MODULE_ID, "lastOptions", result);
    return result;
  }
  return null;
}

/**
 * Export an actor as a filled PDF and download it.
 * @param {Actor} actor
 * @param {object} [options]  Skip the dialog by passing options ({portrait, featureDescriptions, spellDescriptions, flatten}).
 */
async function exportActor(actor, options) {
  if ( !canExport(actor) ) {
    ui.notifications.warn(L("Error.NotCharacter"));
    return;
  }
  if ( running.has(actor.uuid) ) return;
  running.add(actor.uuid);
  try {
    options ??= await promptOptions(actor);
  } finally {
    if ( !options ) running.delete(actor.uuid);
  }
  if ( !options ) return;
  const note = ui.notifications.info(L("Working"), { permanent: false });
  try {
    const { bytes, warnings } = await buildPdfBytes(actor, options);
    if ( warnings.length ) console.warn(`${MODULE_ID} |`, warnings);
    const filename = `${actor.name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "character"}.pdf`;
    download(bytes, filename);
    ui.notifications.info(`${L("Done")}: ${filename}`);
  } catch ( err ) {
    console.error(`${MODULE_ID} | Export failed`, err);
    ui.notifications.error(`${L("Error.Failed")}: ${err.message}`);
  } finally {
    running.delete(actor.uuid);
    if ( note?.remove ) try { note.remove(); } catch { /* ignore */ }
  }
}

/* -------------------------------------------- */
/*  UI hooks                                    */
/* -------------------------------------------- */

// ApplicationV2 actor sheets (Foundry v13+/dnd5e 5+).
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = app.document ?? app.actor;
  if ( !(actor instanceof Actor) || !canExport(actor) ) return;
  if ( controls.some(c => c.action === ACTION) ) return;
  app.options.actions ??= {};
  app.options.actions[ACTION] ??= function() { exportActor(this.document ?? this.actor); };
  controls.push({ action: ACTION, icon: "fa-solid fa-file-pdf", label: `${MODULE_ID}.Button` });
});

// ApplicationV1 actor sheets (Foundry v12/dnd5e 3–4).
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.document;
  if ( !canExport(actor) ) return;
  buttons.unshift({ label: L("ButtonShort"), class: "dnd5e-pdf-export", icon: "fas fa-file-pdf",
    onclick: () => exportActor(actor) });
});

// Actors sidebar context menu.
function addContextOption(app, options) {
  const v14 = (game.release?.generation ?? 12) >= 14;
  const getActor = li => {
    const el = li?.[0] ?? li;
    const id = el?.dataset?.entryId ?? el?.dataset?.documentId;
    return game.actors.get(id);
  };
  if ( v14 ) options.push({
    label: `${MODULE_ID}.Button`,
    icon: "fa-solid fa-file-pdf",
    visible: li => canExport(getActor(li)),
    onClick: (event, li) => exportActor(getActor(li))
  });
  else options.push({
    name: `${MODULE_ID}.Button`,
    icon: '<i class="fa-solid fa-file-pdf"></i>',
    condition: li => canExport(getActor(li)),
    callback: li => exportActor(getActor(li))
  });
}
Hooks.on("getActorContextOptions", (app, options) => {
  if ( app.collection?.documentName && app.collection.documentName !== "Actor" ) return;
  if ( app.metadata ) return; // compendium
  addContextOption(app, options);
});
Hooks.on("getActorDirectoryEntryContext", addContextOption);
