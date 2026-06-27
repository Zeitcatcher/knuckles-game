/**
 * Theme + localization loader for dice flavor. A theme offers a set of languages;
 * each language file maps die id -> { name, desc }. Mechanics live in the shared
 * dice catalog (dice-data.mjs). Resolution: viewer language -> theme baseLanguage
 * -> the die id itself. Only flavor is localized; nothing visual changes.
 */
import { MODULE_ID, SETTINGS } from "../constants.mjs";

let registry = null;           // { default, themes: [{id, dir}] }
const meta = new Map();        // id -> { id, name, dir, baseLanguage, languages:[{name,code}] }
const langCache = new Map();   // `${themeId}:${code}` -> { dice: {id:{name,desc}} } | null

/** Load the registry and every bundled theme's metadata. Call once at startup. */
export async function loadThemes() {
  try {
    registry = await foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/themes/index.json`);
    for (const t of registry.themes ?? []) {
      try {
        const m = await foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/themes/${t.dir}/theme.json`);
        meta.set(m.id, { ...m, dir: t.dir });
      } catch (err) {
        console.warn(`knuckles-game | could not load theme "${t.id}"`, err);
      }
    }
  } catch (err) {
    console.error("knuckles-game | failed to load the theme registry", err);
  }
}

/** Register an extra theme at runtime (third-party packs). */
export function registerTheme(themeMeta) {
  if (themeMeta?.id) meta.set(themeMeta.id, themeMeta);
}

export function listThemes() {
  return [...meta.values()].map((t) => ({ id: t.id, name: t.name }));
}

export function defaultThemeId() {
  return meta.has(registry?.default) ? registry.default : listThemes()[0]?.id ?? null;
}

export function themeLanguages(themeId) {
  return meta.get(themeId)?.languages ?? [];
}

export function baseLanguageCode(themeId) {
  const m = meta.get(themeId);
  if (!m) return null;
  const base = m.languages?.find((l) => l.name === m.baseLanguage);
  return base?.code ?? m.languages?.[0]?.code ?? null;
}

/** The active content theme (world-set by the GM), resolved against the default. */
export function activeTheme() {
  return game.settings.get(MODULE_ID, SETTINGS.CONTENT_THEME) || defaultThemeId();
}

/** This client's chosen language code, resolved against the theme's base language. */
export function activeLanguage() {
  return game.settings.get(MODULE_ID, SETTINGS.LANGUAGE) || baseLanguageCode(activeTheme()) || "";
}

async function loadLang(themeId, code) {
  const key = `${themeId}:${code}`;
  if (langCache.has(key)) return langCache.get(key);
  const m = meta.get(themeId);
  const lang = m?.languages?.find((l) => l.code === code);
  if (!m || !lang) { langCache.set(key, null); return null; }
  try {
    const data = await foundry.utils.fetchJsonWithTimeout(`modules/${MODULE_ID}/themes/${m.dir}/${lang.name}.json`);
    langCache.set(key, data);
    return data;
  } catch (err) {
    console.warn(`knuckles-game | could not load ${themeId}/${lang.name}`, err);
    langCache.set(key, null);
    return null;
  }
}

/** Preload a theme's chosen language + its base language, so lookups are sync. */
export async function preloadTheme(themeId, code) {
  if (!themeId) return;
  await loadLang(themeId, code);
  const base = baseLanguageCode(themeId);
  if (base && base !== code) await loadLang(themeId, base);
}

function cached(themeId, code, dieId, field) {
  return langCache.get(`${themeId}:${code}`)?.dice?.[dieId]?.[field];
}

/** Resolve a die's name: viewer language -> baseLanguage -> the id itself. */
export function dieName(themeId, code, dieId) {
  return cached(themeId, code, dieId, "name")
    ?? cached(themeId, baseLanguageCode(themeId), dieId, "name")
    ?? dieId;
}

/** Resolve a die's description with the same fallback chain. */
export function dieDesc(themeId, code, dieId) {
  return cached(themeId, code, dieId, "desc")
    ?? cached(themeId, baseLanguageCode(themeId), dieId, "desc")
    ?? "";
}
