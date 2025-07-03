Design a Point Tracking Processor for a browser-based motion tracking app. The processor should allow users to manually assign anchor points by clicking on the canvas. Each anchor point must persist across frames with a stable identity and track its position, velocity, and disappearance over time.

The processor should:
- Maintain an internal state: an array of anchor points with { id, currentPos, previousPos, velocity, lostFrames }.
- On each new frame:
  - Compare detected points to existing anchors using Euclidean distance.
  - Update matched anchors’ positions and velocities.
  - Add new anchors if unmatched points are detected.
  - Increment lostFrames for anchors not matched in the current frame.
  - Remove anchors if they’ve been lost for too many frames.
- Draw visual representations of anchor points, movement trails, and velocity vectors on the canvas.

Start with manual anchor selection (canvas click events) and simple distance matching. Design the processor to evolve toward automatic feature detection, more advanced matching (like optical flow), and predictive tracking in future versions.
