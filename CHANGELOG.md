# Changelog

## 0.2.2

- GM die-value override: a pencil button under each rolled die (GM only) opens a chooser to replace that die's face with any value 1–6 or a wild. The roll is re-scored instantly (a bust can flip to a score, or back), the change syncs to everyone as the physical die, and nothing is written to the turn log. Works on the in-play dice during the selecting/bust phase; change as many as you like.

## 0.2.1

- GM **End game** button: ends the current game with no winner and no payout, then clears the table so the next launch opens New Game setup. Available on the board (during play or after a result) and in the dice picker (during setup); asks for confirmation first. When the game ends, the board and picker close for everyone.

## 0.2.0 — loaded dice

- Loaded dice: a catalog of named dice, each with its own face-probability weights, contained entirely within the module (no effect on any other rolls in the world).
- Per-character dice: each character has six die slots; each slot can be any die, up to all six non-standard.
- Pre-game picker: a "choosing" phase after the game is created — players pick dice for the characters they control, the GM for NPCs; the GM starts play.
- During play, only the GM can change dice (from a board button); players' choices are locked once play begins.
- The "Nameless" joker die: its 1-face is a wild that completes any combination but never scores on its own (scoring-engine support, with tests).
- Per-viewer visibility: non-standard dice are labelled with their name only for the controlling player and the GM. Everyone sees the rolled faces, including wild faces, but other players' die names stay hidden.

## 0.1.9

- Weighting plumbing (no behaviour change yet): the dice roller can take per-die weight vectors and override only loaded dice; fair dice keep Foundry's native uniform result, and nothing global is touched, so all other rolls are unaffected.
- Added a console helper `KnucklesGame.testWeightedRoll(weights, n, animate)` to verify weighting + 3D display, plus unit tests for the weighting math.

## 0.1.8

- Fix: bets entered in setup were dropped before reaching the game state, so the pot never showed on the board and the winner received no payout. Bets now flow through to the pot display and the pf2e coin payout.

## 0.1.7

- Wagers: the GM can set a bet per player (sun coins, gold, silver, copper) in setup; the board shows the combined pot.
- On a win, the pot is awarded to the winner's linked actor (sun→platinum, gold, silver, copper); if the winner has no linked actor, nothing is paid out.
- Removed the "Last turns" caption from the history.

## 0.1.6

- A previous game is no longer resumed or saved across sessions: leftover state is cleared on world load, so the launch icon opens a fresh New Game setup.
- The setup window no longer remembers the previous player selection — it opens with empty rows each time.

## 0.1.5

- Starting a game now opens the board for ALL connected players, so everyone sees the table (it still never opens on world load).
- Actions (roll, keep, bank, Hero Points) are restricted to the owner of the character whose turn it is; the GM can act for anyone.

## 0.1.4

- The board no longer opens automatically on world load (or when other players act); it stays hidden until you click the dice icon or run the macro.
- The launch icon is state-aware: it opens the board when a game is in progress, otherwise the GM gets the setup window. Starting a game opens the board for the GM.

## 0.1.3

- Kept (set-aside) dice now have a distinct fill colour, separate from the current selection.
- After a Hero-Point re-roll, the board returns to normal (re-roll mode and its highlight clear); re-openable while points remain.
- The active player's Hero Points re-sync from their character at the start of each turn (picks up points awarded mid-game).
- Added a turn-history panel showing the last three moves (localized per client).

## 0.1.2

- Player names are no longer hard-coded: rows start empty, selecting a character auto-fills the name, and the board uses the linked character's name (and Hero Points / type) authoritatively.

## 0.1.1

- Setup: replaced the type dropdown with a clear Character picker (lists world actors); the participant type and Hero Points are derived from the linked actor.
- Setup: fixed the player-row layout — the name field is no longer collapsed and rows no longer overflow the window.
- Board: "Keep + roll on" now rolls the remaining dice automatically (no separate Roll button afterwards).
- Board: Hero Point pips show for player characters and any participant granted game-local Hero Points.

## 0.1.0 — initial

- Core game engine (scoring, turn flow, complete-the-round win logic, sudden-death tie-break) with unit tests.
- Setup and board windows (ApplicationV2).
- Per-player networked play, GM-authoritative, synced via socketlib.
- Numbered dice with set-aside / re-roll selection.
- Dice So Nice integration for 3D throws (optional).
- Pathfinder 2e Hero Point re-rolls.
- Themes, dice styles, and colour-override settings.
