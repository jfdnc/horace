class FrameCapture {
    constructor(canvas, video) {
        this.canvas = canvas;
        this.video = video;
        this.ctx = canvas.getContext('2d');
        this.imageData = null;
        this.previousImageData = null;
        
        this.setupCanvas();
    }

    setupCanvas() {
        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 480;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;
        this.ctx.font = '14px Arial';
    }

    captureFrame() {
        if (!this.video || this.video.readyState !== 4) {
            return null;
        }

        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.clearRect(0, 0, width, height);
        
        this.ctx.drawImage(this.video, 0, 0, width, height);
        
        try {
            this.previousImageData = this.imageData;
            this.imageData = this.ctx.getImageData(0, 0, width, height);
            
            return {
                imageData: this.imageData,
                previousImageData: this.previousImageData,
                width: width,
                height: height,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error capturing frame:', error);
            return null;
        }
    }

    getCurrentImageData() {
        return this.imageData;
    }

    getPreviousImageData() {
        return this.previousImageData;
    }

    getCanvas() {
        return this.canvas;
    }

    getContext() {
        return this.ctx;
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawText(text, x, y, color = '#00ff88') {
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, x, y);
    }

    drawRect(x, y, width, height, color = '#00ff88') {
        this.ctx.strokeStyle = color;
        this.ctx.strokeRect(x, y, width, height);
    }

    drawCircle(x, y, radius, color = '#00ff88') {
        this.ctx.strokeStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
    }
}

window.FrameCapture = FrameCapture;