import { MODULE_ID } from "../constants.mjs";

/**
 * Add the launch button. Scene-control layouts differ between Foundry generations,
 * so this adds the tool defensively for both the v12 array shape and the v13+
 * record shape. A hotbar macro is also created as a dependable fallback launcher.
 */
export function registerControls(onLaunch, onBuild) {
  Hooks.on("getSceneControlButtons", (controls) => {
    const mkTool = (name, title, icon, handler, order) => ({
      name,
      title,
      icon,
      button: true,
      order,
      onClick: () => handler(),
      onChange: () => handler(),
    });
    const tools = [mkTool(MODULE_ID, "KNUCKLES.title", "fa-solid fa-dice-d6", onLaunch, 999)];
    // The builder sits beside the launcher so a die can be made from anywhere, without
    // opening a game first. GM-only, like every other way in.
    if (onBuild && game.user?.isGM) {
      tools.push(mkTool(`${MODULE_ID}-builder`, "KNUCKLES.builder.title", "fa-solid fa-pen-ruler", onBuild, 1000));
    }
    try {
      if (Array.isArray(controls)) {
        const group = controls.find((c) => c.name === "token") ?? controls[0];
        for (const tool of tools) group?.tools?.push(tool);
      } else if (controls && typeof controls === "object") {
        const group = controls.tokens ?? controls.token ?? Object.values(controls)[0];
        if (!group) return;
        for (const tool of tools) {
          if (Array.isArray(group.tools)) group.tools.push(tool);
          else if (group.tools && typeof group.tools === "object") group.tools[tool.name] = tool;
        }
      }
    } catch (err) {
      console.warn("knuckles-game | could not add a scene control button", err);
    }
  });
}

/** Create a one-off launcher macro if the GM doesn't have one yet. */
export async function ensureLauncherMacro() {
  const name = "Knuckles Game";
  if (game.macros.find((m) => m.name === name)) return;
  await Macro.create({
    name,
    type: "script",
    img: "icons/svg/d20-grey.svg",
    command: `game.modules.get("${MODULE_ID}").api.open();`,
  });
}
