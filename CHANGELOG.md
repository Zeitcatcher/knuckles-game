# Changelog

Notable changes, newest first. Each version is also on the [Releases page](https://github.com/Zeitcatcher/knuckles-game/releases); to update inside Foundry, press Update on the module.

## 1.2.0

- Dice can now be made at the table. A GM window takes a name, an icon, a description and a price, plus the chance of each face, and the die joins the catalog for everyone: it can be picked in any slot and rolls with its own odds. Table-made dice sit right under the honest die in every dropdown, marked with a star.
- The six face chances share one pool of 100%. A typed face locks in, the faces left blank split what is left and show the share they would take, and no entry can push the total past 100. The create button stays greyed until the die adds up.
- The price decides which quick-hand class the die falls into, so a die made cheap can be dealt to a tavern regular and an expensive one cannot.
- On Pathfinder 2e a new die also becomes an Item in the world directory, priced and flagged like a shipped one, so it can be dragged onto a sheet or bought, and the physical-dice economy counts it like any other. Editing a die updates every copy already in an inventory. Deleting one removes those copies too, and is refused while someone is holding the die in a running game.
- The builder opens from the dice control on the left toolbar, or from the Custom dice button in the setup and dice-picker footers.

## 1.1.1

- Rewrote every die name and description in The Shards theme, in Russian and Ukrainian. Six dice named after characters (Изудин, Вестник, Харгрим, Хальдрим, Хальмун, Ниневеш) were renamed after what they do or where they were made; gods, orders and cities keep their names.
- Descriptions no longer state the odds outright. Each die hints at its bias through its own imagery and origin: a miner's die sends up a full cart, a pearl-fishery die shines with different catches, a port die treats evens as bad luck. The hints stay accurate to the real weights, so a player who listens closely gains a real edge.
- Dice already sitting in inventories are re-stamped when the world loads, so updated theme text reaches character sheets without switching theme or language.

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
