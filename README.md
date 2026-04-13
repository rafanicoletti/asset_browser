# Asset Browser Tool 🎨

A minimalist, high-performance local web application built to visualize, navigate, and manage massive game asset libraries. Runs locally with zero external dependencies, leveraging direct backend integrations with the Windows OS.

## 🚀 Key Features

- **Zero Dependency Core**: Vanilla JavaScript, CSS, and HTML with a native Node.js standard-library backend. No React, no build steps, no NPM packages.
- **Native Folder Picker**: Hooks into Windows via PowerShell to spawn a native Folder Selection dialog on top of the browser.
- **Dynamic Config Swapping**: Change the root asset directory on the fly via the browser UI, persisted to `config.json`.
- **Advanced File Recursion**: Indexes all subdirectories (infinitely or to a configurable depth, up to 5 000 file limit). Paginated grid (24 / 50 / 100 / 1 000 items per page).
- **Smart Filter Bar**: Always-visible `All`, `Images`, and `Audio` type filters plus per-extension buttons for all other types. Filters are greyed-out with a tooltip when no matching files are in the current view (a hint to enable Expand Subfolders). File counts per filter are an opt-in option in View Options.
- **Loading Feedback**: An animated spinner is shown while the server scans directories, and a contextual "no results" message guides the user when a filter finds nothing.
- **Multi-Image Workspace Viewer**: Open multiple images side-by-side in a professional pan/zoom workspace.
- **"Open All" / "Open Selected"**: Open all visible images at once, or check individual cards and open only selected ones. Configurable max image count and total size limits.
- **Image Layout Control**: A toolbar dropdown lets you switch between auto-wrap, horizontal (no wrap), and 1–5 columns — persisted across sessions.
- **Measurement Rulers & Clippers**: HTML5 canvas pixel-measurement lines (synchronized with pan/zoom) and rectangular selection that copies a crop to the OS clipboard.
- **Folder Navigation in Grid**: Folders appear as cards in the main grid (when filter is "All"), clicking navigates into them and syncs the sidebar tree.
- **Canvas Background**: Choose between Black, White, or Checkered background for the image workspace **and** the grid image previews.
- **Keyboard Shortcuts**: Full shortcut map (WASD pan, Q/E cycle images, R/F add images, Z undo, C center, X reset) listed in View Options.
- **Power Navigation**: Keyboard shortcuts safely blocked against overlapping DOM text inputs.
- **Favorites**: Pin folders/files to the sidebar Favorites list for instant access.
- **Rename**: Rename any asset in-place from the grid card action button.

## 🖥 Supported Formats

| Type   | Extensions |
|--------|-----------|
| Images | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` |
| Audio  | `.mp3` `.wav` `.ogg` `.flac` `.aif` `.aiff` `.opus` `.m4a` `.wma` `.aac` |
| Text   | `.txt` `.md` (and any file named `README` or `LICENSE`) |
| Other  | Any extension — shown as a generic card with its extension as a filter button |

> **Audio preview**: Each audio card has an inline `<audio>` player. Click ▶ to preview without entering the file. HTTP range streaming is supported for all audio formats.

## 🛠 How to Run

1. Install [Node.js](https://nodejs.org/) if not already present.
2. Open a terminal/PowerShell window:
   ```bash
   cd D:\Godot\Assets\asset_browser
   node server.js
   ```
3. Open your browser:
   ```
   http://localhost:3000
   ```
   *Close the terminal to stop the server.*

> ⚠️ **After restarting the server**, refresh the browser to pick up any server-side changes (audio streaming, format support, etc.).

## ⚙️ View Options (Sidebar)

| Setting | Description |
|---------|-------------|
| Expand Subfolders | Recursively load files from all subdirectories |
| Expand Depth | Limit recursion depth (1–3 levels, or Infinite) |
| Thumbnail Size | Resize grid cards (100–400 px) |
| Items per Page | 24 / 50 / 100 / 1 000 items |
| Show count on filter buttons | Shows file count per filter (off by default) |
| Canvas Background | Black / White / Checkered — applies to both the image workspace and grid previews |
| Open All — Max Images | Cap on how many images "Open All" can load |
| Open All — Max Size (MB) | Total size cap for "Open All" |
| Keyboard Shortcuts | Reference table for all viewer hotkeys |
| Data Root Path | Change the top-level asset directory |

## ⚙️ Persisted State

All settings are stored in `localStorage` and/or `config.json`:
- Root path, recursive toggle, depth, thumbnail size, items per page
- Canvas background, viewer layout, Open All limits
- Filter count display, favorites list
