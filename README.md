# FossFLOW - Isometric Diagramming Tool <img width="30" height="30" alt="fossflow" src="https://github.com/user-attachments/assets/56d78887-601c-4336-ab87-76f8ee4cde96" />

<p align="center">
 <a href="README.md">English</a> | <a href="docs/README.cn.md">简体中文</a> | <a href="docs/README.es.md">Español</a> | <a href="docs/README.pt.md">Português</a> | <a href="docs/README.fr.md">Français</a> | <a href="docs/README.hi.md">हिन्दी</a> | <a href="docs/README.bn.md">বাংলা</a> | <a href="docs/README.ru.md">Русский</a>
</p>

<b>Hey!</b> Stan here, if you've used FossFLOW and it's helped you, <b>I'd really appreciate if you could donate something small :)</b> I work full time, and finding the time to work on this project is challenging enough.
If you've had a feature that I've implemented for you, or fixed a bug it'd be great if you could :) if not, that's not a problem, this software will always remain free!


<b>Also!</b> If you haven't yet, please check out the underlying library this is built on by <a href="https://github.com/markmanx/isoflow">@markmanx</a> I truly stand on the shoulders of a giant here 🫡

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P5P61KBXA3)

<a href="https://www.buymeacoffee.com/stan.smith" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

Thanks,

-Stan

## Try it online

Go to  <b> --> https://stan-smith.github.io/FossFLOW/ <-- </b>


------------------------------------------------------------------------------------------------------------------------------
FossFLOW is a powerful, open-source Progressive Web App (PWA) for creating beautiful isometric diagrams. Built with React and the <a href="https://github.com/markmanx/isoflow">Isoflow</a> (Now forked and published to NPM as fossflow) library, it runs entirely in your browser with offline support.

![Screenshot_20250630_160954](https://github.com/user-attachments/assets/e7f254ad-625f-4b8a-8efc-5293b5be9d55)

- **📝 [FOSSFLOW_TODO.md](https://github.com/stan-smith/FossFLOW/blob/master/FOSSFLOW_TODO.md)** - Current issues and roadmap with codebase mappings, most gripes are with the isoflow library itself.
- **🤝 [CONTRIBUTORS.md](https://github.com/stan-smith/FossFLOW/blob/master/CONTRIBUTORS.md)** - How to contribute to the project.

## Recent Updates (November 2025)

### Version 1.7.0 Features
- **Read-Only Mode** - View diagrams in read-only mode via `/display/{diagram-id}` URL. Perfect for sharing diagrams without editing capabilities. All editing tools are disabled, but zoom and pan remain available for exploration.
- **Enhanced Color Picker** - Improved custom color picker with better UX and documentation updates

### Version 1.6.0 Features
- **Variable DPI Image Export** - Export diagrams at multiple resolutions (1x, 2x, 3x, 4x) for print-quality outputs. Choose from preset DPI options (72, 144, 216, 288 DPI) or set custom scale values.

### Version 1.5.2 Features
- **Keyboard Shortcuts** - Quick save and load with `CTRL+S` (save) and `CTRL+O` (load/open) keyboard shortcuts

### Version 1.5.1 Features
- **Lazy Icon Loading** - Faster initial load times! By default, only core Isoflow icons are loaded. Users can selectively enable additional icon packs as needed, significantly reducing startup time.

### Performance Updates
- **Reduced frame refresh delay** - Smoother rendering and interactions

### Multilingual Support
- **8 Languages Supported** - Full interface translation in English, Chinese (Simplified), Spanish, Portuguese (Brazilian), French, Hindi, Bengali, and Russian
- **Language Selector** - Easy-to-use language switcher in the app header
- **Complete Translation** - All menus, dialogs, settings, tooltips, and help content translated
- **Locale-Aware** - Automatically detects and remembers your language preference

### Improved Connector Tool
- **Click-based Creation** - New default mode: click first node, then second node to connect
- **Drag Mode Option** - Original drag-and-drop still available via settings
- **Mode Selection** - Switch between click and drag modes in Settings → Connectors tab
- **Better Reliability** - Click mode provides more predictable connection creation

### Custom Icon Import
- **Import Your Own Icons** - Upload custom icons (PNG, JPG, SVG) to use in your diagrams
- **Automatic Scaling** - Icons are automatically scaled to consistent sizes for professional appearance
- **Isometric/Flat Toggle** - Choose whether imported icons appear as 3D isometric or flat 2D
- **Smart Persistence** - Custom icons are saved with diagrams and work across all storage methods
- **Icon Resources** - Find free icons at:
  - [Iconify Icon Sets](https://icon-sets.iconify.design/) - Thousands of free SVG icons
  - [Flaticon Isometric Icons](https://www.flaticon.com/free-icons/isometric) - High-quality isometric icon packs

### Server Storage Support
- **Persistent Storage** - Diagrams saved to server filesystem, persist across browser sessions
- **Multi-device Access** - Access your diagrams from any device when using Docker deployment
- **Automatic Detection** - UI automatically shows server storage when available
- **Overwrite Protection** - Confirmation dialog when saving with duplicate names
- **Docker Integration** - Server storage enabled by default in Docker deployments

### Enhanced Interaction Features
- **Configurable Hotkeys** - Three profiles (QWERTY, SMNRCT, None) for tool selection with visual indicators
- **Advanced Pan Controls** - Multiple pan methods including empty area drag, middle/right click, modifier keys (Ctrl/Alt), and keyboard navigation (Arrow/WASD/IJKL)
- **Toggle Connector Arrows** - Option to show/hide arrows on individual connectors
- **Persistent Tool Selection** - Connector tool remains active after creating connections
- **Settings Dialog** - Centralized configuration for hotkeys and pan controls

### Docker & CI/CD Improvements
- **Automated Docker Builds** - GitHub Actions workflow for automatic Docker Hub deployment on commits
- **Multi-architecture Support** - Docker images for both `linux/amd64` and `linux/arm64`
- **Pre-built Images** - Available at `stnsmith/fossflow:latest`

### Monorepo Architecture
- **Single repository** for both library and application
- **NPM Workspaces** for streamlined dependency management
- **Unified build process** with `npm run build` at the root

### UI Fixes
- Fixed Quill editor toolbar icons display issue
- Resolved React key warnings in context menus
- Improved markdown editor styling
- Added error boundary for React-Quill DOM manipulation errors

## Features

- 🎨 **Isometric Diagramming** - Create stunning 3D-style technical diagrams
- 💾 **Auto-Save** - Your work is automatically saved every 5 seconds
- 📱 **PWA Support** - Install as a native app on Mac and Linux
- 🔒 **Privacy-First** - All data stored locally in your browser
- 📤 **Import/Export** - Share diagrams as JSON files or high-resolution images (variable DPI)
- 🎯 **Session Storage** - Quick save without dialogs
- 🌐 **Offline Support** - Work without internet connection
- 🗄️ **Server Storage** - Optional persistent storage when using Docker (enabled by default)
- 🌍 **Multilingual** - Full support for 8 languages: English, 简体中文, Español, Português, Français, हिन्दी, বাংলা, Русский
- 👁️ **Read-Only Mode** - Share diagrams in view-only mode via URL (`/display/{diagram-id}`)
- ⌨️ **Keyboard Shortcuts** - Quick save (`CTRL+S`) and load (`CTRL+O`) shortcuts
- 🖼️ **High-Resolution Export** - Export diagrams at multiple DPI settings (72, 144, 216, 288 DPI) for print quality


## 🐳 Quick Deploy with Docker

```bash
# Using Docker Compose (recommended - includes persistent storage)
docker compose up

# Or run directly from Docker Hub with persistent storage
docker run -p 80:80 -v $(pwd)/diagrams:/data/diagrams stnsmith/fossflow:latest
```

Server storage is enabled by default in Docker. Your diagrams will be saved to `./diagrams` on the host.

To disable server storage, set `ENABLE_SERVER_STORAGE=false`:
```bash
docker run -p 80:80 -e ENABLE_SERVER_STORAGE=false stnsmith/fossflow:latest
```

### Building Docker Images

FossFLOW includes a build script for creating Docker images with configurable platform and registry settings.

**Using the npm script:**
```bash
# Build and push with defaults (stnsmith/fossflow:latest on linux/amd64)
npm run docker:build-image

# Build for ARM64 platform
npm run docker:build-image -- --platform linux/arm64

# Build and push to GitHub Container Registry
npm run docker:build-image -- --registry ghcr.io/username --image-name fossflow

# Build with git SHA as tag
npm run docker:build-image -- --tag git-sha

# Build only, don't push
npm run docker:build-image -- --no-push
```

**Using the script directly:**
```bash
# Show help
./scripts/build-image.sh --help

# Build for specific platform
./scripts/build-image.sh --platform linux/arm64

# Build for multiple platforms (requires docker buildx)
./scripts/build-image.sh --platform linux/amd64,linux/arm64
```

**Environment variables:**
You can also configure the build using environment variables:
```bash
DOCKER_REGISTRY=ghcr.io/username \
DOCKER_IMAGE_NAME=fossflow \
IMAGE_TAG=v1.7.0 \
DOCKER_PLATFORM=linux/amd64 \
./scripts/build-image.sh
```

**Prerequisites:**
- Docker installed and running
- For multi-platform builds: `docker buildx` (usually included with Docker Desktop)
- For pushing: logged in to the target registry (`docker login <registry>`)

## Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/stan-smith/FossFLOW
cd FossFLOW

# Install dependencies
npm install

# Build the library (required first time)
npm run build:lib

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Monorepo Structure

This is a monorepo containing two packages:

- `packages/fossflow-lib` - React component library for drawing network diagrams (built with Webpack)
- `packages/fossflow-app` - Progressive Web App for creating isometric diagrams (built with RSBuild)

### Development Commands

```bash
# Development
npm run dev          # Start app development server
npm run dev:lib      # Watch mode for library development

# Building
npm run build        # Build both library and app
npm run build:lib    # Build library only
npm run build:app    # Build app only

# Testing & Linting
npm test             # Run unit tests
npm run lint         # Check for linting errors

# E2E Tests (Selenium)
cd e2e-tests
./run-tests.sh       # Run end-to-end tests (requires Docker & Python)

# Publishing
npm run publish:lib  # Publish library to npm
```

## How to Use

### Creating Diagrams

1. **Add Items**:
   - Press the "+" button on the top right menu, the library of components will appear on the left
   - Drag and drop components from the library onto the canvas
   - Or right-click on the grid and select "Add node"

2. **Connect Items**: 
   - Select the Connector tool (press 'C' or click connector icon)
   - **Click mode** (default): Click first node, then click second node
   - **Drag mode** (optional): Click and drag from first to second node
   - Switch modes in Settings → Connectors tab

3. **Save Your Work**:
   - **Quick Save** - Saves to browser session (or use `CTRL+S`)
   - **Export** - Download as JSON file or high-resolution image
   - **Import** - Load from JSON file (or use `CTRL+O`)
   - **Image Export** - Export diagrams at various DPI settings (1x, 2x, 3x, 4x) for print quality

### Storage Options

- **Session Storage**: Temporary saves cleared when browser closes
- **Export/Import**: Permanent storage as JSON files
- **Auto-Save**: Automatically saves changes every 5 seconds to session
- **Server Storage**: Persistent storage when using Docker deployment

### Sharing Diagrams

- **Read-Only Mode**: Share diagrams in view-only mode by accessing `/display/{diagram-id}` URL. Editing is disabled, but viewers can zoom and pan to explore the diagram.
- **Export as Image**: Export diagrams as PNG images at various resolutions for presentations, documentation, or printing.

## Contributing

We welcome contributions! Please see [CONTRIBUTORS.md](CONTRIBUTORS.md) for guidelines.

## Documentation

- [FOSSFLOW_ENCYCLOPEDIA.md](FOSSFLOW_ENCYCLOPEDIA.md) - Comprehensive guide to the codebase
- [FOSSFLOW_TODO.md](FOSSFLOW_TODO.md) - Current issues and roadmap
- [CONTRIBUTORS.md](CONTRIBUTORS.md) - Contributing guidelines

## AI Integration (LightRAG)

FossFLOW can optionally integrate with an external LightRAG instance to provide
an AI assistant endpoint on the backend. This is useful for building
context-aware helpers or search features in the app.

- Backend endpoint: `POST /api/ai/query`
  - Request body:
    - `query` (string, required): Natural language question or instruction.
    - `diagramContext` (object, optional): Extra context (e.g. diagram id,
      node/edge summary) that the caller wants to pass through to LightRAG.
    - `options` (object, optional): Implementation-specific options that are
      forwarded to LightRAG.
  - Response body (JSON):
    - `answer` (string): Aggregated answer text from LightRAG’s `query/stream`
      API.
    - `raw` (array of strings, optional): Raw streamed chunks from LightRAG,
      included only when `LIGHTRAG_INCLUDE_RAW=true`.

The backend talks to LightRAG using its `query/stream` HTTP API exposed by the
LightRAG Web UI (for example,
`https://lightrag-latest-xyu3.onrender.com/webui/`).

### Configuration

The following environment variables control the integration:

- `LIGHTRAG_BASE_URL` (optional)
  - Base URL for the LightRAG server.
  - Default: `https://lightrag-latest-xyu3.onrender.com`
- `LIGHTRAG_QUERY_STREAM_PATH` (optional)
  - Path for the query streaming endpoint.
  - Default: `/query/stream`
- `LIGHTRAG_TIMEOUT_MS` (optional)
  - Timeout in milliseconds for requests to LightRAG.
  - Default: `30000`
- `LIGHTRAG_INCLUDE_RAW` (optional)
  - When set to `true`, the backend will include the raw streamed chunks from
    LightRAG in the `raw` field of the response.

### Example request

```bash
curl -X POST http://localhost:3001/api/ai/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain this payment flow at a high level.",
    "diagramContext": {
      "diagramId": "example-diagram-id",
      "summary": "Short text summary of nodes and edges."
    }
  }'
```
which should return a response similar to:

```json
{
  "answer": "High-level explanation from LightRAG...",
  "raw": [
    "...first streamed chunk...",
    "...second streamed chunk..."
  ]
}
```

## License

MIT
