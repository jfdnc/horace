class Camera {
    constructor() {
        this.video = null;
        this.stream = null;
        this.isInitialized = false;
    }

    async initialize(videoElement) {
        try {
            this.video = videoElement;
            
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            return new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.isInitialized = true;
                    console.log('Camera initialized successfully');
                    resolve();
                };
                this.video.onerror = reject;
            });
        } catch (error) {
            console.error('Error accessing camera:', error);
            throw error;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.isInitialized = false;
        console.log('Camera stopped');
    }

    getVideoElement() {
        return this.video;
    }

    isReady() {
        return this.isInitialized && this.video && this.video.readyState === 4;
    }

    getVideoConstraints() {
        if (!this.stream) return null;
        
        const videoTrack = this.stream.getVideoTracks()[0];
        return videoTrack ? videoTrack.getSettings() : null;
    }
}

window.Camera = Camera;