// Performance monitoring for mobile optimization
// Tracks loading times and connection quality

class PerformanceMonitor {
    constructor() {
        this.startTime = performance.now();
        this.metrics = {};
        this.init();
    }

    init() {
        // Monitor page load performance
        window.addEventListener('load', () => {
            this.measurePageLoad();
        });

        // Monitor connection quality
        this.monitorConnection();
        
        // Monitor Firebase performance
        this.monitorFirebase();
    }

    measurePageLoad() {
        const loadTime = performance.now() - this.startTime;
        this.metrics.pageLoadTime = loadTime;
        
        console.log(`📊 Page Load Time: ${loadTime.toFixed(2)}ms`);
        
        // Warn if loading is slow (over 3 seconds)
        if (loadTime > 3000) {
            console.warn('⚠️ Slow page load detected. Consider optimizing.');
            this.showSlowConnectionTip();
        }
    }

    monitorConnection() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            this.metrics.connectionType = connection.effectiveType;
            this.metrics.downlink = connection.downlink;
            
            console.log(`📶 Connection: ${connection.effectiveType}, Speed: ${connection.downlink}Mbps`);
            
            // Show tips for slow connections
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                this.showSlowConnectionTip();
            }
        }
    }

    monitorFirebase() {
        // Track Firebase operation times
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const start = performance.now();
            try {
                const response = await originalFetch(...args);
                const duration = performance.now() - start;
                
                if (args[0].includes('firestore') || args[0].includes('firebase')) {
                    console.log(`🔥 Firebase request: ${duration.toFixed(2)}ms`);
                    
                    if (duration > 5000) {
                        console.warn('⚠️ Slow Firebase request detected');
                    }
                }
                
                return response;
            } catch (error) {
                console.error('🔥 Firebase request failed:', error);
                throw error;
            }
        };
    }

    showSlowConnectionTip() {
        // Only show once per session
        if (sessionStorage.getItem('slowConnectionTipShown')) return;
        
        const tip = document.createElement('div');
        tip.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #FFC700;
            color: #333;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            max-width: 90%;
            text-align: center;
        `;
        tip.innerHTML = '📶 Slow connection detected. Try switching to WiFi for better performance.';
        
        document.body.appendChild(tip);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            tip.remove();
        }, 5000);
        
        sessionStorage.setItem('slowConnectionTipShown', 'true');
    }

    // Method to get performance metrics
    getMetrics() {
        return this.metrics;
    }
}

// Initialize performance monitoring
if (typeof window !== 'undefined') {
    window.performanceMonitor = new PerformanceMonitor();
}