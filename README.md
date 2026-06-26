# Knuckles Game

A Farkle-style tavern dice game for Foundry VTT, with per-player multiplayer, 3D dice, and Pathfinder 2e Hero Point integration.

Roll six dice, set aside the scoring ones, and push your luck — bank your points or roll on and risk a bust. The first player to the target score triggers a final round; once the round is complete, the highest total wins.

## Features

- Per-player networked play, GM-authoritative and synced via socketlib.
- Numbered dice (#1–#6) with set-aside / re-roll selection.
- 3D dice throws via Dice So Nice (optional).
- Pathfinder 2e Hero Points: spend one to re-roll any dice from your last roll.
- Configurable target score, plus board themes, dice styles, and colour overrides.

## Requirements

- Foundry VTT v13+ (verified on v14).
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) — required.
- [Dice So Nice](https://gitlab.com/riccisi/foundryvtt-dice-so-nice) — recommended, for the 3D dice animation.
- Pathfinder 2e system — optional, enables Hero Point integration.

## Installation

Manifest URL:

```
https://github.com/Zeitcatcher/knuckles-game/releases/latest/download/module.json
```

For development, clone or symlink this folder into your Foundry `Data/modules/knuckles-game`.

## Usage

The GM opens the dice control on the token toolbar (or runs the **Knuckles Game** macro) to set up a game: add players, optionally link each to a character to enable Hero Points, set the target score, and start. The board opens for everyone, and each player acts on their own turn.

## Rules

See [RULES.md](RULES.md).

## Development

```
npm install
npm test       # pure-logic unit tests (Vitest)
```

All game rules live in `src/core/` as framework-free, fully-tested modules. Foundry-specific code is isolated in `src/foundry/`, networking in `src/net/`, and the UI in `src/apps/` + `src/presentation/`.

## License

MIT — see [LICENSE](LICENSE).
