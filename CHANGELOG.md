# Changelog

Notable changes, newest first. Each version is also on the [Releases page](https://github.com/Zeitcatcher/knuckles-game/releases); to update inside Foundry, press Update on the module.

## 1.0.1

- Fixed the End Game confirmation after a finished game: it claimed the pot would not be paid out, even though the winner had already received it. A finished game now asks a plain "clear the table?" question instead.
- The running-game warning now says what actually happens since wagers became real: nobody wins and collected stakes go back to their owners.
- New Game now asks for confirmation before replacing an unfinished game (same warning); replacing a finished one opens setup straight away.

## 1.0.0

First public release. A Farkle-style tavern dice game for Foundry VTT.

Gameplay

- Live per-player multiplayer over socketlib, with spectators.
- 37 loaded dice with hidden face weights and a wild joker.
- Optional 3D dice via Dice So Nice.
- Per-table dice themes and languages; English and Russian interface.
- A combinations reference panel.
- Per-character default loadouts.
- Mouse or keyboard play.

GM tools

- A free re-roll, a die-value override, and dice gifting.
- A resume-or-discard prompt if the game is reloaded mid-session.

Pathfinder 2e (used when installed, off on other systems)

- Hero Point re-rolls.
- Coin wagers with a shared pot: stakes are collected at the start and refunded if the game ends with no winner. A short player's gap can be minted or borrowed from the party.
- A physical-dice economy where the dice are real, buyable pf2e items.

Verified on Pathfinder 2e (Foundry v13+, tested on v14). The core game is system-agnostic; other systems aren't tested yet.
