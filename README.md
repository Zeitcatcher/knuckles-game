# Knuckles Game

A Farkle-style tavern dice game for **Foundry VTT** — per-player multiplayer, 3D dice, loaded "trick" dice, per-table themes and languages, and Pathfinder 2e Hero Point integration.

[![Latest release](https://img.shields.io/github/v/release/Zeitcatcher/knuckles-game?display_name=tag&label=release)](https://github.com/Zeitcatcher/knuckles-game/releases/latest)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13%2B%20(v14%20verified)-orange)](https://foundryvtt.com/)
[![System](https://img.shields.io/badge/system-Pathfinder%202e-red)](https://github.com/foundryvtt/pf2e)
[![Downloads](https://img.shields.io/github/downloads/Zeitcatcher/knuckles-game/total)](https://github.com/Zeitcatcher/knuckles-game/releases)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-lightgrey)](LICENSE)

> Roll six dice, set aside the scoring ones, and push your luck — bank your points or roll on and risk a bust.

![The Knuckles Game board mid-game](docs/images/01-board-hero.png)
<!-- SHOT 01 — see docs/SCREENSHOTS.md -->

---

## What it is

Knuckles is the dice game the tavern regulars play in the back room. It's a **press-your-luck** game: on your turn you roll six dice, keep the ones that score, and then decide — **bank** the points you've built up, or **roll the rest again** and risk rolling *nothing* (a "bust"), which wipes the turn. The first player to reach the target score triggers one final round for everyone else; when that round finishes, the highest total wins.

The twist is the **dice themselves**. Beyond the honest, fair set, there's a whole catalog of **loaded dice** — each with its own hidden face-probability weights — that a character can bring to the table, from a die that almost always rolls a 1 to a subtle "sharper's" die that just nudges the odds. There's even a **wild joker** die. Whether that's a fun gimmick or an in-world act of cheating is up to your table.

Everything is **networked and live**: every player sees the same board update in real time, acts on their own turn from their own screen, and spectators can follow along.

---

## Features

- **Per-player networked play** — GM-authoritative, synced live to every client via [socketlib](https://github.com/manuelVo/foundryvtt-socketlib). Each player rolls on their own turn from their own screen; everyone (and spectators) sees the shared board.
- **A catalog of loaded dice** — 37 dice, each with its own face-probability weights, assigned per character before a game, including a **wild joker** die. Standard fair dice by default.
- **3D dice throws** via [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) (optional).
- **Dice themes + language** — the GM sets one theme and language for the whole table; every die name and description follows it. Ships with **two themes** (a Pathfinder/Golarion set and an original one) across several languages; third parties can register more.
- **Combinations reference panel** — a collapsible side panel that shows every scoring combination *as dice*, so players never have to memorise the scoring.
- **Pathfinder 2e Hero Points** — spend a Hero Point to re-roll any dice from your last throw.
- **GM tools** — a free re-roll (re-roll a player's dice without spending anything), value overrides, and the ability to gift dice to players.
- **Saved default loadouts** — each character can save a default set of six dice that's restored automatically next game, across sessions and restarts.
- **Wagers & a shared pot** — optional per-player bets in four coin denominations on a single compact line, plus a configurable target score.
- **Optional physical-dice economy** — turn the dice into real, buyable Pathfinder 2e items you own and carry (see below).

---

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this **manifest URL**:

```
https://github.com/Zeitcatcher/knuckles-game/releases/latest/download/module.json
```

Then enable **Knuckles Game** in your world.

**Dependencies**

| Module | Required? | For |
|---|---|---|
| [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) | **Required** | Live multiplayer sync |
| [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) | Recommended | The 3D dice animation |
| [Pathfinder 2e system](https://github.com/foundryvtt/pf2e) | Optional* | Hero Points + the physical-dice economy |

\* The core game runs on **any** system with virtual dice. Hero Points and the physical-dice item economy are Pathfinder 2e features.

**Compatibility:** Foundry VTT **v13+** (verified on v14.364), Pathfinder 2e **v8.2.0**.

---

## How to play (step by step)

### 1. The GM opens the game

The GM clicks the **Knuckles dice control** on the token toolbar (or runs the bundled **Knuckles Game** macro).

![The Knuckles control on the token toolbar](docs/images/02-scene-control.png)
<!-- SHOT 02 -->

### 2. Set up the table

In the **Setup** window the GM builds the roster:

- **Type a name** to bind a world actor, or select tokens on the canvas and click **Add selected tokens** to bind those specific tokens.
- Optionally set each player's **wager** and the **target score** (default **2000**).
- Click **Start**.

![The Setup window with a roster, wagers and target score](docs/images/03-setup-window.png)
<!-- SHOT 03 -->

### 3. Each player picks their dice

Every character chooses six dice in the **Dice Picker**. Owned dice float to the top, each die shows its name, and the **Combinations** reference is one click away. A player can hit **Save as default** so this exact loadout comes back automatically next time.

![The Dice Picker with six slots and the combinations reference](docs/images/04-dice-picker.png)
<!-- SHOT 04 -->

### 4. Play your turn on the board

The board opens for everyone. On your turn:

1. **Roll** your six dice.
2. **Click the scoring dice** to set them aside — they highlight, and your running turn total updates. Everyone at the table sees your selection.
3. Either **Bank** (add the turn total to your score and pass) or **Roll again** with the remaining dice to push your luck.
4. Roll dice that score **nothing** and you **bust** — the turn's points are lost.

![The board on a player's turn, with scoring dice selected](docs/images/05-board-turn.png)
<!-- SHOT 05 -->

### 5. Use the Combinations panel

The collapsible **Combinations** panel on the right lists every scoring combination as actual dice — singles, three-of-a-kind and up, and the straights — so nobody has to memorise the maths. It's open by default; collapse it to narrow the window.

![The Combinations reference panel](docs/images/06-combos-panel.png)
<!-- SHOT 06 -->

### 6. Spend Hero Points, and GM tools

On a Pathfinder 2e world, a player can **spend a Hero Point to re-roll** any dice from their last throw. The GM has a **free re-roll** (no cost), can **override die values**, and can **gift dice** to players.

![Hero Point re-roll and the GM tools on the board](docs/images/07-gm-tools.png)
<!-- SHOT 07 -->

### Scoring at a glance

| Combination | Points |
|---|---|
| Single **1** | 100 |
| Single **5** | 50 |
| Three of a kind — **1** / 2 / 3 / 4 / 5 / 6 | 1000 / 200 / 300 / 400 / 500 / 600 |
| Each die past the third (4-, 5-, 6-of-a-kind) | doubles the triple |
| Straight **1-2-3-4-5** | 500 |
| Straight **2-3-4-5-6** | 750 |
| Full straight **1-2-3-4-5-6** | 1500 |

The wild joker die completes any combination but never scores on its own. The in-game **Combinations** panel always shows the current table's exact list.

---

## Themes and languages

The GM sets **one theme and one language** for the whole table in the module settings, and every die name and description follows it — on the board, in the picker, and (in physical mode) on the character sheet.

![The theme and language settings](docs/images/08-settings.png)
<!-- SHOT 08 -->

The module ships with two themes across several languages, and other modules can **register their own theme** without touching this one. See the [documentation](#documentation--development) for the theme format.

---

## The physical-dice economy (optional)

Off by default. Turn on **Physical dice (item economy)** in the settings to make the dice **real Pathfinder 2e `equipment` items** instead of virtual picks:

- The bundled **Knuckles Dice** compendium holds every die as a priced item (from 5 cp to 850 gp); they buy and sell like any pf2e equipment.
- A character must **own six dice to play** — ownership is copy-based, so each of the six slots is one physical die. The picker shows what you own and how many copies.
- **The GM hands out dice.** Starting a game auto-stocks any under-equipped player with the dice in their slots — no re-picking — the same way a GM-assigned NPC is stocked.
- Each die's **name and description on the pf2e sheet** stay in the table's theme and language automatically, and the bundled compendium itself is localised to match.

![The Knuckles Dice compendium of buyable items](docs/images/09-compendium.png)
<!-- SHOT 09 -->

![Dice as items on a Pathfinder 2e character sheet](docs/images/10-dice-on-sheet.png)
<!-- SHOT 10 -->

The compendium and the **Knuckles Tools → Test Dice** macro are GM-facing.

---

## Settings

| Setting | Scope | Default | What it does |
|---|---|---|---|
| **Dice theme** | World (GM) | Pathfinder | The name/flavor set for the whole table |
| **Language** | World (GM) | English | The language die names and descriptions resolve to |
| **Physical dice (item economy)** | World (GM) | Off | Dice become owned pf2e items instead of virtual picks |
| **Combinations panel open** | Client | On | Show the scoring reference panel by default |
| Board theme / dice style / colour overrides | Client | — | Cosmetic appearance of the board |

---

## Updates

Every release is listed on the **[Releases page](https://github.com/Zeitcatcher/knuckles-game/releases)** with notes, and the full history is in **[CHANGELOG.md](CHANGELOG.md)**. To update inside Foundry, just press **Update** on the module — the manifest URL above always points at the latest release.

---

## Localization

The interface is fully localised (English and Russian ship in the box), and the dice flavor is localised per theme. Contributions of new UI languages or theme translations are welcome — see the [documentation](#documentation--development).

---

## Documentation & development

Game rules live in `src/core/` as framework-free, fully-tested modules; Foundry glue is in `src/foundry/`, networking in `src/net/`, and the UI in `src/apps/` + `src/presentation/`. Dice mechanics live in `data/dice-catalog.json`, flavor in `themes/<id>/<lang>.json`, and the compendium item sources are generated into `src/packs/`.

```bash
npm install
npm test        # pure-logic unit tests (Vitest)
npm run build   # regenerate the compendium sources and compile the LevelDB packs
```

Run `npm run build` after changing dice data, a theme, the icon, or the compendium macro — and before cutting a release, so the compiled `packs/` ship in the archive.

---

## Credits & attribution

- **Author:** Zeitcatcher.
- Built for **[Foundry Virtual Tabletop](https://foundryvtt.com/)**. Requires **[socketlib](https://github.com/manuelVo/foundryvtt-socketlib)**; the 3D dice use **[Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice)**.
- The **Pathfinder** dice theme references deities and flavor from Paizo's *Pathfinder* setting, used under Paizo's Community Use Policy (see the License section).
- *Pathfinder* and the *Pathfinder* deity names are trademarks of **Paizo Inc.** This product is not published, endorsed, or specifically approved by Paizo. For more information about Paizo Inc. and Paizo products, visit [paizo.com](https://paizo.com/).

---

## License

**Code:** [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, modify, and share Knuckles Game **free of charge for any noncommercial purpose**. Selling it, or any commercial use, requires a separate commercial license from the author — [get in touch](https://github.com/Zeitcatcher/knuckles-game) to discuss one.

**Bundled flavor:** the **Pathfinder** dice theme uses Paizo Product Identity (deity names and setting flavor) under Paizo's [Community Use Policy](https://paizo.com/community/communityuse) and must always remain free and noncommercial; it is not part of any commercial license. See [Credits & attribution](#credits--attribution).
