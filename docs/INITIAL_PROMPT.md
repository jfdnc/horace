Create a minimal web app project that uses the browser's webcam to capture video frames, processes those frames using modular FrameProcessors, and draws visualizations directly to a canvas. Use raw JavaScript for the UI and orchestration, and Rust compiled to WebAssembly for processing.

Project name: motion-tracker-webapp

Directory structure:
- public/
  - index.html                 # Web app entry point
  - main.js                    # App orchestration and frame loop
  - camera/
    - camera.js                # Camera setup via getUserMedia
    - frameCapture.js          # Captures frames from video into canvas
  - processors/
    - motionProcessor.js       # FrameProcessor for motion detection and drawing
    - pointProcessor.js        # FrameProcessor for point tracking and drawing
    - regionProcessor.js       # FrameProcessor for region tracking and drawing
  - wasm/                      # Rust-to-Wasm build output (leave placeholder)
  - styles/
    - styles.css               # Basic CSS
  - utils.js                   # Shared JS utilities
- rust-motion/                 # Rust project for frame processing
  - Cargo.toml
  - src/
    - lib.rs                   # Expose Rust functions to JS via wasm-bindgen
    - motion.rs                # Motion detection logic
    - tracking.rs              # Point tracking logic
    - regions.rs               # Region detection logic

Design each FrameProcessor as a self-contained function that takes the canvas context and the frame data, processes the frame, and immediately draws to the canvas. Processors will be executed in sequence to control visual layering (later processors draw on top).

The project should be runnable using:
- `wasm-pack build --target web` to compile the Rust code
- `python3 -m http.server 8000` to serve the project locally from the public directory

Provide starter files for index.html, main.js, and one FrameProcessor (motionProcessor.js) with placeholder functions that log to the console and draw simple shapes. Include a minimal Rust `lib.rs` with a single exposed function that returns a static value.
