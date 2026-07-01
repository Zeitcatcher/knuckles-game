# Changelog

All notable changes to **Knuckles Game** are recorded here, newest first. Each version is also published on the [Releases page](https://github.com/Zeitcatcher/knuckles-game/releases); to update inside Foundry, press **Update** on the module. Versioning is `MAJOR.MINOR.PATCH`.

## 0.5.13

- **The dice compendium now matches your theme/language.** The bundled **Knuckles Dice** compendium ships as a neutral English (Pathfinder) snapshot; it's now re-stamped to the table's theme + language on load and whenever you change theme/language, so the Compendium browser reads "Кость Шамаса", not "Abadar's Ledger", when you've chosen The Shards / Russian. (GM-only; the pack is unlocked just for the update and re-locked. A module reinstall resets it to English and the next load re-localizes it.)

## 0.5.12

- **Gifting dice to players is now one click.** In physical-dice mode, starting a game with a player who is short of dice no longer blocks or makes you re-pick: the dice currently shown in their slots (their defaults, or whatever the GM set) are **added to their inventory on start**, just like a token-NPC is stocked. The red "N of 6" tally and the "buy more dice to play" hint still show (so you know the character is short), and a per-slot marker now reads "will be added" instead of a blocking warning.

## 0.5.11

- **Two visual fixes.**
  - **Readable dice dropdowns.** The dice-picker dropdowns opened with a white background and light grey text (hard to read). They now use a solid themed background for both the closed control and the open option list, in every theme.
  - **Combinations panel no longer scrolls.** The board window is taller by default (and has a minimum height) so the full combinations reference panel always fits without an internal scroll, for every player and the GM. The panel's own layout is unchanged.

## 0.5.10

- **Dice-picker and combos-panel fixes.**
  - **Choosing a die now applies on the first click.** Picking a replacement die in the loadout window took two attempts — the window repainted the old value before the change was saved. It now re-renders from the saved state after the pick lands.
  - **Bigger combo dice.** The dice in the combinations reference panel are about 50% larger and easier to read; the panel is a little wider and the three-of-a-kind rows stack in one column to fit them.
  - **Collapsed panel tab fixed.** When the combinations panel is collapsed, its vertical label and arrow no longer overflow the tab.
  - **Theme/contrast and polish (from a UI review).** The setup and theme/language windows now follow the chosen board theme (they were stuck on the dark default); the pot's gold/silver/copper coins are now readable on the light Parchment theme; dropdowns in the picker are themed; the combinations panel is a touch wider so a full six-die straight fits one row; the new-game window is a little wider so a long character name isn't squeezed by the Save/Reset buttons; the GM control buttons are more compact so they fit one row in Russian; a winner card no longer loses its highlight; and accessibility was improved (the character search box is keyboard-usable, die-slot dropdowns and ownership markers are labelled).

## 0.5.9

- **Follow-ups from review.**
  - **Token-bound participants are now fully consistent.** For a player bound to an unlinked token, Hero Points and the coin pot payout now use that token's own actor — the same actor the dice inventory reads from — instead of the underlying world actor. Linked tokens are unaffected.
  - **The GM can gift extra copies of a die a player already owns.** Previously gifting only worked for dice a character owned none of; now any die the GM places (that isn't covered by an owned copy) is granted on start, including a second copy of something they already have one of.
  - **Tests:** added a command-handler test suite covering GM-authority (including the forged-id rejection), player-turn permission, shared-selection gating, and the physical-mode gift/launch flow.
  - **Polish:** spectators (and other non-active players) no longer get a stray "it's not your turn" notice if they click a die on the board; and a participant bound to a token with no separate world actor no longer misses its Hero-Point seed.

## 0.5.8

- **QA hardening across the 0.5.x batch.**
  - **Security:** GM-only actions (start/end game, start play, GM re-roll, GM value override, GM dice gifting) are now authorised only on the GM's own client. socketlib forwards the sender id verbatim, so it was forgeable — a player could craft a socket message claiming a GM's id. GM authority now requires a *local* dispatch, which only a GM's client makes, so impersonation is no longer possible.
  - **Selection no longer flashes stale:** committing a keep / bank / bust / re-roll within the brief sync window can no longer resurrect the previous dice highlight on the next roll.
  - **Picker markers match the start:** the per-slot ownership marker now uses the exact same greedy allocation the launch check uses, so a slot can never show a green "owned" check (or a red "no die") that disagrees with what actually happens when the game starts. A GM die change made mid-game no longer leaves a stray "gift" flag.
  - **Small fixes:** the Hero-Point re-roll now filters its die ids like the GM re-roll does; the combos toggle exposes `aria-expanded`; the wild row renders from the shared combos data; added render-gate and coverage unit tests.

## 0.5.7

- **Default loadouts and quicker setup.**
  - **Save a default dice set per character.** In the dice picker each character now has a **Save default** button: it pins their current six dice as a default loadout stored on the character (an actor flag, so it survives reloads and Foundry restarts). New games **auto-apply** that default (in both virtual and physical mode), and a **Reset** button restores it in one click. Picking different dice for one game never changes the saved default. Only the character's owner (or the GM) can save it.
  - **Launch with the right players already filled in.** When the GM opens a new game with tokens selected on the canvas, those tokens now **pre-fill the player rows** automatically (each bound to its token), instead of opening two empty rows. Nothing selected → the empty rows as before; to add more after the window is open, use **Add selected tokens**.
  - **Tidier bets.** The four-coin bet row (sun / gold / silver / copper) now renders on a single compact line instead of sprawling wide, mostly-empty fields.

## 0.5.6

- **Picker polish and GM gifting (physical-dice mode).**
  - **Owned dice come first, with a clearer count.** In the dice picker, the dice a character owns now float to the top of each dropdown, and the label shows **free / total** copies instead of a bare count — e.g. a die owned ×1 and already placed reads `0/1`, a spare reads `1/1`, six identical dice all placed read `0/6`. The redundant check-mark prefix is gone (the count and the slot marker already convey ownership).
  - **The GM can gift dice a player doesn't own.** When the GM picks a die a player doesn't have, it's marked as a gift and **added to that player's inventory when the game starts** (the same way a token-NPC is stocked). A player still can't equip a die they don't own. The owned tally and "buy more" hint stay visible to the GM, so the economy is still readable at a glance, and the per-slot marker now distinguishes a gift ("will be added") from a slot that can't be fielded.
  - **Start rule:** a player must have all six slots covered by dice they own **or** dice the GM gifted; otherwise the start is blocked with a notice. Nothing is auto-minted — only what the GM deliberately gifted is granted.

## 0.5.5

- **GM tools and a combos reference.**
  - **GM free re-roll.** A GM-only "GM re-roll" button now appears during a turn (on any player's turn): pick any of the current player's dice and re-roll them for free — the same mechanic as a Hero-Point re-roll, but no Hero Point is spent. The value-override pencils step aside while you're choosing dice to re-roll.
  - **Scoring-combinations panel.** A reference panel on the right of the board lists every scoring combination — singles, three-of-a-kind, the "each extra die doubles" rule, straights, and the wild — drawn with actual dice. It's open by default and collapses to a slim tab with one click (your choice is remembered per user). The board window widens to fit it and shrinks back when you collapse it.

## 0.5.4

- **Concurrency & live visibility.** Two fixes built on one shared non-destructive render gate.
  - **The dice picker no longer jumps when someone else picks.** While everyone is choosing their dice, another player changing a slot used to scroll your list back to the top and close any dropdown you had open. Now a sync that doesn't affect your own characters is skipped entirely, and when the window does refresh it preserves your scroll position and keeps an open dropdown open (the re-render waits until you commit or click away). The GM, who sees everyone, keeps watching picks come in live without losing their place.
  - **Everyone sees the selected dice and the running total.** When the active player (or the GM) clicks dice to keep, the gold highlight and the "Selected: N" sum are now visible to every player and spectator at the table — attributed as "Selected by NAME" to onlookers — instead of only the person whose turn it is. The selection is part of the synced game state (cleared on every roll, keep, re-roll, and turn change), so a spectator who opens the board mid-turn sees the current pick too.

## 0.5.3

- Physical dice, part 4. A real dice **icon** (one shared `.webp` for all dice for now; drop `assets/dice/<id>.webp` later for per-die art and it's picked up automatically). **Localization is simplified**: the dice **theme and language are now both GM-set world settings** that apply to the whole table — the per-player language picker is gone. And the dice items' **shop-sheet name/description are kept in the table's theme + language automatically**: a die is named correctly the moment it's granted or bought, and changing the theme or language re-stamps every die in the world. No manual rebuild step. (The board/picker already localized live; this brings the pf2e inventory/shop sheet in line.)

## 0.5.2

- Physical dice, part 3 — the write side, with **copy-based** ownership (still off by default). Each of the six slots now consumes one physical die, so **you need six dice to play**; the picker shows how many copies of each die you own (`×N`), greys a die out once all its copies are placed, and shows an "N of 6" tally with a "buy more dice" prompt when you're short. When a game starts: a token-NPC is **auto-granted the missing copies** of whatever the GM picked (written to that token's own inventory), a PC short of six dice **blocks the start** with a notice, and a PC whose dice changed mid-choosing is re-seated onto a legal hand. New games **pre-fill** each player's slots from the dice they own. New-game setup gains an **Add selected tokens** button that turns the tokens you've selected on the canvas into participants bound to that specific token (shown by a `token` badge) — so unlinked NPCs get their dice in the right inventory. A GM-side guard prevents a double-click on Start from double-granting. Generic/token-less players and the virtual game are unchanged.

## 0.5.1

- Physical dice, part 2 — the owned-dice picker (read-only; still off by default). When **Physical dice** is on, a player choosing dice now sees only the dice their character actually owns, and the GM sees the full catalog with a green check on the dice each character owns plus a per-slot in-inventory marker. A character that owns nothing shows a "buy dice to play" hint. Because the picker keeps native dropdowns, a slot is the same height whether a character owns 0 or 37 dice — no layout shift — and the markers refresh live if dice are added or removed while the window is open. No inventory is written yet (NPC auto-stocking and launch validation come next). Off-pf2e systems and the default virtual mode are unchanged.

## 0.5.0

- Physical dice, part 1 — the foundation for an **optional** item-based dice economy. It is **off by default**, so the existing virtual game is unchanged. Adds a **Knuckles Dice** compendium of all 37 dice as real Pathfinder 2e `equipment` items — each with a price, a `knuckles-game.dieId` flag, and a stable `knuckles-die-NN` slug — priced from 5 cp (junk/trap dice) up to 850 gp (the strongest loaded die). Adds the **Physical dice (item economy)** world setting (default off) that will switch the game between virtual dice and inventory-owned dice in upcoming updates. Adds a **Knuckles Tools** compendium with a *Test Dice* GM macro for inspecting and granting dice. The dice catalog gains an agnostic copper `price` per die (schemaVersion 2). New build scripts compile the committed source documents into the packs (`npm run build`).

## 0.4.0

- Dice themes and per-player language. Mechanics are now separated from flavor: a shared catalog (`data/dice-catalog.json`) holds the weights/joker, while each theme supplies die names + descriptions per language. In Foundry's settings ("Theme & language"), the GM picks the shared theme; every user (GM and players) picks their own language from that theme's languages — so each player sees the dice in their own language. Ships with two themes: Pathfinder 2e (public default — en/fr/de/es/uk) and The Shards (ru/uk). Only names and descriptions change; the board's look is unchanged. Third-party themes can register at runtime via `KnucklesGame.registerTheme(...)`.

## 0.3.3

- Loaded-die labels: a die's name now wraps to a maximum of two lines, centered horizontally and vertically in a fixed-height field, instead of being truncated to one line. The dice are about 20% larger, and every slot is a fixed width so the spacing between dice is uniform.

## 0.3.2

- The GM die-edit pencils no longer pop in after the roll: for the GM a grayed, disabled pencil sits under every die from the start of the turn and lights up once the dice are rolled, so the dice tray height stays fixed.

## 0.3.1

- The controls no longer jump at the roll: the "Selected: N" caption and the Roll / Keep + roll on / Keep + bank buttons (plus Use Hero Points for characters with Hero Points) are shown from the start of the turn, grayed and disabled until usable — rolling and selecting only toggle their state. Blank, unrolled dice are no longer clickable.

## 0.3.0

- New-game setup: the character field is now a search box. Type a letter or part of a name to filter the world's actors live, then click to pick; a name that matches nothing still creates a token-less player. Replaces the long scrolling dropdown.

## 0.2.9

- Selecting dice no longer shifts the board: during the selecting phase the "Selected: N" caption (0 when nothing is kept) and the Keep + roll on / Keep + bank buttons are always shown, with the buttons grayed and disabled until the selection scores.

## 0.2.8

- The active player is now shown by the card highlight alone; the "your turn" label next to the name was removed.

## 0.2.7

- Fix: the active player's highlight is no longer clipped by the scoreboard's horizontal scroll — it is drawn inside the card now. When the turn passes to a player who is scrolled out of view, the scoreboard auto-scrolls to bring the active card into view.

## 0.2.6

- Larger tables: the dice picker's character list scrolls vertically when there are more characters than fit (the hint and the Start / End buttons stay pinned), and the board scoreboard scrolls horizontally when there are more players than fit (the Target box stays pinned). Scrollbars appear only when needed, so the window no longer runs off-screen or wraps players into extra rows.

## 0.2.5

- Board: the action log moved below all the buttons and is now a full-game "History" panel that scrolls inside the fixed window instead of resizing it. Previously it sat above the GM buttons and showed only the last three turns.

## 0.2.4

- Fix: the GM die-value picker no longer clips at the window's left edge. When the popover would overflow the board (e.g. under the leftmost die), it is nudged inward to stay fully visible while its arrow keeps pointing at the die being edited.

## 0.2.3

- The board window now opens at a fixed, comfortable size (580 × 600) instead of auto-sizing, so it no longer grows and shrinks as you roll, keep, bank, or open the GM die-value picker. Shorter states show clean dark padding; an unusually large game scrolls inside the window. The window stays manually resizable.

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
