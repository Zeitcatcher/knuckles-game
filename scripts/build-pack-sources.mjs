/**
 * Generate the compendium SOURCE documents (committed) from the agnostic catalog
 * + the Pathfinder English theme. Run this whenever the catalog, prices, theme, or
 * the test macro change, then `npm run build:packs` to compile the LevelDB packs.
 *
 *   node scripts/build-pack-sources.mjs
 *
 * Outputs:
 *   src/packs/dice/<id>.json     — 37 pf2e `equipment` items (one per die)
 *   src/packs/macros/testdice.json — the "Knuckles — Test Dice" GM tool
 *
 * Identity: each die carries flags["knuckles-game"].dieId AND system.slug
 * "knuckles-die-<id>" (both proven durable through buy/sell in the Phase 0 probe).
 * Names/descriptions are the neutral English snapshot for the SHOP SHEET only; the
 * Knuckles UI always resolves per-viewer names from the theme files at runtime.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const catalog = read("data/dice-catalog.json");
const flavor = read("themes/pathfinder/English.json");
const macroJs = readFileSync(resolve(ROOT, "tools/testdice-macro/testdice-macro.js"), "utf8");

const MODULE_ID = "knuckles-game";
const DEFAULT_IMG = `modules/${MODULE_ID}/assets/dice/default.webp`;

/** Per-die art if present (assets/dice/<id>.webp|png), else the shared default. */
function imgFor(id) {
  for (const ext of ["webp", "png"]) {
    if (existsSync(resolve(ROOT, `assets/dice/${id}.${ext}`))) return `modules/${MODULE_ID}/assets/dice/${id}.${ext}`;
  }
  return DEFAULT_IMG;
}

/** Stable 16-char Foundry id from a short prefix. */
const makeId = (s) => s.replace(/[^A-Za-z0-9]/g, "").padEnd(16, "0").slice(0, 16);

/** Copper-equivalent -> a pf2e Coins object (gp/sp/cp), minimal denominations. */
function cpToCoins(cp) {
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  const v = {};
  if (gp) v.gp = gp;
  if (sp) v.sp = sp;
  if (c) v.cp = c;
  if (!gp && !sp && !c) v.cp = 0;
  return v;
}

function diceItem(die) {
  const id = die.id;
  const f = flavor.dice[id] ?? { name: `Knuckles Die ${id}`, desc: "" };
  const _id = makeId(`kgdie${id}`);
  return {
    _id,
    _key: `!items!${_id}`,
    name: f.name,
    type: "equipment",
    img: imgFor(id),
    system: {
      description: { value: `<p>${f.desc}</p>` },
      rules: [],
      slug: `knuckles-die-${id}`,
      traits: { value: [], rarity: "common", otherTags: [] },
      publication: { title: "", authors: "", license: "OGL", remaster: true },
      level: { value: 0 },
      quantity: 1,
      baseItem: null,
      bulk: { value: 0 },
      hp: { value: 0, max: 0 },
      hardness: 0,
      price: { value: cpToCoins(die.price) },
      equipped: { carryType: "worn", handsHeld: 0 },
      containerId: null,
      size: "med",
      material: { type: null, grade: null },
      identification: { status: "identified" },
      usage: { value: "held-in-one-hand" },
    },
    flags: { [MODULE_ID]: { dieId: id } },
  };
}

function testMacro() {
  const _id = makeId("kgtestdice");
  return {
    _id,
    _key: `!macros!${_id}`,
    name: "Knuckles — Test Dice",
    type: "script",
    img: DEFAULT_IMG,
    scope: "global",
    command: macroJs,
    flags: {},
  };
}

function writeDir(rel, docs) {
  const dir = resolve(ROOT, rel);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const doc of docs) {
    writeFileSync(resolve(dir, `${doc._id}.json`), JSON.stringify(doc, null, 2) + "\n");
  }
  return docs.length;
}

const nDice = writeDir("src/packs/dice", catalog.dice.map(diceItem));
const nMac = writeDir("src/packs/macros", [testMacro()]);
console.log(`build-pack-sources: wrote ${nDice} dice items + ${nMac} macro to src/packs/.`);
