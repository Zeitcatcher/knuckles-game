import { TEMPLATES, MODULE_ID, SETTINGS } from "../constants.mjs";
import { listThemes, themeLanguages, activeTheme, activeLanguage } from "../foundry/themes.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Settings submenu: the GM picks the shared theme + their own language; players
 * pick only their language. The language list is populated from the chosen theme.
 */
export class ThemeLanguageConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-themelang`,
    tag: "form",
    classes: ["knuckles-game"],
    window: { title: "KNUCKLES.themeLang.menuName", icon: "fa-solid fa-language" },
    position: { width: 460, height: "auto" },
    form: { handler: ThemeLanguageConfig._onSubmit, closeOnSubmit: true },
  };

  static PARTS = { config: { template: TEMPLATES.THEME_LANG } };

  async _prepareContext() {
    const theme = activeTheme();
    return {
      isGM: Boolean(game.user.isGM),
      themes: listThemes(),
      currentTheme: theme,
      langs: themeLanguages(theme),
      currentLang: activeLanguage(),
    };
  }

  /** Repopulate the language dropdown when the GM changes the theme. */
  _onRender() {
    const themeSel = this.element.querySelector("select[name='theme']");
    const langSel = this.element.querySelector("select[name='language']");
    if (!themeSel || !langSel) return;
    themeSel.addEventListener("change", (ev) => {
      langSel.innerHTML = themeLanguages(ev.target.value)
        .map((l) => `<option value="${l.code}">${foundry.utils.escapeHTML(l.name)}</option>`)
        .join("");
    });
  }

  static async _onSubmit(event, form, formData) {
    const data = formData.object;
    if (game.user.isGM && data.theme) {
      await game.settings.set(MODULE_ID, SETTINGS.CONTENT_THEME, data.theme);
    }
    if (data.language) {
      await game.settings.set(MODULE_ID, SETTINGS.LANGUAGE, data.language);
    }
  }
}
