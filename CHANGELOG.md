# Changelog

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
