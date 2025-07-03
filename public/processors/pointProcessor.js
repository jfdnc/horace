class TemplateTracker {
    constructor() {
        this.trackedTemplates = [];
        this.nextId = 1;
        this.templateSize = 31;
        this.searchRadius = 30;
        this.maxLostFrames = 30;
        this.trailLength = 10;
        this.confidenceThreshold = 0.2;
        this.velocityDecay = 0.85;
        this.frameCount = 0;
        this.debugMode = true;

        // Optimization: Pre-allocate reusable objects and arrays
        this.objectPool = {
            positions: [],
            matches: [],
            vectors: []
        };

        // Cache for grayscale conversion
        this.frameCache = {
            width: 0,
            height: 0,
            grayscale: null,
            frameId: -1
        };

        // Spatial grid for efficient neighbor queries
        this.spatialGrid = {
            cellSize: 50,
            grid: new Map(),
            width: 0,
            height: 0
        };

        // SIMD-style processing constants
        this.templateSizeSq = this.templateSize * this.templateSize;
        this.halfSize = Math.floor(this.templateSize / 2);

        // Current frame data for fallback
        this.currentFrameData = null;
    }

    // Object pooling to reduce GC pressure
    getPooledObject(type) {
        const pool = this.objectPool[type];
        return pool.length > 0 ? pool.pop() : {};
    }

    returnPooledObject(type, obj) {
        if (this.objectPool[type].length < 50) { // Limit pool size
            this.objectPool[type].push(obj);
        }
    }

    // Optimized frame data extraction with caching
    getFrameData(frameData) {
        if (frameData.getCanvas) {
            const imageData = frameData.getCurrentImageData();
            if (!imageData) return null;

            return {
                imageData: imageData,
                width: frameData.getCanvas().width,
                height: frameData.getCanvas().height
            };
        }
        return frameData;
    }

    // Precompute grayscale and integral image for entire frame
    prepareFrameOptimizations(frameData) {
        const data = this.getFrameData(frameData);
        if (!data) return false;

        const { imageData, width, height } = data;
        const pixelCount = width * height;

        // Check if we need to update cache
        if (this.frameCache.width !== width || this.frameCache.height !== height) {
            this.frameCache.width = width;
            this.frameCache.height = height;
            this.frameCache.grayscale = new Float32Array(pixelCount);
            this.frameCache.integral = new Uint32Array((width + 1) * (height + 1));
        }

        // Convert to grayscale using EXACT same formula as original
        const rgbaData = imageData.data;
        const grayData = this.frameCache.grayscale;

        // Use same grayscale conversion as original for consistency
        for (let i = 0; i < pixelCount; i++) {
            const j = i * 4;
            grayData[i] = 0.299 * rgbaData[j] + 0.587 * rgbaData[j + 1] + 0.114 * rgbaData[j + 2];
        }

        // Compute integral image for O(1) sum queries
        this.computeIntegralImage(grayData, width, height);

        this.frameCache.frameId = this.frameCount;
        return true;
    }

    // Compute integral image for fast rectangular sum queries
    computeIntegralImage(grayData, width, height) {
        const integral = this.frameCache.integral;
        const integralWidth = width + 1;

        // Clear first row and column
        for (let i = 0; i <= width; i++) integral[i] = 0;
        for (let i = 0; i <= height; i++) integral[i * integralWidth] = 0;

        // Fill integral image
        for (let y = 1; y <= height; y++) {
            for (let x = 1; x <= width; x++) {
                const grayIdx = (y - 1) * width + (x - 1);
                const intIdx = y * integralWidth + x;

                integral[intIdx] = grayData[grayIdx] +
                    integral[intIdx - 1] +
                    integral[intIdx - integralWidth] -
                    integral[intIdx - integralWidth - 1];
            }
        }
    }

    // Fast rectangular sum using integral image
    getRectSum(x1, y1, x2, y2) {
        const integral = this.frameCache.integral;
        const w = this.frameCache.width + 1;

        return integral[y2 * w + x2] -
            integral[y1 * w + x2] -
            integral[y2 * w + x1] +
            integral[y1 * w + x1];
    }

    addTemplate(x, y, frameData) {
        x = Math.round(x);
        y = Math.round(y);

        // Try optimized path first, fallback to original if needed
        let template;
        if (this.prepareFrameOptimizations(frameData)) {
            template = this.extractTemplateOptimized(x, y);
        }

        // Fallback to original method if optimization fails
        if (!template) {
            template = this.extractTemplate(x, y, frameData);
        }

        if (!template) {
            console.warn(`Failed to extract template at (${x}, ${y})`);
            return null;
        }

        const trackedTemplate = {
            id: this.nextId++,
            template: template,
            currentPos: { x, y },
            previousPos: { x, y },
            actualPos: { x, y },
            velocity: { x: 0, y: 0 },
            lostFrames: 0,
            trail: [{ x, y }],
            isActive: true,
            confidence: 1.0,
            lastSeen: this.frameCount,
            searchRadius: this.searchRadius,
            framesSinceUpdate: 0,
            // Optimization: Add spatial grid cell tracking
            gridX: Math.floor(x / this.spatialGrid.cellSize),
            gridY: Math.floor(y / this.spatialGrid.cellSize)
        };

        this.trackedTemplates.push(trackedTemplate);
        this.updateSpatialGrid(trackedTemplate);

        console.log(`Added tracker ${trackedTemplate.id} at (${x}, ${y})`);
        return trackedTemplate.id;
    }

    extractTemplate(centerX, centerY, frameData) {
        const data = this.getFrameData(frameData);
        if (!data) return null;

        const { imageData, width, height } = data;
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

    getGrayscale(imageData, idx) {
        return 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
    }

    extractTemplateOptimized(centerX, centerY) {
        const { width, height, grayscale } = this.frameCache;

        // Check bounds
        if (centerX - this.halfSize < 0 || centerX + this.halfSize >= width ||
            centerY - this.halfSize < 0 || centerY + this.halfSize >= height) {
            return null;
        }

        const template = new Uint8Array(this.templateSizeSq);
        let idx = 0;

        // FIXED: Use correct coordinate iteration like original
        for (let y = centerY - this.halfSize; y <= centerY + this.halfSize; y++) {
            for (let x = centerX - this.halfSize; x <= centerX + this.halfSize; x++) {
                template[idx++] = grayscale[y * width + x];
            }
        }

        return template;
    }

    // Precompute template statistics for faster correlation
    computeTemplateStats(template) {
        let sum = 0;
        let sumSq = 0;

        // Unrolled loop for better performance
        const len = template.length & ~3;
        let i = 0;

        for (; i < len; i += 4) {
            const v1 = template[i], v2 = template[i + 1], v3 = template[i + 2], v4 = template[i + 3];
            sum += v1 + v2 + v3 + v4;
            sumSq += v1 * v1 + v2 * v2 + v3 * v3 + v4 * v4;
        }

        for (; i < template.length; i++) {
            const v = template[i];
            sum += v;
            sumSq += v * v;
        }

        const mean = sum / template.length;
        const variance = sumSq / template.length - mean * mean;

        return { sum, sumSq, mean, variance, stdDev: Math.sqrt(variance) };
    }

    // Spatial grid management for efficient neighbor queries
    updateSpatialGrid(tracker) {
        const cellX = Math.floor(tracker.actualPos.x / this.spatialGrid.cellSize);
        const cellY = Math.floor(tracker.actualPos.y / this.spatialGrid.cellSize);
        const key = `${cellX},${cellY}`;

        if (!this.spatialGrid.grid.has(key)) {
            this.spatialGrid.grid.set(key, new Set());
        }

        // Remove from old cell if moved
        if (tracker.gridX !== cellX || tracker.gridY !== cellY) {
            const oldKey = `${tracker.gridX},${tracker.gridY}`;
            const oldCell = this.spatialGrid.grid.get(oldKey);
            if (oldCell) {
                oldCell.delete(tracker.id);
                if (oldCell.size === 0) {
                    this.spatialGrid.grid.delete(oldKey);
                }
            }
        }

        this.spatialGrid.grid.get(key).add(tracker.id);
        tracker.gridX = cellX;
        tracker.gridY = cellY;
    }

    updateTracking(frameData) {
        this.frameCount++;

        // Store frame data for fallback use
        this.currentFrameData = frameData;

        // Try optimized path, fallback gracefully if needed
        this.prepareFrameOptimizations(frameData);

        // Process trackers in batches to improve cache locality
        const batchSize = 4;
        for (let batchStart = 0; batchStart < this.trackedTemplates.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, this.trackedTemplates.length);

            for (let i = batchStart; i < batchEnd; i++) {
                if (i >= this.trackedTemplates.length) break;

                const tracker = this.trackedTemplates[i];
                this.updateSingleTracker(tracker, frameData);
            }
        }

        // Remove inactive trackers (backwards iteration)
        for (let i = this.trackedTemplates.length - 1; i >= 0; i--) {
            if (!this.trackedTemplates[i].isActive) {
                const removed = this.trackedTemplates.splice(i, 1)[0];
                this.removeSpatialGridEntry(removed);
                console.log(`Removed tracker ${removed.id}`);
            }
        }
    }

    updateSingleTracker(tracker, frameData) {
        // Store previous actual position for velocity calculation
        const prevPos = this.getPooledObject('positions');
        prevPos.x = tracker.actualPos.x;
        prevPos.y = tracker.actualPos.y;

        // Predict next position using velocity
        const predictedPos = this.getPooledObject('positions');
        predictedPos.x = tracker.actualPos.x + tracker.velocity.x;
        predictedPos.y = tracker.actualPos.y + tracker.velocity.y;

        // Find best match using optimized template matching
        let match = this.findBestTemplateMatchOptimized(tracker, predictedPos);

        // If match is poor, try wider search from current position
        if ((!match || match.confidence < this.confidenceThreshold) && tracker.lostFrames < 5) {
            const expandedRadius = tracker.searchRadius * 1.5;
            const oldRadius = tracker.searchRadius;
            tracker.searchRadius = expandedRadius;

            this.returnPooledObject('positions', predictedPos);
            const currentPos = this.getPooledObject('positions');
            currentPos.x = tracker.actualPos.x;
            currentPos.y = tracker.actualPos.y;

            match = this.findBestTemplateMatchOptimized(tracker, currentPos);
            tracker.searchRadius = oldRadius;

            this.returnPooledObject('positions', currentPos);

            if (this.debugMode && match) {
                console.log(`Tracker ${tracker.id}: Found with expanded search, confidence: ${match.confidence.toFixed(3)}`);
            }
        } else {
            this.returnPooledObject('positions', predictedPos);
        }

        if (match && match.confidence > this.confidenceThreshold) {
            this.updateTrackerWithMatchOptimized(tracker, match, prevPos, frameData);
        } else {
            this.updateTrackerLostOptimized(tracker, prevPos);
        }

        this.returnPooledObject('positions', prevPos);
        if (match) this.returnPooledObject('matches', match);
    }

    findBestTemplateMatchOptimized(tracker, centerPos) {
        const searchRadius = Math.min(tracker.searchRadius, 50);
        const searchCenterX = Math.round(centerPos.x);
        const searchCenterY = Math.round(centerPos.y);

        // Try optimized path if frame cache is available
        if (this.frameCache.frameId === this.frameCount && this.frameCache.grayscale) {
            return this.findBestMatchWithCache(tracker, searchCenterX, searchCenterY, searchRadius);
        }

        // Fallback to original method
        return this.findBestTemplateMatch(tracker, centerPos, this.getFrameData(this.currentFrameData));
    }

    findBestMatchWithCache(tracker, searchCenterX, searchCenterY, searchRadius) {
        const { width, height } = this.frameCache;

        // Define search bounds
        const searchLeft = Math.max(this.halfSize, searchCenterX - searchRadius);
        const searchRight = Math.min(width - this.halfSize - 1, searchCenterX + searchRadius);
        const searchTop = Math.max(this.halfSize, searchCenterY - searchRadius);
        const searchBottom = Math.min(height - this.halfSize - 1, searchCenterY + searchRadius);

        let bestMatch = null;
        let bestScore = -1;

        // Adaptive step size based on search radius
        const step = Math.max(1, Math.floor(searchRadius / 20));

        // Coarse search with early termination
        let searchCount = 0;
        const area = (searchRight - searchLeft + 1) * (searchBottom - searchTop + 1);
        const maxSearches = area;            // examine the whole window
        // or
        // const maxSearches = Math.min(area, 4000); // sensible upper bound for very big windows

        for (let y = searchTop; y <= searchBottom && searchCount < maxSearches; y += step) {
            for (let x = searchLeft; x <= searchRight && searchCount < maxSearches; x += step) {
                searchCount++;

                const score = this.fastTemplateMatch(tracker, x, y);

                if (score > bestScore) {
                    bestScore = score;
                    if (!bestMatch) bestMatch = this.getPooledObject('matches');
                    bestMatch.x = x;
                    bestMatch.y = y;
                    bestMatch.confidence = score;

                    // Early termination for very good matches
                    if (score > 0.9) break;
                }
            }
        }

        // Fine search around best match
        if (bestMatch && bestScore > 0.3) {
            const refineRadius = Math.max(2, step);
            const refineLeft = Math.max(searchLeft, bestMatch.x - refineRadius);
            const refineRight = Math.min(searchRight, bestMatch.x + refineRadius);
            const refineTop = Math.max(searchTop, bestMatch.y - refineRadius);
            const refineBottom = Math.min(searchBottom, bestMatch.y + refineRadius);

            for (let y = refineTop; y <= refineBottom; y++) {
                for (let x = refineLeft; x <= refineRight; x++) {
                    const score = this.fastTemplateMatch(tracker, x, y);

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch.x = x;
                        bestMatch.y = y;
                        bestMatch.confidence = score;
                    }
                }
            }
        }

        if (this.debugMode && bestMatch) {
            console.log(`Tracker ${tracker.id}: Best match at (${bestMatch.x}, ${bestMatch.y}) with confidence ${bestScore.toFixed(3)}`);
        }

        return bestMatch;
    }

    // Original template matching method as fallback
    findBestTemplateMatch(tracker, centerPos, frameData) {
        const data = frameData;
        if (!data) return null;

        const { imageData, width, height } = data;
        const halfTemplate = Math.floor(this.templateSize / 2);
        const searchRadius = Math.min(tracker.searchRadius, 50);

        // Round center position for search
        const searchCenterX = Math.round(centerPos.x);
        const searchCenterY = Math.round(centerPos.y);

        // Define search bounds
        const searchLeft = Math.max(halfTemplate, searchCenterX - searchRadius);
        const searchRight = Math.min(width - halfTemplate - 1, searchCenterX + searchRadius);
        const searchTop = Math.max(halfTemplate, searchCenterY - searchRadius);
        const searchBottom = Math.min(height - halfTemplate - 1, searchCenterY + searchRadius);

        let bestMatch = null;
        let bestScore = -1;

        // Adaptive step size based on search radius
        const step = Math.max(1, Math.floor(searchRadius / 20));

        // Coarse search
        for (let y = searchTop; y <= searchBottom; y += step) {
            for (let x = searchLeft; x <= searchRight; x += step) {
                const score = this.normalizedCorrelation(tracker.template, x, y, imageData, width);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { x, y, confidence: score };
                }
            }
        }

        // Fine search around best match
        if (bestMatch && bestScore > 0.3) {
            const refineRadius = Math.max(2, step);
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

        // Ensure we're working with integer coordinates
        centerX = Math.round(centerX);
        centerY = Math.round(centerY);

        let templateSum = 0;
        let imageSum = 0;
        let templateSqSum = 0;
        let imageSqSum = 0;
        let crossSum = 0;
        const n = this.templateSize * this.templateSize;

        // Single pass computation
        let templateIdx = 0;
        for (let y = centerY - halfSize; y <= centerY + halfSize; y++) {
            for (let x = centerX - halfSize; x <= centerX + halfSize; x++) {
                const pixelIdx = (y * width + x) * 4;
                const templateVal = template[templateIdx++];
                const imageVal = this.getGrayscale(imageData.data, pixelIdx);

                templateSum += templateVal;
                imageSum += imageVal;
                templateSqSum += templateVal * templateVal;
                imageSqSum += imageVal * imageVal;
                crossSum += templateVal * imageVal;
            }
        }

        // Calculate normalized cross-correlation
        const templateMean = templateSum / n;
        const imageMean = imageSum / n;

        const templateVar = templateSqSum / n - templateMean * templateMean;
        const imageVar = imageSqSum / n - imageMean * imageMean;
        const covar = crossSum / n - templateMean * imageMean;

        if (templateVar <= 0 || imageVar <= 0) return 0;

        return covar / Math.sqrt(templateVar * imageVar);
    }

    // Optimized template matching using same algorithm as original but with cached grayscale
    fastTemplateMatch(tracker, centerX, centerY) {
        const { width, grayscale } = this.frameCache;
        const template = tracker.template;

        centerX = Math.round(centerX);
        centerY = Math.round(centerY);

        let templateSum = 0;
        let imageSum = 0;
        let templateSqSum = 0;
        let imageSqSum = 0;
        let crossSum = 0;
        const n = this.templateSizeSq;

        // Single pass computation - same as original but using cached grayscale
        let templateIdx = 0;
        for (let y = centerY - this.halfSize; y <= centerY + this.halfSize; y++) {
            for (let x = centerX - this.halfSize; x <= centerX + this.halfSize; x++) {
                const templateVal = template[templateIdx++];
                const imageVal = grayscale[y * width + x];

                templateSum += templateVal;
                imageSum += imageVal;
                templateSqSum += templateVal * templateVal;
                imageSqSum += imageVal * imageVal;
                crossSum += templateVal * imageVal;
            }
        }

        // Calculate normalized cross-correlation - EXACT same as original
        const templateMean = templateSum / n;
        const imageMean = imageSum / n;

        const templateVar = templateSqSum / n - templateMean * templateMean;
        const imageVar = imageSqSum / n - imageMean * imageMean;
        const covar = crossSum / n - templateMean * imageMean;

        if (templateVar <= 0 || imageVar <= 0) return 0;

        return covar / Math.sqrt(templateVar * imageVar);
    }

    updateTrackerWithMatchOptimized(tracker, match, prevPos, frameData) {
        // Update actual position
        tracker.actualPos.x = match.x;
        tracker.actualPos.y = match.y;

        // Calculate velocity from actual positions
        const newVelocity = this.getPooledObject('vectors');
        newVelocity.x = tracker.actualPos.x - prevPos.x;
        newVelocity.y = tracker.actualPos.y - prevPos.y;

        // Update velocity with momentum
        const velocityMomentum = 0.7;
        tracker.velocity.x = tracker.velocity.x * velocityMomentum + newVelocity.x * (1 - velocityMomentum);
        tracker.velocity.y = tracker.velocity.y * velocityMomentum + newVelocity.y * (1 - velocityMomentum);

        this.returnPooledObject('vectors', newVelocity);

        // Update display position with smoothing
        const positionSmoothing = 0.5;
        tracker.currentPos.x = tracker.currentPos.x * (1 - positionSmoothing) + tracker.actualPos.x * positionSmoothing;
        tracker.currentPos.y = tracker.currentPos.y * (1 - positionSmoothing) + tracker.actualPos.y * positionSmoothing;

        // Update tracking state
        tracker.lostFrames = 0;
        tracker.confidence = Math.min(1.0, tracker.confidence * 0.95 + match.confidence * 0.05);
        tracker.lastSeen = this.frameCount;
        tracker.framesSinceUpdate++;

        // Adaptive template update
        const shouldUpdate = (
            tracker.framesSinceUpdate >= 5 &&
            match.confidence > 0.6
        );

        if (shouldUpdate) {
            const newTemplate = this.extractTemplateOptimized(tracker.actualPos.x, tracker.actualPos.y);

            if (newTemplate) {
                const blendFactor = 0.15 * match.confidence;

                // Optimized template blending
                const len = tracker.template.length & ~3;
                let i = 0;

                for (; i < len; i += 4) {
                    tracker.template[i] = Math.round(tracker.template[i] * (1 - blendFactor) + newTemplate[i] * blendFactor);
                    tracker.template[i + 1] = Math.round(tracker.template[i + 1] * (1 - blendFactor) + newTemplate[i + 1] * blendFactor);
                    tracker.template[i + 2] = Math.round(tracker.template[i + 2] * (1 - blendFactor) + newTemplate[i + 2] * blendFactor);
                    tracker.template[i + 3] = Math.round(tracker.template[i + 3] * (1 - blendFactor) + newTemplate[i + 3] * blendFactor);
                }

                for (; i < tracker.template.length; i++) {
                    tracker.template[i] = Math.round(tracker.template[i] * (1 - blendFactor) + newTemplate[i] * blendFactor);
                }

                // Recompute template statistics
                tracker.templateStats = this.computeTemplateStats(tracker.template);
                tracker.framesSinceUpdate = 0;

                if (this.debugMode) {
                    console.log(`Tracker ${tracker.id}: Updated template with blend factor ${blendFactor.toFixed(3)}`);
                }
            }
        }

        // Update spatial grid
        this.updateSpatialGrid(tracker);

        // Adaptive search radius
        tracker.searchRadius = Math.max(15, this.searchRadius - tracker.confidence * 10);

        // Update trail efficiently
        if (tracker.trail.length >= this.trailLength) {
            // Reuse array elements instead of shift/push
            for (let i = 0; i < this.trailLength - 1; i++) {
                tracker.trail[i].x = tracker.trail[i + 1].x;
                tracker.trail[i].y = tracker.trail[i + 1].y;
            }
            tracker.trail[this.trailLength - 1].x = tracker.currentPos.x;
            tracker.trail[this.trailLength - 1].y = tracker.currentPos.y;
        } else {
            tracker.trail.push({ x: tracker.currentPos.x, y: tracker.currentPos.y });
        }
    }

    updateTrackerLostOptimized(tracker, prevPos) {
        // Update positions using previous position
        tracker.actualPos.x = prevPos.x + tracker.velocity.x;
        tracker.actualPos.y = prevPos.y + tracker.velocity.y;
        tracker.currentPos.x = tracker.actualPos.x;
        tracker.currentPos.y = tracker.actualPos.y;

        // Decay velocity
        tracker.velocity.x *= this.velocityDecay;
        tracker.velocity.y *= this.velocityDecay;

        // Update state
        tracker.lostFrames++;
        tracker.confidence = Math.max(0.1, tracker.confidence - 0.02);
        tracker.searchRadius = Math.min(60, tracker.searchRadius + 3);

        if (this.debugMode && tracker.lostFrames === 1) {
            console.log(`Tracker ${tracker.id}: Lost tracking`);
        }

        if (tracker.lostFrames > this.maxLostFrames) {
            tracker.isActive = false;
        }
    }

    removeSpatialGridEntry(tracker) {
        const key = `${tracker.gridX},${tracker.gridY}`;
        const cell = this.spatialGrid.grid.get(key);
        if (cell) {
            cell.delete(tracker.id);
            if (cell.size === 0) {
                this.spatialGrid.grid.delete(key);
            }
        }
    }

    // Keep existing drawing methods unchanged for API compatibility
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
        const isLost = tracker.lostFrames > 0;
        ctx.strokeStyle = isLost ? '#ff4444' : '#0096ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            tracker.currentPos.x - this.halfSize,
            tracker.currentPos.y - this.halfSize,
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
            tracker.currentPos.x + this.halfSize + 5,
            tracker.currentPos.y - this.halfSize
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
    return templateTracker.addTemplate(x, y, frameData);
};

window.PointProcessor = PointProcessor;