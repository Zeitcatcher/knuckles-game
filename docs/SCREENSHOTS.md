# Screenshot shot-list

The README references ten images from `docs/images/`. Capture each one, name it **exactly** as below, and drop it in that folder — the README will render it automatically (no code changes needed). Until an image exists, GitHub shows a small "broken image" placeholder in its place, so you can add them a few at a time.

**General tips**
- Capture in a real game with **2–3 players** so the board looks alive.
- Pick your best-looking theme + board skin first (Settings) — the same look across all shots reads as polished.
- Crop tight to the window; trim the empty desktop/canvas around it. Wide shots can be ~1200–1600 px wide; PNG keeps text crisp.
- For the hero shot, landscape looks best; the rest can be whatever frames the window.
- If you want dark UI, set your Foundry/board theme before shooting so every image matches.

| File | Used in README | What to capture | Make sure it shows |
|---|---|---|---|
| `01-board-hero.png` | Top banner (hero) | The **full board mid-game**, Combinations panel open, a turn in progress with a couple of dice set aside. This is the first thing people see — make it the best-looking frame. | Dice on the table, at least one player's running score, the combos panel, a nice theme |
| `02-scene-control.png` | Step 1 | Close-up of the **token toolbar** with the Knuckles dice control highlighted (hover so the tooltip shows, if you can). | The toolbar button you click to launch |
| `03-setup-window.png` | Step 2 | The **Setup window** with 2–3 players added, a wager or two filled in, and the target score visible. | The roster, the "Add selected tokens" button, wager fields on one line, the Start button |
| `04-dice-picker.png` | Step 3 | The **Dice Picker** for one character, a few slots filled, owned dice at the top. Open the Combinations reference if it fits. | The six slots, a dropdown open (optional), the "Save as default" button |
| `05-board-turn.png` | Step 4 | The **board on your turn**, right after a roll, with 2–3 scoring dice **selected/highlighted** and the running turn total showing. | Highlighted dice, the turn total, Bank / Roll-again buttons |
| `06-combos-panel.png` | Step 5 | The **Combinations panel** on the right, expanded, showing combos rendered as dice. A second shot collapsed is nice but optional. | The scoring combos drawn as dice, the collapse arrow |
| `07-gm-tools.png` | Step 6 | The board **as the GM**, showing the free re-roll control (and, if easy, the Hero Point re-roll button or a value-override pencil). | The GM's extra controls that players don't have |
| `08-settings.png` | Themes | The module's **Settings** with the **Dice theme** and **Language** dropdowns visible (open one if you like). | The theme + language settings |
| `09-compendium.png` | Physical economy | The **Knuckles Dice compendium** open, showing several dice as priced items. *(Physical mode on.)* | A list of dice items with prices |
| `10-dice-on-sheet.png` | Physical economy | A **pf2e character sheet** inventory with a few Knuckles dice items in it. | Dice as owned equipment, names in your theme/language |

## Optional extras

If you want more images later, drop them in `docs/images/` and add an `![caption](docs/images/NN-name.png)` line where you want them:

- A **bust** moment (the "you rolled nothing" state).
- The **final round / winner** screen.
- A **wager pot** close-up (the four coin denominations on one line).
- The same board in a **second theme** to show off theming.

## How to add a screenshot to the README

Anywhere in `README.md`, use:

```markdown
![Short description of the image](docs/images/your-file.png)
```

The text in `[...]` is the alt text (shown if the image fails to load and read by screen readers) — keep it descriptive.
