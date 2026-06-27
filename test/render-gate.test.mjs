import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scheduleRender } from "../src/presentation/render-gate.mjs";

// Drive the gate's requestAnimationFrame manually so we can assert coalescing/defer.
describe("scheduleRender (render gate)", () => {
  let frames;
  let savedRaf;
  const flush = () => { const fns = frames; frames = []; for (const f of fns) f(); };

  beforeEach(() => {
    frames = [];
    savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  });
  afterEach(() => { globalThis.requestAnimationFrame = savedRaf; });

  const makeApp = () => ({ rendered: true, _kgSelectBusy: false, renders: 0, render() { this.renders += 1; } });

  it("coalesces a burst of schedule calls into a single render", () => {
    const app = makeApp();
    scheduleRender(app);
    scheduleRender(app);
    scheduleRender(app);
    expect(app.renders).toBe(0); // deferred to the frame
    flush();
    expect(app.renders).toBe(1);
  });

  it("force-renders immediately, bypassing the frame and the lock", () => {
    const app = makeApp();
    app._kgSelectBusy = true;
    scheduleRender(app, { force: true });
    expect(app.renders).toBe(1);
  });

  it("defers while a <select> is busy, then renders once after it clears", () => {
    const app = makeApp();
    app._kgSelectBusy = true;
    scheduleRender(app);
    flush();
    expect(app.renders).toBe(0); // held — locked
    app._kgSelectBusy = false;
    scheduleRender(app); // a change/blur re-schedules
    flush();
    expect(app.renders).toBe(1);
  });

  it("does nothing when the app is not currently rendered", () => {
    const app = makeApp();
    app.rendered = false;
    scheduleRender(app);
    flush();
    expect(app.renders).toBe(0);
  });
});
