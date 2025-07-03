# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a motion tracker webapp that uses the browser's webcam to capture video frames, processes them using modular FrameProcessors, and draws visualizations to a canvas. The project combines:

- **Frontend**: Raw JavaScript for UI and orchestration
- **Backend Processing**: Rust compiled to WebAssembly for frame processing
- **Architecture**: Modular FrameProcessor pattern where each processor takes canvas context and frame data, processes it, and draws directly to canvas

## Commands

### Build Rust to WebAssembly
```bash
wasm-pack build --target web
```
Run this from the `rust-motion/` directory to compile Rust code to WebAssembly.

### Local Development Server
```bash
python3 -m http.server 8000
```
Run this from the `public/` directory to serve the webapp locally at http://localhost:8000.

## Project Structure

```
public/                    # Web app files
├── index.html            # Entry point
├── main.js               # App orchestration and frame loop
├── camera/               # Camera functionality
│   ├── camera.js         # getUserMedia setup
│   └── frameCapture.js   # Frame capture from video to canvas
├── processors/           # Frame processing modules
│   ├── motionProcessor.js    # Motion detection and drawing
│   ├── pointProcessor.js     # Point tracking and drawing
│   └── regionProcessor.js    # Region tracking and drawing
├── wasm/                 # Rust-to-Wasm build output
├── styles/
│   └── styles.css
└── utils.js              # Shared utilities

rust-motion/              # Rust WebAssembly project
├── Cargo.toml
└── src/
    ├── lib.rs            # Wasm-bindgen exports
    ├── motion.rs         # Motion detection logic
    ├── tracking.rs       # Point tracking logic
    └── regions.rs        # Region detection logic
```

## FrameProcessor Pattern

Each FrameProcessor is a self-contained function that:
1. Takes canvas context and frame data as parameters
2. Processes the frame using either JavaScript or Rust/Wasm functions
3. Immediately draws results to the canvas
4. Processors execute in sequence for visual layering (later processors draw on top)

## WebAssembly Integration

Rust functions are exposed to JavaScript via `wasm-bindgen`. Build the Rust project first, then import the generated WebAssembly module in JavaScript files that need access to the processing functions.