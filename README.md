# Knuckles Game

A Farkle-style tavern dice game for Foundry VTT, with per-player multiplayer, 3D dice, loaded "trick" dice, per-table dice themes, and Pathfinder 2e Hero Point integration.

Roll six dice, set aside the scoring ones, and push your luck — bank your points or roll on and risk a bust. The first player to the target score triggers a final round; once the round is complete, the highest total wins.

## Features

- Per-player networked play, GM-authoritative and synced via socketlib.
- A catalog of **loaded dice** — each with its own face-probability weights — assigned per character before a game, including a "wild" joker die. (Standard, fair dice by default.)
- Optional **physical-dice economy** (off by default): the dice become real Pathfinder 2e items you buy, own, and carry, instead of virtual picks — see below.
- **Dice themes + language**: the GM sets a theme (e.g. Pathfinder 2e Golarion, or your own) and a language for the whole table; die names and descriptions follow it. Ships with two themes; third parties can register more.
- 3D dice throws via Dice So Nice (optional).
- Pathfinder 2e Hero Points: spend one to re-roll any dice from your last roll.
- Configurable target score, per-player wagers and a shared pot, plus board themes, dice styles, and colour overrides.

## The physical-dice economy (optional)

By default the game is purely virtual: you pick dice and play. Turn on **Physical dice (item economy)** in the module settings to make the dice real Pathfinder 2e `equipment` items instead:

- The bundled **Knuckles Dice** compendium holds all dice as priced items (5 cp … 850 gp); they buy and sell like any pf2e equipment.
- A character must **own six dice to play** — copy-based, so each of the six slots is one physical die. The picker shows what you own and how many copies, and greys out a die once all its copies are placed.
- The GM hands dice out; a token-NPC the GM assigns dice to is **auto-stocked** (the missing copies are written to that token's own inventory) when the game starts.
- Each die's name and description on the pf2e sheet are kept in the table's theme and language automatically.

The compendium and the **Knuckles Tools → Test Dice** macro are GM-facing.

## Requirements

- Foundry VTT v13+ (verified on v14).
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) — required.
- [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) — recommended, for the 3D dice animation.
- Pathfinder 2e system — required for Hero Points and the physical-dice economy; the core game runs on any system with virtual dice.

## Installation

Manifest URL:

```
https://github.com/Zeitcatcher/knuckles-game/releases/latest/download/module.json
```

For development, clone or symlink this folder into your Foundry `Data/modules/knuckles-game`.

## Usage

The GM opens the dice control on the token toolbar (or runs the **Knuckles Game** macro) to set up a game: add players — type a name to pick a world actor, or **Add selected tokens** to bind specific canvas tokens — optionally set wagers and the target score, and start. Each character then chooses their dice; the board opens for everyone, and each player acts on their own turn.

## Development

```
npm install
npm test          # pure-logic unit tests (Vitest)
npm run build     # generate the compendium source docs and compile the LevelDB packs
```

Game rules live in `src/core/` as framework-free, fully-tested modules. Foundry-specific code is isolated in `src/foundry/`, networking in `src/net/`, and the UI in `src/apps/` + `src/presentation/`. Dice mechanics live in `data/dice-catalog.json`, flavor in `themes/<id>/<lang>.json`, and the compendium item sources are generated into `src/packs/` — run `npm run build` after changing any of them (and before cutting a release, so the compiled `packs/` ship in the archive).

## License

MIT — see [LICENSE](LICENSE).
