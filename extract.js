import { SPELL_ROWS } from "./spell-rows.js";

export const MODULE_ID = "dnd5e-pdf-export";

const L = (key, data) => data
  ? game.i18n.format(`${MODULE_ID}.${key}`, data)
  : game.i18n.localize(`${MODULE_ID}.${key}`);

/** Localize a CONFIG entry that may be a string or an object with a label. */
const cfgLabel = (entry, fallback="") => {
  const label = typeof entry === "string" ? entry : (entry?.label ?? fallback);
  return label ? game.i18n.localize(label) : fallback;
};
const cfgAbbr = (entry, fallback="") => {
  const abbr = typeof entry === "object" ? entry?.abbreviation : null;
  return abbr ? game.i18n.localize(abbr) : fallback;
};

const signed = value => {
  const n = Number(value);
  if ( !Number.isFinite(n) ) return value ?? "";
  return n >= 0 ? `+${n}` : `-${Math.abs(n)}`;
};
const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const toSet = value => {
  if ( value instanceof Set ) return value;
  if ( Array.isArray(value) ) return new Set(value);
  return new Set();
};
const splitCustom = custom => String(custom ?? "").split(";").map(s => s.trim()).filter(Boolean);

const ABILITIES = [
  ["str", "STR", "STRmod", "ST Strength", "Check Box 11"],
  ["dex", "DEX", "DEXmod ", "ST Dexterity", "Check Box 18"],
  ["con", "CON", "CONmod", "ST Constitution", "Check Box 19"],
  ["int", "INT", "INTmod", "ST Intelligence", "Check Box 20"],
  ["wis", "WIS", "WISmod", "ST Wisdom", "Check Box 21"],
  ["cha", "CHA", "CHamod", "ST Charisma", "Check Box 22"]
];

const SKILLS = [
  ["acr", "Acrobatics", "Check Box 23"], ["ani", "Animal", "Check Box 24"], ["arc", "Arcana", "Check Box 25"],
  ["ath", "Athletics", "Check Box 26"], ["dec", "Deception ", "Check Box 27"], ["his", "History ", "Check Box 28"],
  ["ins", "Insight", "Check Box 29"], ["itm", "Intimidation", "Check Box 30"], ["inv", "Investigation ", "Check Box 31"],
  ["med", "Medicine", "Check Box 32"], ["nat", "Nature", "Check Box 33"], ["prc", "Perception ", "Check Box 34"],
  ["prf", "Performance", "Check Box 35"], ["per", "Persuasion", "Check Box 36"], ["rel", "Religion", "Check Box 37"],
  ["slt", "SleightofHand", "Check Box 38"], ["ste", "Stealth ", "Check Box 39"], ["sur", "Survival", "Check Box 40"]
];

const WEAPON_ROWS = [
  ["Wpn Name", "Wpn1 AtkBonus", "Wpn1 Damage"],
  ["Wpn Name 2", "Wpn2 AtkBonus ", "Wpn2 Damage "],
  ["Wpn Name 3", "Wpn3 AtkBonus  ", "Wpn3 Damage "]
];

const SLOT_FIELDS = level => [`SlotsTotal ${18 + level}`, `SlotsRemaining ${18 + level}`];

const INVENTORY_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "container", "backpack"]);

/* -------------------------------------------- */
/*  HTML → text                                 */
/* -------------------------------------------- */

const getTextEditor = () => foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

/** Convert (optionally enriched) HTML into plain text with line breaks. */
export async function htmlToText(html, { enrich=false, rollData, relativeTo }={}) {
  if ( !html ) return "";
  let source = String(html);
  if ( enrich ) {
    try {
      source = await getTextEditor().enrichHTML(source, { rollData, relativeTo, secrets: false, async: true });
    } catch { /* fall back to raw source */ }
  }
  // Unresolved enrichers: @UUID[...]{Label}, &Reference[...]{Label}, [[/r 1d6]]{Label}
  source = source
    .replace(/[@&](\w+)\[([^\]]+)\](?:\{([^}]+)\})?/g, (m, type, target, label) => label ?? target.split(/[.\s]/).pop())
    .replace(/\[\[\/?\w*\s*([^\]]*?)\]\](?:\{([^}]+)\})?/g, (m, formula, label) => label ?? formula)
    .replace(/<section[^>]*class="[^"]*secret[^"]*"[^>]*>[\s\S]*?<\/section>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|section|blockquote|header|footer)>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " ");
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
  const text = doc.body.textContent ?? "";
  return text
    .split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function traitLabel(key, trait) {
  try {
    const Trait = dnd5e.documents?.Trait;
    const label = Trait?.keyLabel?.(key, { trait });
    if ( label ) return label;
  } catch { /* ignore */ }
  return key;
}

function proficiencyList(data, trait) {
  if ( !data ) return [];
  const keys = [...toSet(data.value)].map(k => traitLabel(k, trait));
  return [...keys, ...splitCustom(data.custom)];
}

function playerName(actor) {
  const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
  return (owners.find(u => u.character?.id === actor.id) ?? owners[0])?.name ?? "";
}

function classes(actor) {
  const list = Object.values(actor.classes ?? {});
  if ( !list.length ) return actor.items.filter(i => i.type === "class");
  const original = actor.system.details?.originalClass;
  return list.sort((a, b) => (b.id === original) - (a.id === original) || (b.system.levels - a.system.levels));
}

function hitDice(classItems) {
  const total = {};
  const remaining = {};
  for ( const cls of classItems ) {
    const levels = cls.system.levels ?? 0;
    const die = cls.system.hd?.denomination ?? cls.system.hitDice ?? "";
    if ( !die ) continue;
    const left = cls.system.hd?.value ?? (levels - (cls.system.hitDiceUsed ?? 0));
    total[die] = (total[die] ?? 0) + levels;
    remaining[die] = (remaining[die] ?? 0) + Math.max(0, left);
  }
  const fmt = (obj, sep) => Object.entries(obj)
    .sort((a, b) => parseInt(b[0].slice(1)) - parseInt(a[0].slice(1)))
    .map(([d, n]) => `${n}${d}`).join(sep);
  return { total: fmt(total, " + "), remaining: fmt(remaining, ", ") };
}

function usesLabel(item) {
  const uses = item.system.uses;
  const max = num(uses?.max);
  if ( !max ) return "";
  const value = num(uses.value) ?? max;
  return `${value}/${max}`;
}

function weaponInfo(item, actor) {
  const labels = item.labels ?? {};
  let toHit = labels.attacks?.[0]?.toHit ?? labels.toHit ?? "";
  if ( !toHit && item.type === "weapon" ) {
    // Rough fallback: ability modifier + proficiency + magical bonus.
    const abl = actor.system.abilities ?? {};
    const finesse = toSet(item.system.properties).has("fin");
    const ranged = ["simpleR", "martialR"].includes(item.system.type?.value ?? item.system.weaponType);
    let mod = ranged ? abl.dex?.mod : abl.str?.mod;
    if ( finesse ) mod = Math.max(abl.str?.mod ?? 0, abl.dex?.mod ?? 0);
    const prof = item.system.proficient || item.system.prof?.multiplier ? actor.system.attributes.prof : 0;
    toHit = signed((mod ?? 0) + (prof ?? 0) + (num(item.system.magicalBonus) ?? 0));
  }
  let damage = "";
  const dmg = labels.damages?.[0];
  if ( dmg?.formula ) {
    const type = dmg.damageType ? cfgLabel(CONFIG.DND5E.damageTypes?.[dmg.damageType], "") : "";
    damage = `${dmg.formula} ${type}`.trim();
  } else if ( labels.damage ) damage = labels.damage;
  else {
    const parts = item.system.damage?.parts?.[0];
    if ( parts?.[0] ) damage = `${parts[0]} ${cfgLabel(CONFIG.DND5E.damageTypes?.[parts[1]], "")}`.trim();
  }
  return { toHit: String(toHit).replace(/\s+/g, ""), damage: String(damage).replace(/\s*\+\s*/g, "+") };
}

function spellMarks(item) {
  const props = toSet(item.system.properties);
  const marks = [];
  if ( props.has("ritual") || item.system.components?.ritual ) marks.push(L("Mark.Ritual"));
  if ( props.has("concentration") || item.system.components?.concentration ) marks.push(L("Mark.Concentration"));
  return marks.length ? ` (${marks.join(", ")})` : "";
}

function isPrepared(item) {
  const sys = item.system;
  if ( "method" in sys || typeof sys.prepared === "number" ) {
    const canPrepare = sys.canPrepare ?? !!CONFIG.DND5E.spellcasting?.[sys.method]?.prepares;
    return canPrepare ? (sys.prepared ?? 0) >= 1 : true;
  }
  const mode = sys.preparation?.mode;
  if ( mode === "prepared" ) return !!sys.preparation?.prepared;
  return true;
}

async function loadPortrait(src) {
  if ( !src || /mystery-man/.test(src) ) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const max = 900;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if ( !blob ) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "png" };
  } catch ( err ) {
    console.warn(`${MODULE_ID} | Could not load portrait`, err);
    return null;
  }
}

/* -------------------------------------------- */
/*  Main extraction                             */
/* -------------------------------------------- */

/**
 * Collect everything the PDF needs from a dnd5e character.
 * @param {Actor} actor
 * @param {{portrait?: boolean, featureDescriptions?: boolean, spellDescriptions?: boolean}} options
 */
export async function extractSheet(actor, options={}) {
  const sys = actor.system;
  const attr = sys.attributes ?? {};
  const details = sys.details ?? {};
  const traits = sys.traits ?? {};
  const fields = {};
  const checks = [];
  const flows = [];
  const appendix = [];

  /* ---------- Header ---------- */
  const classItems = classes(actor);
  fields.ClassLevel = classItems.map(cls => {
    const sub = cls.subclass?.name ?? actor.items.find(i => i.type === "subclass"
      && i.system.classIdentifier === (cls.system.identifier ?? cls.identifier))?.name;
    return `${cls.name} ${cls.system.levels}${sub ? ` (${sub})` : ""}`;
  }).join(" / ");
  fields.Background = typeof details.background === "string" ? details.background : (details.background?.name ?? "");
  fields.PlayerName = playerName(actor);
  fields.CharacterName = actor.name;
  fields["CharacterName 2"] = actor.name;
  fields["Race "] = typeof details.race === "string" ? details.race : (details.race?.name ?? "");
  fields.Alignment = details.alignment ?? "";
  fields.XP = details.xp?.value ?? "";
  if ( attr.inspiration ) fields.Inspiration = "X";

  /* ---------- Abilities, saves, skills ---------- */
  for ( const [key, score, mod, save, box] of ABILITIES ) {
    const abl = sys.abilities?.[key];
    if ( !abl ) continue;
    fields[score] = abl.value;
    fields[mod] = signed(abl.mod);
    const saveValue = typeof abl.save === "object" ? abl.save?.value : abl.save;
    fields[save] = signed(saveValue ?? abl.mod);
    const proficient = (abl.save?.prof?.multiplier ?? abl.proficient ?? 0) >= 1;
    if ( proficient ) checks.push(box);
  }
  for ( const [key, field, box] of SKILLS ) {
    const skill = sys.skills?.[key];
    if ( !skill ) continue;
    fields[field] = signed(skill.total ?? skill.mod);
    if ( (skill.value ?? skill.proficient ?? 0) >= 1 ) checks.push(box);
  }
  fields.Passive = sys.skills?.prc?.passive ?? "";
  fields.ProfBonus = signed(attr.prof);

  /* ---------- Combat ---------- */
  fields.AC = attr.ac?.value ?? "";
  fields.Initiative = signed(attr.init?.total ?? attr.init?.mod);
  const movement = attr.movement ?? {};
  const speeds = movement.speeds ?? movement;
  const unitCfg = CONFIG.DND5E.movementUnits?.[movement.units];
  const unit = cfgAbbr(unitCfg, movement.units ?? "");
  const fmtDist = v => `${Number(v).toLocaleString(game.i18n.lang)} ${unit}`.trim();
  if ( num(speeds.walk) ) fields.Speed = fmtDist(speeds.walk);
  fields.HPMax = attr.hp?.max ?? "";
  fields.HPCurrent = attr.hp?.value ?? "";
  if ( attr.hp?.temp ) fields.HPTemp = attr.hp.temp;
  const hd = hitDice(classItems);
  fields.HDTotal = hd.total;
  fields.HD = hd.remaining;
  const death = attr.death ?? {};
  ["Check Box 12", "Check Box 13", "Check Box 14"].slice(0, death.success ?? 0).forEach(b => checks.push(b));
  ["Check Box 15", "Check Box 16", "Check Box 17"].slice(0, death.failure ?? 0).forEach(b => checks.push(b));

  /* ---------- Weapons & attacks ---------- */
  const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true });
  const weapons = actor.items.filter(i => i.type === "weapon")
    .sort((a, b) => (!!b.system.equipped - !!a.system.equipped) || byName(a, b));
  weapons.slice(0, 3).forEach((item, i) => {
    const info = weaponInfo(item, actor);
    const [n, atk, dmg] = WEAPON_ROWS[i];
    fields[n] = item.name;
    fields[atk] = info.toHit;
    fields[dmg] = info.damage;
  });
  const attackLines = weapons.slice(3).map(item => {
    const info = weaponInfo(item, actor);
    return `${item.name}: ${[info.toHit, info.damage].filter(Boolean).join(", ")}`;
  });

  /* ---------- Spellcasting ---------- */
  const spells = actor.items.filter(i => i.type === "spell").sort((a, b) => byName(a, b));
  const casterClasses = classItems.filter(c => (c.system.spellcasting?.progression ?? "none") !== "none"
    || (c.subclass?.system?.spellcasting?.progression ?? "none") !== "none");
  const spellAbility = attr.spellcasting;
  const abl = sys.abilities?.[spellAbility];
  const spellDC = attr.spell?.dc ?? attr.spelldc ?? (abl ? 8 + attr.prof + abl.mod : null);
  const spellAtk = attr.spell?.attack ?? (abl ? attr.prof + abl.mod : null);
  if ( spells.length || casterClasses.length ) {
    fields["Spellcasting Class 2"] = casterClasses.map(c => c.name).join(" / ");
    fields["SpellcastingAbility 2"] = spellAbility
      ? cfgAbbr(CONFIG.DND5E.abilities?.[spellAbility], spellAbility).toUpperCase() : "";
    if ( spellDC !== null ) fields["SpellSaveDC  2"] = spellDC;
    if ( spellAtk !== null ) fields["SpellAtkBonus 2"] = signed(spellAtk);
    if ( spellAtk !== null ) attackLines.push(L("SpellAttackLine", { attack: signed(spellAtk), dc: spellDC ?? "-" }));
  }
  for ( const item of spells.filter(s => (s.system.level === 0) && hasDamage(s)) ) {
    const info = weaponInfo(item, actor);
    if ( info.toHit || info.damage ) attackLines.push(`${item.name}: ${[info.toHit, info.damage].filter(Boolean).join(", ")}`);
  }
  flows.push({ fields: ["AttacksSpellcasting"], text: attackLines.join("\n"), title: L("Section.Attacks"), max: 9 });

  // Slots
  const pact = sys.spells?.pact;
  for ( let level = 1; level <= 9; level++ ) {
    const slot = sys.spells?.[`spell${level}`] ?? {};
    const max = num(slot.max) ?? num(slot.override) ?? 0;
    const value = num(slot.value) ?? 0;
    let totalLabel = max ? String(max) : "";
    const expended = max ? Math.max(0, max - value) : 0;
    let expendedLabel = max ? String(expended) : "";
    if ( pact?.max && (pact.level === level) ) {
      const pExp = Math.max(0, pact.max - (pact.value ?? 0));
      const tag = L("Mark.Pact");
      totalLabel = max ? `${max}+${pact.max}${tag}` : `${pact.max}${tag}`;
      expendedLabel = max ? `${expended}+${pExp}${tag}` : `${pExp}${tag}`;
    }
    const [tf, rf] = SLOT_FIELDS(level);
    if ( totalLabel ) { fields[tf] = totalLabel; fields[rf] = expendedLabel; }
  }

  // Spell lists
  const overflowSpells = [];
  for ( let level = 0; level <= 9; level++ ) {
    const list = spells.filter(s => (s.system.level ?? 0) === level);
    const rows = SPELL_ROWS[level];
    list.forEach((item, i) => {
      const name = `${item.name}${spellMarks(item)}`;
      const prepared = level > 0 && isPrepared(item);
      if ( i < rows.length ) {
        const [field, box] = rows[i];
        fields[field] = name;
        if ( prepared && box ) checks.push(box);
      } else overflowSpells.push({ level, name: `${name}${prepared ? ` [${L("Mark.Prepared")}]` : ""}` });
    });
  }
  if ( overflowSpells.length ) {
    const levels = [...new Set(overflowSpells.map(s => s.level))];
    appendix.push({
      title: L("Section.MoreSpells"),
      entries: levels.map(level => ({
        name: level === 0 ? L("Cantrips") : L("SpellLevel", { level }),
        text: overflowSpells.filter(s => s.level === level).map(s => s.name).join("\n")
      }))
    });
  }

  /* ---------- Currency ---------- */
  for ( const coin of ["cp", "sp", "ep", "gp", "pp"] ) {
    const value = sys.currency?.[coin];
    if ( value !== undefined && value !== null ) fields[coin.toUpperCase()] = value;
  }

  /* ---------- Personality ---------- */
  flows.push({ fields: ["PersonalityTraits "], text: await htmlToText(details.trait), title: L("Section.Traits") });
  flows.push({ fields: ["Ideals"], text: await htmlToText(details.ideal), title: L("Section.Ideals") });
  flows.push({ fields: ["Bonds"], text: await htmlToText(details.bond), title: L("Section.Bonds") });
  flows.push({ fields: ["Flaws"], text: await htmlToText(details.flaw), title: L("Section.Flaws") });

  /* ---------- Proficiencies & languages ---------- */
  const prof = [];
  const armor = proficiencyList(traits.armorProf, "armor");
  const weaponsProf = proficiencyList(traits.weaponProf, "weapon");
  const tools = sys.tools ? Object.keys(sys.tools).map(k => traitLabel(k, "tool")) : proficiencyList(traits.toolProf, "tool");
  const languages = traits.languages?.labels?.languages ?? proficiencyList(traits.languages, "languages");
  if ( armor.length ) prof.push(`${L("Prof.Armor")}: ${armor.join(", ")}`);
  if ( weaponsProf.length ) prof.push(`${L("Prof.Weapons")}: ${weaponsProf.join(", ")}`);
  if ( tools.length ) prof.push(`${L("Prof.Tools")}: ${tools.join(", ")}`);
  if ( languages.length ) prof.push(`${L("Prof.Languages")}: ${languages.join(", ")}`);
  flows.push({ fields: ["ProficienciesLang"], text: prof.join("\n"), title: L("Section.Proficiencies") });

  /* ---------- Equipment & treasure ---------- */
  const fmtItem = i => {
    const qty = num(i.system.quantity) ?? 1;
    return `${qty > 1 ? `${qty}× ` : ""}${i.name}`;
  };
  const inventory = actor.items.filter(i => INVENTORY_TYPES.has(i.type))
    .sort((a, b) => (!!b.system.equipped - !!a.system.equipped) || byName(a, b));
  flows.push({ fields: ["Equipment"], text: inventory.map(fmtItem).join(", "), title: L("Section.Equipment"), max: 8 });
  const loot = actor.items.filter(i => i.type === "loot").sort(byName);
  flows.push({ fields: ["Treasure"], text: loot.map(fmtItem).join(", "), title: L("Section.Treasure") });

  /* ---------- Features & traits ---------- */
  const featLines = [];
  const senses = attr.senses ?? {};
  const ranges = senses.ranges ?? senses;
  const senseUnit = cfgAbbr(CONFIG.DND5E.movementUnits?.[senses.units], senses.units ?? unit);
  const senseList = Object.keys(CONFIG.DND5E.senses ?? {})
    .filter(k => num(ranges[k]))
    .map(k => `${cfgLabel(CONFIG.DND5E.senses[k], k)} ${Number(ranges[k]).toLocaleString(game.i18n.lang)} ${senseUnit}`.trim());
  if ( senses.special ) senseList.push(...splitCustom(senses.special));
  if ( senseList.length ) featLines.push(`${L("Senses")}: ${senseList.join(", ")}`);
  const otherSpeeds = Object.keys(CONFIG.DND5E.movementTypes ?? {})
    .filter(k => (k !== "walk") && num(speeds[k]))
    .map(k => `${cfgLabel(CONFIG.DND5E.movementTypes[k], k)} ${fmtDist(speeds[k])}`);
  if ( otherSpeeds.length ) featLines.push(`${L("Movement")}: ${otherSpeeds.join(", ")}`);
  const dmgList = key => [...toSet(traits[key]?.value)]
    .map(k => cfgLabel(CONFIG.DND5E.damageTypes?.[k] ?? CONFIG.DND5E.conditionTypes?.[k], k))
    .concat(splitCustom(traits[key]?.custom));
  for ( const [key, label] of [["dr", "Resistances"], ["di", "Immunities"], ["dv", "Vulnerabilities"], ["ci", "ConditionImmunities"]] ) {
    const list = dmgList(key);
    if ( list.length ) featLines.push(`${L(label)}: ${list.join(", ")}`);
  }
  if ( featLines.length ) featLines.push("");

  const feats = actor.items.filter(i => i.type === "feat").sort(byName);
  const groups = new Map();
  for ( const item of feats ) {
    const type = item.system.type?.value ?? "";
    const label = type ? cfgLabel(CONFIG.DND5E.featureTypes?.[type], type) : L("Other");
    if ( !groups.has(label) ) groups.set(label, []);
    const uses = usesLabel(item);
    groups.get(label).push(`${item.name}${uses ? ` (${uses})` : ""}`);
  }
  for ( const [label, names] of groups ) featLines.push(`${label}: ${names.join(", ")}`);
  flows.push({
    fields: ["Features and Traits", "Feat+Traits"], text: featLines.join("\n"), title: L("Section.Features"), max: 8.5
  });

  if ( options.featureDescriptions && feats.length ) {
    const entries = [];
    for ( const item of feats ) {
      const uses = usesLabel(item);
      const text = await htmlToText(item.system.description?.value, {
        enrich: true, rollData: item.getRollData?.(), relativeTo: item
      });
      entries.push({ name: `${item.name}${uses ? ` (${uses})` : ""}`, text });
    }
    appendix.push({ title: L("Section.FeatureDescriptions"), entries });
  }

  if ( options.spellDescriptions && spells.length ) {
    const entries = [];
    const sorted = [...spells].sort((a, b) => (a.system.level - b.system.level) || byName(a, b));
    for ( const item of sorted ) {
      const lvl = item.system.level ? L("SpellLevel", { level: item.system.level }) : L("Cantrip");
      const text = await htmlToText(item.system.description?.value, {
        enrich: true, rollData: item.getRollData?.(), relativeTo: item
      });
      entries.push({ name: `${item.name}${spellMarks(item)} – ${lvl}`, text });
    }
    appendix.push({ title: L("Section.SpellDescriptions"), entries });
  }

  /* ---------- Page 2: appearance & backstory ---------- */
  for ( const key of ["Age", "Height", "Weight", "Eyes", "Skin", "Hair"] ) {
    fields[key] = details[key.toLowerCase()] ?? "";
  }
  const backstory = [];
  const appearance = await htmlToText(details.appearance);
  if ( appearance ) backstory.push(`${L("Appearance")}: ${appearance}`);
  const bio = await htmlToText(details.biography?.value, { enrich: true, rollData: actor.getRollData?.(), relativeTo: actor });
  if ( bio ) backstory.push(bio);
  flows.push({ fields: ["Backstory"], text: backstory.join("\n\n"), title: L("Section.Backstory") });

  return {
    title: actor.name,
    fields,
    checks,
    flows,
    appendix,
    portrait: options.portrait === false ? null : await loadPortrait(actor.img),
    labels: { appendix: L("Appendix"), continued: L("Continued"), page: L("Page") }
  };
}

function hasDamage(item) {
  return !!(item.labels?.damages?.length || item.labels?.damage || item.system.damage?.parts?.length);
}
