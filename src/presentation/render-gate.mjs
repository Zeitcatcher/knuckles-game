/**
 * Non-destructive render gate shared by the board and the dice picker.
 *
 * A synced state change re-renders an ApplicationV2 by swapping its part's
 * innerHTML, which would close an open native <select>, drop scroll position, and
 * flicker the window. This gate makes a foreign sync survivable:
 *  - it COALESCES a burst of state changes into a single re-render (one _kgPending
 *    flag + one scheduled frame), and
 *  - it DEFERS the re-render while the local user is mid-pick in a <select> (the
 *    app sets `app._kgSelectBusy` on the select's focus and clears it on
 *    change/blur, then re-schedules), and
 *  - it SNAPSHOTS scroll + focus before the DOM swap (call `snapshotRender` in
 *    `_preRender`) and RESTORES them after (call `restoreRender` in `_onRender`).
 *
 * No game rules here — pure DOM + scheduling. The lock state lives on the app
 * instance so the board (which has no selects) simply never locks.
 */

const onFrame = (fn) => (globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 16)))(fn);

/** True while the local user is interacting with a <select> inside this app. */
function locked(app) {
  return Boolean(app?._kgSelectBusy);
}

/**
 * Capture scroll positions for `selectors` and the focused slot-select. Call from
 * `_preRender`, while the OLD DOM (and its scroll/focus) is still mounted.
 */
export function snapshotRender(app, selectors = []) {
  const root = app?.element;
  const scroll = {};
  let focus = null;
  if (root) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) scroll[sel] = el.scrollTop;
    }
    const active = root.ownerDocument?.activeElement;
    if (active && root.contains(active) && active.tagName === "SELECT" && active.dataset?.playerId != null) {
      focus = { playerId: active.dataset.playerId, slot: active.dataset.slot };
    }
  }
  app._kgSnap = { scroll, focus };
}

/** Restore the snapshot taken in `_preRender`. Call from `_onRender`, after the swap. */
export function restoreRender(app) {
  const snap = app?._kgSnap;
  app._kgSnap = null;
  const root = app?.element;
  if (!snap || !root) return;
  if (snap.focus) {
    // Restore focus first, with preventScroll, so re-focusing can't perturb the
    // scrollTop we are about to restore.
    const sel = root.querySelector(
      `select[data-player-id="${snap.focus.playerId}"][data-slot="${snap.focus.slot}"]`,
    );
    sel?.focus?.({ preventScroll: true });
  }
  for (const [selector, top] of Object.entries(snap.scroll)) {
    const el = root.querySelector(selector);
    if (el) el.scrollTop = top;
  }
}

/**
 * Request a (re)render of an open ApplicationV2 — coalesced and lock-aware.
 *  - `force: true` renders now, ignoring the lock (theme / appearance changes,
 *    which invalidate every rendered label).
 *  - otherwise: schedule one render on the next frame; if a <select> is busy, hold
 *    the pending render until the app re-schedules on the select's change/blur.
 */
export function scheduleRender(app, { force = false } = {}) {
  if (!app || !app.rendered) return;
  if (force) {
    app._kgPending = false;
    app.render();
    return;
  }
  app._kgPending = true;
  if (app._kgScheduled) return;
  app._kgScheduled = true;
  onFrame(() => {
    app._kgScheduled = false;
    if (!app._kgPending || !app.rendered) {
      app._kgPending = false;
      return;
    }
    if (locked(app)) return; // a change/blur on the busy select will re-schedule
    app._kgPending = false;
    app.render();
  });
}
