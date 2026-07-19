# Changelog

Notable changes, newest first. Each version is also on the [Releases page](https://github.com/Zeitcatcher/knuckles-game/releases); to update inside Foundry, press Update on the module.

## 1.1.0

- Added a quick-hand generator for the GM. Every row in the dice picker now carries a GM-only strip: pick how many loaded dice to deal (0 to 6), a price class, random picks or a matched set, then press Deal. Each participant keeps its own settings, so a tavern regular can hold two cheap tricks while the sharper at the next table runs six elite dice.
- Price classes are a hard ceiling on every generated die, so a commoner can never be dealt the 850 gp die by accident. Cheap stops at 5 gp, Solid at 30 gp, Expensive at 100 gp, and Elite opens the whole catalog including the joker.
- A matched set picks dice that pull toward the same scoring face instead of a random grab bag, and the joker always joins a full elite set.
- The toolbar at the top deals to every NPC and generic row at once. Player characters are dealt only from their own row, so a hand a player picked is never overwritten by a mass deal.
- Slots stay editable after a deal, and in physical-dice mode generated dice are stocked on start exactly as any other GM placement.

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
