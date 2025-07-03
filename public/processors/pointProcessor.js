class TemplateTracker {
    constructor() {
        this.trackedTemplates = [];
        this.nextId = 1;
        this.templateSize = 21; // Odd number for center pixel
        this.searchRadius = 30;
        this.maxLostFrames = 30;
        this.trailLength = 10;
        this.confidenceThreshold = 0.3;
        this.velocityDecay = 0.85;
        this.frameCount = 0;
    }

    addTemplate(x, y, frameData) {
        const template = this.extractTemplate(x, y, frameData);
        if (!template) return null;

        const trackedTemplate = {
            id: this.nextId++,
            template: template,
            currentPos: { x, y },
            previousPos: { x, y },
            velocity: { x: 0, y: 0 },
            lostFrames: 0,
            trail: [{ x, y }],
            isActive: true,
            confidence: 1.0,
            lastSeen: this.frameCount,
            searchRadius: this.searchRadius
        };

        this.trackedTemplates.push(trackedTemplate);
        return trackedTemplate.id;
    }

    extractTemplate(centerX, centerY, frameData) {
        const { imageData, width, height } = frameData;
        const halfSize = Math.floor(this.templateSize / 2);

        // Check bounds
        if (centerX - halfSize < 0 || centerX + halfSize >= width ||
            centerY - halfSize < 0 || centerY + halfSize >= height) {
            return null;
        }

        const template = new Uint8Array(this.templateSize * this.templateSize);
        let idx = 0;

        for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
            for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
                const pixelIdx = (y * width + x) * 4;
                template[idx++] = this.getGrayscale(imageData.data, pixelIdx);
            }
        }

        return template;
    }

    updateTracking(frameData) {
        this.frameCount++;

        for (let i = this.trackedTemplates.length - 1; i >= 0; i--) {
            const tracker = this.trackedTemplates[i];
            tracker.previousPos = { ...tracker.currentPos };

            // Predict next position
            const predictedPos = {
                x: tracker.currentPos.x + tracker.velocity.x,
                y: tracker.currentPos.y + tracker.velocity.y
            };

            // Find best match using template matching
            let match = this.findBestTemplateMatch(tracker, predictedPos, frameData);

            // If match is poor and we've been tracking successfully, try expanded search
            if ((!match || match.confidence < this.confidenceThreshold) && tracker.lostFrames === 0) {
                const expandedRadius = tracker.searchRadius * 2;
                const oldRadius = tracker.searchRadius;
                tracker.searchRadius = expandedRadius;
                match = this.findBestTemplateMatch(tracker, tracker.currentPos, frameData);
                tracker.searchRadius = oldRadius;
            }

            if (match && match.confidence > this.confidenceThreshold) {
                this.updateTrackerWithMatch(tracker, match, frameData);
            } else {
                this.updateTrackerLost(tracker, predictedPos);
            }

            // Remove inactive trackers
            if (!tracker.isActive) {
                this.trackedTemplates.splice(i, 1);
            }
        }
    }

    findBestTemplateMatch(tracker, predictedPos, frameData) {
        const { imageData, width, height } = frameData;
        const halfTemplate = Math.floor(this.templateSize / 2);
        const searchRadius = Math.min(tracker.searchRadius, 50);

        let bestMatch = null;
        let bestScore = -1;

        // Define search bounds
        const searchLeft = Math.max(halfTemplate, predictedPos.x - searchRadius);
        const searchRight = Math.min(width - halfTemplate - 1, predictedPos.x + searchRadius);
        const searchTop = Math.max(halfTemplate, predictedPos.y - searchRadius);
        const searchBottom = Math.min(height - halfTemplate - 1, predictedPos.y + searchRadius);

        // Search with step size for performance
        const step = Math.max(1, Math.floor(searchRadius / 15));

        for (let y = searchTop; y <= searchBottom; y += step) {
            for (let x = searchLeft; x <= searchRight; x += step) {
                const score = this.normalizedCorrelation(tracker.template, x, y, imageData, width);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { x, y, confidence: score };
                }
            }
        }

        // Refine around best match with finer step
        if (bestMatch && bestScore > 0.5) {
            const refineRadius = step;
            const refineLeft = Math.max(searchLeft, bestMatch.x - refineRadius);
            const refineRight = Math.min(searchRight, bestMatch.x + refineRadius);
            const refineTop = Math.max(searchTop, bestMatch.y - refineRadius);
            const refineBottom = Math.min(searchBottom, bestMatch.y + refineRadius);

            for (let y = refineTop; y <= refineBottom; y++) {
                for (let x = refineLeft; x <= refineRight; x++) {
                    const score = this.normalizedCorrelation(tracker.template, x, y, imageData, width);

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = { x, y, confidence: score };
                    }
                }
            }
        }

        return bestMatch;
    }

    normalizedCorrelation(template, centerX, centerY, imageData, width) {
        const halfSize = Math.floor(this.templateSize / 2);
        let numerator = 0;
        let templateSumSq = 0;
        let imageSumSq = 0;
        let templateSum = 0;
        let imageSum = 0;
        const totalPixels = this.templateSize * this.templateSize;

        // First pass: calculate sums
        let templateIdx = 0;
        for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
            for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
                const pixelIdx = (y * width + x) * 4;
                const templateVal = template[templateIdx++];
                const imageVal = this.getGrayscale(imageData.data, pixelIdx);

                templateSum += templateVal;
                imageSum += imageVal;
            }
        }

        const templateMean = templateSum / totalPixels;
        const imageMean = imageSum / totalPixels;

        // Second pass: normalized correlation
        templateIdx = 0;
        for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
            for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
                const pixelIdx = (y * width + x) * 4;
                const templateVal = template[templateIdx++] - templateMean;
                const imageVal = this.getGrayscale(imageData.data, pixelIdx) - imageMean;

                numerator += templateVal * imageVal;
                templateSumSq += templateVal * templateVal;
                imageSumSq += imageVal * imageVal;
            }
        }

        const denominator = Math.sqrt(templateSumSq * imageSumSq);
        if (denominator < 1e-6) return 0; // Avoid division by zero
        return numerator / denominator;
    }

    updateTrackerWithMatch(tracker, match, frameData) {
        // Smooth position update
        const smoothFactor = 0.3 + 0.4 * tracker.confidence;
        tracker.currentPos = {
            x: tracker.currentPos.x * (1 - smoothFactor) + match.x * smoothFactor,
            y: tracker.currentPos.y * (1 - smoothFactor) + match.y * smoothFactor
        };

        // Update velocity
        const newVelocity = {
            x: tracker.currentPos.x - tracker.previousPos.x,
            y: tracker.currentPos.y - tracker.previousPos.y
        };

        const momentum = 0.3 + 0.4 * tracker.confidence;
        tracker.velocity = {
            x: tracker.velocity.x * momentum + newVelocity.x * (1 - momentum),
            y: tracker.velocity.y * momentum + newVelocity.y * (1 - momentum)
        };

        tracker.lostFrames = 0;
        tracker.confidence = Math.min(1.0, tracker.confidence * 0.98 + match.confidence * 0.02);
        tracker.lastSeen = this.frameCount;

        // Update template periodically to adapt to changes
        if (match.confidence > 0.8 && this.frameCount % 10 === 0) {
            const newTemplate = this.extractTemplate(
                Math.round(tracker.currentPos.x),
                Math.round(tracker.currentPos.y),
                frameData
            );
            if (newTemplate) {
                // Blend old and new template
                for (let i = 0; i < tracker.template.length; i++) {
                    tracker.template[i] = Math.round(tracker.template[i] * 0.9 + newTemplate[i] * 0.1);
                }
            }
        }

        // Adaptive search radius
        tracker.searchRadius = Math.min(50, this.searchRadius + tracker.lostFrames * 2);

        // Update trail
        tracker.trail.push({ ...tracker.currentPos });
        if (tracker.trail.length > this.trailLength) {
            tracker.trail.shift();
        }
    }

    updateTrackerLost(tracker, predictedPos) {
        tracker.currentPos = predictedPos;
        tracker.velocity.x *= this.velocityDecay;
        tracker.velocity.y *= this.velocityDecay;
        tracker.lostFrames++;
        tracker.confidence = Math.max(0.1, tracker.confidence - 0.01);
        tracker.searchRadius = Math.min(60, tracker.searchRadius + 5);

        if (tracker.lostFrames > this.maxLostFrames) {
            tracker.isActive = false;
        }
    }

    getGrayscale(imageData, idx) {
        return 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.8)';
        ctx.fillRect(10, 80, 240, 40);

        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px Arial';
        ctx.fillText(`Template Tracking: ${this.trackedTemplates.length} objects`, 20, 100);

        for (const tracker of this.trackedTemplates) {
            this.drawTracker(ctx, tracker);
        }
    }

    drawTracker(ctx, tracker) {
        const alpha = Math.max(0.3, tracker.confidence);
        ctx.globalAlpha = alpha;

        // Draw trail
        if (tracker.trail.length > 1) {
            ctx.strokeStyle = '#0096ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tracker.trail[0].x, tracker.trail[0].y);
            for (let i = 1; i < tracker.trail.length; i++) {
                const trailAlpha = i / tracker.trail.length;
                ctx.globalAlpha = alpha * trailAlpha;
                ctx.lineTo(tracker.trail[i].x, tracker.trail[i].y);
            }
            ctx.stroke();
        }

        ctx.globalAlpha = alpha;

        // Draw template bounds
        const halfSize = Math.floor(this.templateSize / 2);
        const isLost = tracker.lostFrames > 0;
        ctx.strokeStyle = isLost ? '#ff4444' : '#0096ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            tracker.currentPos.x - halfSize,
            tracker.currentPos.y - halfSize,
            this.templateSize,
            this.templateSize
        );

        // Draw center point
        ctx.fillStyle = isLost ? '#ff4444' : '#0096ff';
        ctx.beginPath();
        ctx.arc(tracker.currentPos.x, tracker.currentPos.y, 3, 0, 2 * Math.PI);
        ctx.fill();

        // Draw ID and confidence
        ctx.fillStyle = isLost ? '#ff4444' : '#0096ff';
        ctx.font = '12px Arial';
        ctx.fillText(
            `${tracker.id} (${(tracker.confidence * 100).toFixed(0)}%)`,
            tracker.currentPos.x + halfSize + 5,
            tracker.currentPos.y - halfSize
        );

        // Draw velocity vector
        const velocityMagnitude = Math.sqrt(tracker.velocity.x ** 2 + tracker.velocity.y ** 2);
        if (velocityMagnitude > 1) {
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tracker.currentPos.x, tracker.currentPos.y);
            ctx.lineTo(
                tracker.currentPos.x + tracker.velocity.x * 5,
                tracker.currentPos.y + tracker.velocity.y * 5
            );
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }
}

const templateTracker = new TemplateTracker();

function PointProcessor(ctx, frameData) {
    templateTracker.updateTracking(frameData);
    templateTracker.draw(ctx);
}

PointProcessor.addAnchorPoint = function (x, y, frameData) {
    return templateTracker.addTemplate(Math.round(x), Math.round(y), frameData);
};

window.PointProcessor = PointProcessor;