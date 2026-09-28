const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const childProcess = require("node:child_process");

const modulePath = require.resolve("../../src/helpers/ensureYdotool");

async function checkStartup({ desktop, availableCommands, hyprlandSignature = true }) {
  const dialogs = [];
  const previous = {
    XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP,
    HYPRLAND_INSTANCE_SIGNATURE: process.env.HYPRLAND_INSTANCE_SIGNATURE,
    SWAYSOCK: process.env.SWAYSOCK,
    XDG_SESSION_DESKTOP: process.env.XDG_SESSION_DESKTOP,
    DESKTOP_SESSION: process.env.DESKTOP_SESSION,
  };
  const originalLoad = Module._load;
  process.env.XDG_SESSION_TYPE = "wayland";
  process.env.WAYLAND_DISPLAY = "wayland-test";
  process.env.XDG_CURRENT_DESKTOP = desktop;
  delete process.env.SWAYSOCK;
  delete process.env.XDG_SESSION_DESKTOP;
  delete process.env.DESKTOP_SESSION;
  if (desktop === "Hyprland" && hyprlandSignature) process.env.HYPRLAND_INSTANCE_SIGNATURE = "test";
  else delete process.env.HYPRLAND_INSTANCE_SIGNATURE;

  delete require.cache[modulePath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "electron") {
      return { dialog: { showMessageBox: (options) => dialogs.push(options) } };
    }
    if (request === "child_process") {
      return {
        ...childProcess,
        spawnSync(command, args) {
          if (command === "which") {
            return { status: availableCommands.includes(args[0]) ? 0 : 1 };
          }
          return { status: 1, stdout: Buffer.from("") };
        },
      };
    }
    if (request === "./debugLogger") {
      return { debug() {}, info() {}, warn() {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { ensureYdotool } = require(modulePath);
    await ensureYdotool();
    return dialogs;
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Hyprland with wtype does not warn about an unused ydotool fallback", async () => {
  const dialogs = await checkStartup({ desktop: "Hyprland", availableCommands: ["wtype"] });
  assert.equal(dialogs.length, 0);
});

test("Hyprland with wtype but no instance signature does not warn", async () => {
  const dialogs = await checkStartup({
    desktop: "Hyprland",
    availableCommands: ["wtype"],
    hyprlandSignature: false,
  });
  assert.equal(dialogs.length, 0);
});

test("Hyprland with hyprctl does not warn about an unused ydotool fallback", async () => {
  const dialogs = await checkStartup({ desktop: "Hyprland", availableCommands: ["hyprctl"] });
  assert.equal(dialogs.length, 0);
});

test("Hyprland without another paste backend still warns", async () => {
  const dialogs = await checkStartup({ desktop: "Hyprland", availableCommands: [] });
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].title, "Wayland Paste Setup");
});

test("Sway with wtype still checks its ydotool fallback", async () => {
  const dialogs = await checkStartup({ desktop: "sway", availableCommands: ["wtype"] });
  assert.equal(dialogs.length, 1);
});

test("GNOME with wtype still checks its ydotool fallback", async () => {
  const dialogs = await checkStartup({ desktop: "GNOME", availableCommands: ["wtype"] });
  assert.equal(dialogs.length, 1);
});
