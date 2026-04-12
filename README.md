# Asset Browser Tool 🎨

A minimalist, high-performance local web application to visualize and manage your game assets. Designed to run seamlessly directly from your assets folder with zero external dependencies.

## Features ✨
- **Zero Configuration:** Only requires Node.js standard library.
- **Media Previews:** Views images (PNG, JPG, WebP, SVG) and plays audio directly from the browser.
- **Smart Documentation:** Automatically surfaces `README` and `LICENSE` files when you enter a folder.
- **Organized Navigation:** Filter by file type (Images, Audio, All), paginate through large folders, and easily find your way via breadcrumbs.
- **Lifecycle Management:** Rename files locally and bookmark your standard folders to a Favorites sidebar.

## How to Run 🚀

Since this requires absolutely zero setup other than Node, the steps are extremely short:

1. Look inside your command-line output to ensure you are inside `D:\Godot\Assets\asset_browser`. Use the command:
   ```bash
   cd D:\Godot\Assets\asset_browser
   ```
2. Start the server:
   ```bash
   node server.js
   ```
3. Open a browser and navigate to exactly:
   ```
   http://localhost:3000
   ```
4. Click through your folders to explore, and use the star (★) action to favorite assets or folders. Favorites are saved inside `favorites.json`.

## Supported Formats
- **Images:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
- **Audio:** `.mp3`, `.wav`, `.ogg`
- **Text:** `.txt`, `.md`, any files matching "readme" or "license"

*Built according to Karpathy's guidelines focusing on surgical, simple, and goal-driven development.*
