# If something looks wrong

[← Back to the README](../README.md)

**Start here: your installer version.** Settings → General shows two numbers: the app version and the *installer* version. Obsidian updates the app in place, but not the installer, and an old installer is an old Electron. Most reports of the plugin not loading, lagging or freezing have been fixed by uninstalling Obsidian and reinstalling from [obsidian.md](https://obsidian.md). Your vault is untouched by that.

**"Word-Smith says styles.css is out of date."** Exactly what it says: `main.js` was updated and `styles.css` wasn't. A stale stylesheet looks like a broken feature, because the rules are simply missing. Copy all three files (`main.js`, `styles.css`, `manifest.json`) and reload.

**The bar looks unstyled, or a mask is the wrong colour.** Same cause, same fix.

**A row prints `{sometoken}` instead of a number.** That token doesn't exist. Unknown tokens stay visible on purpose, so a typo shows itself instead of silently rendering blank.

**A segment vanished.** A segment whose tokens all resolve to nothing is dropped, dividers and all: `{vim}` outside Vim mode, `{caps}` with caps lock off. That's the bar refusing to show you an empty coloured stub.

**A theme changed nothing.** Check the master switch at the top of the Theme tab. Off, a scheme is remembered but never painted. And the first four theme options need a scheme to work from; under **Default** they're dimmed.

**A community theme still shows through.** Word-Smith writes Obsidian's own variables, so anything a theme paints with a hard-coded colour stays its own. Open an issue with the theme's name. The fix is usually one more variable.

**The custom file-tree order didn't apply.** Make sure the file explorer tab is open in the sidebar. Obsidian doesn't build a hidden panel until it's shown, and the order is applied when it is. Toggling the switch in **File tree** re-applies it.

**The Organiser feels slow, or freezes.** Under **Settings → File tree**, try switching off word counts, flags, tasks and goal percentage, then reopen the Organiser. If that fixes it, open an issue and say so, and say whether your file explorer scrolls, and what your OS and Obsidian version are.

**Your history file is the only copy.** It's an ordinary note. Back it up with your vault, and don't delete it expecting the plugin to have another one.

**The red flash / keys that won't work.** That's Hemingway mode doing its job. It blocks backspace, delete, arrows or whatever you locked. Turn it off from the menu, the bar's Modes button, or the Hemingway tab.

**A powerline hides part of the editor / you want Obsidian's status bar back.** Powerline tab → switch it off. Obsidian's own bar returns.

Still stuck? [Open an issue](https://github.com/Sadsnake1/word-smith/issues) with your OS, Obsidian version, installer version, and, if you can, the console (`Ctrl+Shift+I`) at the moment it went wrong. Disabling other plugins one at a time is the fastest way to find a clash.
