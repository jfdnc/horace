window.HoraceUtils = {
    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    lerp: function(start, end, factor) {
        return start + (end - start) * factor;
    },

    distance: function(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    angleBetween: function(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    },

    rgbToGrayscale: function(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    },

    formatTime: function(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
    },

    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};