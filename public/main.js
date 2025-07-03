class HoraceApp {
    constructor() {
        this.camera = null;
        this.frameCapture = null;
        this.isRunning = false;
        this.frameCount = 0;
        this.lastFpsTime = 0;
        this.fps = 0;

        this.processors = [];
        this.processorStates = {
            motion: false,
            point: true,
            region: false
        };

        this.initializeElements();
        this.setupEventListeners();
        this.initializeProcessors();
    }

    initializeElements() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.fpsDisplay = document.getElementById('fps');
        this.statusDisplay = document.getElementById('status');

        this.motionToggle = document.getElementById('motionToggle');
        this.pointToggle = document.getElementById('pointToggle');
        this.regionToggle = document.getElementById('regionToggle');
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.clearBtn.addEventListener('click', () => this.clearAllData());

        this.motionToggle.addEventListener('change', (e) => {
            this.processorStates.motion = e.target.checked;
        });

        this.pointToggle.addEventListener('change', (e) => {
            this.processorStates.point = e.target.checked;
        });

        this.regionToggle.addEventListener('change', (e) => {
            this.processorStates.region = e.target.checked;
        });

        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e)
        });
    }

    handleCanvasClick(event) {
        if (!this.isRunning || !this.processorStates.point) {
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const canvasX = x * scaleX;
        const canvasY = y * scaleY;

        if (window.PointProcessor && window.PointProcessor.addAnchorPoint && this.frameCapture) {
            window.PointProcessor.addAnchorPoint(canvasX, canvasY, this.frameCapture);
            console.log(`Added anchor point at (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)})`);
        }
    }

    initializeProcessors() {
        this.processors = [
            { name: 'motion', processor: window.MotionProcessor },
            { name: 'point', processor: window.PointProcessor },
            { name: 'region', processor: window.RegionProcessor }
        ];
    }

    async start() {
        try {
            this.updateStatus('Starting camera...');
            this.startBtn.disabled = true;

            this.camera = new Camera();
            await this.camera.initialize(this.video);

            this.frameCapture = new FrameCapture(this.canvas, this.video);

            this.updateStatus('Camera started');
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;

            this.isRunning = true;
            this.lastFpsTime = performance.now();
            this.frameLoop();

        } catch (error) {
            console.error('Error starting camera:', error);
            this.updateStatus('Error: ' + error.message);
            this.startBtn.disabled = false;
        }
    }

    stop() {
        this.isRunning = false;

        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }

        if (this.frameCapture) {
            this.frameCapture.clearCanvas();
            this.frameCapture = null;
        }

        this.updateStatus('Stopped');
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.fps = 0;
        this.updateFpsDisplay();
    }

    frameLoop() {
        if (!this.isRunning || !this.camera || !this.camera.isReady()) {
            return;
        }

        const frameData = this.frameCapture.captureFrame();
        if (frameData) {
            this.processFrame(frameData);
        }

        this.updateFps();
        requestAnimationFrame(() => this.frameLoop());
    }

    processFrame(frameData) {
        const ctx = this.frameCapture.getContext();

        for (const processorDef of this.processors) {
            const isEnabled = this.processorStates[processorDef.name];
            if (isEnabled && processorDef.processor) {
                try {
                    processorDef.processor(ctx, frameData);
                } catch (error) {
                    console.error(`Error in ${processorDef.name} processor:`, error);
                }
            }
        }
    }

    updateFps() {
        this.frameCount++;
        const now = performance.now();
        const elapsed = now - this.lastFpsTime;

        if (elapsed >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            this.frameCount = 0;
            this.lastFpsTime = now;
            this.updateFpsDisplay();
        }
    }

    updateFpsDisplay() {
        this.fpsDisplay.textContent = this.fps;
    }

    clearAllData() {
        console.log('Clearing all processor data...');
        
        for (const processorDef of this.processors) {
            if (processorDef.processor && processorDef.processor.clear) {
                try {
                    processorDef.processor.clear();
                } catch (error) {
                    console.error(`Error clearing ${processorDef.name} processor:`, error);
                }
            }
        }
        
        console.log('All processor data cleared');
    }

    updateStatus(status) {
        this.statusDisplay.textContent = status;
        console.log('Status:', status);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new HoraceApp();
});