# Knuckles — Test Dice (GM dev tool)

A small reusable tool for testing the **physical-dice (item) mode**: it grants a die
from the **Knuckles Dice** compendium onto the selected token and reports the knuckles
dice already in that token's inventory.

## Two ways to use it

- **In Foundry (recommended):** open **Compendiums → Knuckles Tools**, drag
  **"Knuckles — Test Dice"** to your hotbar, select a token, and run it. To grant a
  specific die, edit the macro and set `CREATE = "07"` (any id `01`–`37`); leave it
  `""` to only scan.
- **By hand:** paste [`testdice-macro.js`](testdice-macro.js) into a new **Script** macro.

The macro source here ([`testdice-macro.js`](testdice-macro.js)) is the single source of
truth — the compendium macro is built from it (`npm run build:packs`).

## What it checks

- The die creates cleanly as a pf2e `equipment` item with the right price/flag/slug.
- Identity (`flags.knuckles-game.dieId` + the `knuckles-die-NN` slug) is detected on the actor.
- It survives buying/selling/transfer (verified in Phase 0 — both flag and slug persist).

This folder is **dev tooling**, not part of the played game. The reusable tool is shipped
inside the module's *Knuckles Tools* compendium so it's available for future tests.
