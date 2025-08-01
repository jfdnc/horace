# Horace

TODO:
- [ ] Move things into rust and hook up wasm (wanted to see how far we could get with pure JS first--it works pretty well tbh lol)

A motion tracker webapp that uses the browser's webcam to capture video frames, processes them using modular FrameProcessors, and draws visualizations directly to a canvas.



https://github.com/user-attachments/assets/b2ca7e89-1136-45ef-ba42-f76737924c0f



## Features

- Real-time webcam video capture
- Modular frame processing architecture
- Motion detection and tracking
- Point tracking
- Region detection
- Rust + WebAssembly for high-performance processing
- Pure JavaScript UI and orchestration

## Architecture

Horace combines JavaScript for UI orchestration with Rust compiled to WebAssembly for computationally intensive frame processing. The modular FrameProcessor pattern allows different processing algorithms to be chained together, with each processor drawing its results directly to the canvas.

## Development

### Prerequisites

- Rust and `wasm-pack` for WebAssembly compilation
- Python 3 for local development server
- Modern web browser with webcam support

### Build & Run

1. Build the Rust WebAssembly module:
   ```bash
   cd rust-motion
   wasm-pack build --target web
   ```

2. Start the development server:
   ```bash
   cd public
   python3 -m http.server 8000
   ```

3. Open http://localhost:8000 in your browser

## Project Structure

- `public/` - Web application files
- `rust-motion/` - Rust WebAssembly processing code
- `docs/` - Project documentation
