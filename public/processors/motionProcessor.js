function MotionProcessor(ctx, frameData) {
    if (!frameData.previousImageData) {
        return;
    }

    const currentData = frameData.imageData.data;
    const previousData = frameData.previousImageData.data;
    const width = frameData.width;
    const height = frameData.height;
    
    let motionPixels = 0;
    const threshold = 30;
    const motionAreas = [];
    
    for (let i = 0; i < currentData.length; i += 4) {
        const currentR = currentData[i];
        const currentG = currentData[i + 1];
        const currentB = currentData[i + 2];
        
        const previousR = previousData[i];
        const previousG = previousData[i + 1];
        const previousB = previousData[i + 2];
        
        const diffR = Math.abs(currentR - previousR);
        const diffG = Math.abs(currentG - previousG);
        const diffB = Math.abs(currentB - previousB);
        
        const totalDiff = (diffR + diffG + diffB) / 3;
        
        if (totalDiff > threshold) {
            motionPixels++;
            
            const pixelIndex = i / 4;
            const x = pixelIndex % width;
            const y = Math.floor(pixelIndex / width);
            
            if (Math.random() < 0.01) {
                motionAreas.push({ x, y });
            }
        }
    }
    
    const motionPercentage = (motionPixels / (width * height)) * 100;
    
    ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
    ctx.fillRect(10, 10, 200, 60);
    
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '14px Arial';
    ctx.fillText(`Motion: ${motionPercentage.toFixed(2)}%`, 20, 30);
    ctx.fillText(`Pixels: ${motionPixels}`, 20, 50);
    
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    
    for (const area of motionAreas) {
        ctx.beginPath();
        ctx.arc(area.x, area.y, 3, 0, 2 * Math.PI);
        ctx.stroke();
    }
    
    if (motionPercentage > 1) {
        ctx.strokeStyle = '#ff0088';
        ctx.lineWidth = 3;
        ctx.strokeRect(5, 5, width - 10, height - 10);
    }
}

MotionProcessor.clear = function() {
    console.log('Motion processor data cleared');
};

window.MotionProcessor = MotionProcessor;