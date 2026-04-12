# Asset Browser Tool 🎨

A minimalist, high-performance local web application built precisely to visualize, navigate, and manage massive game asset libraries. It is designed to run locally using zero external dependencies, while leveraging direct backend integrations with the underlying Windows OS.

## 🚀 Key Architectural Features

- **Zero Dependency Core**: Built entirely in Vanilla Javascript, CSS, and HTML with a native Node.js standard-library backend. No React, no build steps, no external NPM packages required.
- **Topmost Native File Picker**: Directly hooks into Windows via local bridges to spawn native Folder Selection GUI dialogs on top of your browser layer. 
- **Dynamic Config Swapping**: Change the targeted system directory at any time on the fly via the browser's Data Root Path settings, automatically persisting via `config.json`.
- **Advanced File Recursion**: Automatically indexes all subdirectories infinitely or to specific folder depths. Includes robust item pagination (swap between 24, 50, 100, or 1000 items) and instant zoom adjustments on the grid.
- **Multi-Image Synchronous Workspace**: Select an image, and it opens in a professional-grade Workspace Viewer allowing identical synchronization across multiple parallel image planes.
- **Measurement Rulers & Clippers**: A built-in HTML5 `<canvas>` tool allows drawing real pixel-perfect lines (synchronized across panning/zooming) to measure assets, and native Rectangular DOM-Canvas Selection logic copies perfect image crops instantly to the OS Clipboard!
- **Power Navigation**: A fully implemented global keyboard shortcut mapping (WASD for zooming/panning, Q/E to cycle images, R/F to insert images, Z to undo workspace stacks) blocked safely against overlapping DOM text forms.

## 🖥 OS & Supported Formats

- **Operating System Integration**: Strictly tailored for native Windows filesystem management and PowerShell/VBScript bridges.
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- **Audio**: `.mp3`, `.wav`, `.ogg`
- **Text/Readmes**: Surface any `.txt` or `.md` metadata gracefully inside folders.

## 🛠 How to Run & Use

1. Ensure you have Node.js installed locally.
2. Open a standard terminal/PowerShell window.
3. Path explicitly to your browser directory:
   ```bash
   cd D:\Godot\Assets\asset_browser
   ```
4. Start the live-server block:
   ```bash
   node server.js
   ```
5. Open your local browser to jump into the UI:
   ```
   http://localhost:3000
   ```
   *Note: Close the terminal to safely terminate the session.*

## ⚙️ Persisted State Mechanics
All user workflow changes—such as Dark Canvas vs Bright Canvas logic, Active Thumbnail Zoom scaling sizes (pixels), Pagination sizes, Recursive Toggle thresholds, and the Primary Data Tree Directory mappings—are securely and persistently cached both in `localStorage` and synchronized against backend configs, ensuring absolutely flawless state recall between reloads.
