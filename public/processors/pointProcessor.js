class PointTracker {
    constructor() {
        this.anchorPoints = [];
        this.nextId = 1;
        this.maxDistance = 50;
        this.maxLostFrames = 30;
        this.trailLength = 10;
        this.velocityDecay = 0.9;
        this.searchRadius = 20;

        // Performance optimizations
        this.frameCount = 0;
        this.detectionInterval = 3; // Only detect features every N frames
        this.cachedFeatures = [];
        this.spatialGrid = new Map();
        this.gridSize = 32;
    }

    addAnchorPoint(x, y) {
        const anchorPoint = {
            id: this.nextId++,
            currentPos: { x, y },
            previousPos: { x, y },
            velocity: { x: 0, y: 0 },
            lostFrames: 0,
            trail: [{ x, y }],
            isActive: true,
            confidence: 1.0,
            lastSeen: this.frameCount
        };

        this.anchorPoints.push(anchorPoint);
        return anchorPoint.id;
    }

    updateTracking(frameData) {
        this.frameCount++;

        // Only detect features periodically or when we have few points
        if (this.frameCount % this.detectionInterval === 0 || this.anchorPoints.length < 5) {
            this.cachedFeatures = this.detectFeaturePoints(frameData);
            this.buildSpatialGrid(this.cachedFeatures);
        }

        this.updateAnchors();
    }

    updateAnchors() {
        for (let i = this.anchorPoints.length - 1; i >= 0; i--) {
            const anchor = this.anchorPoints[i];
            anchor.previousPos = { ...anchor.currentPos };

            // Predict position
            const predictedPos = {
                x: anchor.currentPos.x + anchor.velocity.x,
                y: anchor.currentPos.y + anchor.velocity.y
            };

            // Find nearby features using spatial grid
            const bestMatch = this.findBestMatch(anchor, predictedPos);

            if (bestMatch) {
                this.updateAnchorWithMatch(anchor, bestMatch);
            } else {
                this.updateAnchorLost(anchor, predictedPos);
            }

            // Remove inactive anchors
            if (!anchor.isActive) {
                this.anchorPoints.splice(i, 1);
            }
        }
    }

    findBestMatch(anchor, predictedPos) {
        const searchRadius = this.searchRadius * (2 - anchor.confidence);
        const candidateFeatures = this.getFeaturesInRadius(predictedPos, searchRadius);

        let bestMatch = null;
        let bestScore = 0.3; // Minimum threshold

        for (const feature of candidateFeatures) {
            if (feature.matched) continue;

            const distance = this.calculateDistance(predictedPos, feature);
            const distanceScore = 1 - (distance / searchRadius);
            const strengthScore = Math.min(feature.strength / 100, 1);
            const score = distanceScore * 0.7 + strengthScore * 0.3;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = feature;
            }
        }

        return bestMatch;
    }

    updateAnchorWithMatch(anchor, match) {
        match.matched = true;

        // Adaptive smoothing based on confidence
        const smoothFactor = 0.3 + 0.4 * anchor.confidence;
        anchor.currentPos = {
            x: anchor.currentPos.x * (1 - smoothFactor) + match.x * smoothFactor,
            y: anchor.currentPos.y * (1 - smoothFactor) + match.y * smoothFactor
        };

        // Update velocity with momentum
        const newVelocity = {
            x: anchor.currentPos.x - anchor.previousPos.x,
            y: anchor.currentPos.y - anchor.previousPos.y
        };

        const momentum = 0.3 + 0.4 * anchor.confidence;
        anchor.velocity = {
            x: anchor.velocity.x * momentum + newVelocity.x * (1 - momentum),
            y: anchor.velocity.y * momentum + newVelocity.y * (1 - momentum)
        };

        anchor.lostFrames = 0;
        anchor.confidence = Math.min(1.0, anchor.confidence + 0.05);
        anchor.lastSeen = this.frameCount;

        // Update trail
        anchor.trail.push({ ...anchor.currentPos });
        if (anchor.trail.length > this.trailLength) {
            anchor.trail.shift();
        }
    }

    updateAnchorLost(anchor, predictedPos) {
        anchor.currentPos = predictedPos;
        anchor.velocity.x *= this.velocityDecay;
        anchor.velocity.y *= this.velocityDecay;
        anchor.lostFrames++;
        anchor.confidence = Math.max(0.1, anchor.confidence - 0.02);

        if (anchor.lostFrames > this.maxLostFrames) {
            anchor.isActive = false;
        }
    }

    buildSpatialGrid(features) {
        this.spatialGrid.clear();

        for (const feature of features) {
            const gridX = Math.floor(feature.x / this.gridSize);
            const gridY = Math.floor(feature.y / this.gridSize);
            const key = `${gridX},${gridY}`;

            if (!this.spatialGrid.has(key)) {
                this.spatialGrid.set(key, []);
            }
            this.spatialGrid.get(key).push(feature);
        }
    }

    getFeaturesInRadius(pos, radius) {
        const features = [];
        const gridRadius = Math.ceil(radius / this.gridSize);
        const centerGridX = Math.floor(pos.x / this.gridSize);
        const centerGridY = Math.floor(pos.y / this.gridSize);

        for (let gx = centerGridX - gridRadius; gx <= centerGridX + gridRadius; gx++) {
            for (let gy = centerGridY - gridRadius; gy <= centerGridY + gridRadius; gy++) {
                const key = `${gx},${gy}`;
                const gridFeatures = this.spatialGrid.get(key);
                if (gridFeatures) {
                    for (const feature of gridFeatures) {
                        if (this.calculateDistance(pos, feature) <= radius) {
                            features.push(feature);
                        }
                    }
                }
            }
        }

        return features;
    }

    detectFeaturePoints(frameData) {
        const points = [];
        const imageData = frameData.imageData.data;
        const width = frameData.width;
        const height = frameData.height;

        // Larger step for better performance
        const step = 12;
        const windowSize = 2;
        const threshold = 30; // Lower threshold for more features

        // Pre-compute gradients for reuse
        const gradients = this.computeGradients(imageData, width, height);

        for (let y = windowSize; y < height - windowSize; y += step) {
            for (let x = windowSize; x < width - windowSize; x += step) {
                const harris = this.harrisCornerResponseOptimized(gradients, width, x, y, windowSize);

                if (harris > threshold) {
                    points.push({ x, y, strength: harris, matched: false });
                }
            }
        }

        // Sort by strength and take top candidates
        return points.sort((a, b) => b.strength - a.strength).slice(0, 50);
    }

    computeGradients(imageData, width, height) {
        const gradients = new Float32Array(width * height * 2); // [gx, gy] pairs

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const pixelIdx = idx * 4;

                // Use separable Sobel kernels
                const leftPixel = this.getGrayscale(imageData, (y * width + (x - 1)) * 4);
                const rightPixel = this.getGrayscale(imageData, (y * width + (x + 1)) * 4);
                const upPixel = this.getGrayscale(imageData, ((y - 1) * width + x) * 4);
                const downPixel = this.getGrayscale(imageData, ((y + 1) * width + x) * 4);

                gradients[idx * 2] = (rightPixel - leftPixel) * 0.5; // gx
                gradients[idx * 2 + 1] = (downPixel - upPixel) * 0.5; // gy
            }
        }

        return gradients;
    }

    harrisCornerResponseOptimized(gradients, width, x, y, windowSize) {
        let Ixx = 0, Iyy = 0, Ixy = 0;

        for (let wy = -windowSize; wy <= windowSize; wy++) {
            for (let wx = -windowSize; wx <= windowSize; wx++) {
                const px = x + wx;
                const py = y + wy;
                const idx = py * width + px;

                const gx = gradients[idx * 2];
                const gy = gradients[idx * 2 + 1];

                Ixx += gx * gx;
                Iyy += gy * gy;
                Ixy += gx * gy;
            }
        }

        // Harris corner response
        const k = 0.04;
        const det = Ixx * Iyy - Ixy * Ixy;
        const trace = Ixx + Iyy;
        return det - k * trace * trace;
    }

    getGrayscale(imageData, idx) {
        return 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
    }

    calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(255, 136, 0, 0.8)';
        ctx.fillRect(10, 80, 220, 40);

        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px Arial';
        ctx.fillText(`Point Tracking: ${this.anchorPoints.length} points`, 20, 100);

        for (const anchor of this.anchorPoints) {
            this.drawAnchorPoint(ctx, anchor);
        }
    }

    drawAnchorPoint(ctx, anchor) {
        const alpha = anchor.confidence;
        ctx.globalAlpha = alpha;

        // Draw trail
        if (anchor.trail.length > 1) {
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchor.trail[0].x, anchor.trail[0].y);
            for (let i = 1; i < anchor.trail.length; i++) {
                ctx.lineTo(anchor.trail[i].x, anchor.trail[i].y);
            }
            ctx.stroke();
        }

        // Draw anchor point
        const isLost = anchor.lostFrames > 0;
        ctx.strokeStyle = isLost ? '#ff4444' : '#ff8800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(anchor.currentPos.x, anchor.currentPos.y, 6, 0, 2 * Math.PI);
        ctx.stroke();

        // Draw ID
        ctx.fillStyle = isLost ? '#ff4444' : '#ff8800';
        ctx.font = '12px Arial';
        ctx.fillText(`${anchor.id}`, anchor.currentPos.x + 10, anchor.currentPos.y - 10);

        // Draw velocity vector
        const velocityMagnitude = Math.sqrt(anchor.velocity.x ** 2 + anchor.velocity.y ** 2);
        if (velocityMagnitude > 1) {
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchor.currentPos.x, anchor.currentPos.y);
            ctx.lineTo(
                anchor.currentPos.x + anchor.velocity.x * 3,
                anchor.currentPos.y + anchor.velocity.y * 3
            );
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }
}

const pointTracker = new PointTracker();

function PointProcessor(ctx, frameData) {
    pointTracker.updateTracking(frameData);
    pointTracker.draw(ctx);
}

PointProcessor.addAnchorPoint = function (x, y) {
    return pointTracker.addAnchorPoint(x, y);
};

window.PointProcessor = PointProcessor;