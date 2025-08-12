class ChartManager {
    constructor() {
        this.chartContainer = null;
        this.chart = null;
        this.isInitialized = false;
        
        // Chart data
        this.candleData = [];
        this.ema9Data = [];
        this.ema15Data = [];
        this.volumeData = [];
        
        // Chart options
        this.chartOptions = {
            width: 600,
            height: 400,
            layout: {
                backgroundColor: '#1a1a1a',
                textColor: '#ffffff'
            },
            grid: {
                vertLines: { color: '#333333' },
                horzLines: { color: '#333333' }
            },
            crosshair: {
                mode: 1
            },
            rightPriceScale: {
                borderColor: '#333333',
                textColor: '#ffffff'
            },
            timeScale: {
                borderColor: '#333333',
                textColor: '#ffffff',
                timeVisible: true,
                secondsVisible: false
            },
            watermark: {
                visible: true,
                fontSize: 24,
                text: 'EMA Strategy Bot',
                color: 'rgba(255, 255, 255, 0.1)',
                horzAlign: 'center',
                vertAlign: 'center'
            }
        };
        
        // Chart series
        this.candlestickSeries = null;
        this.ema9Series = null;
        this.ema15Series = null;
        this.volumeSeries = null;
        
        // Event listeners
        this.eventListeners = new Map();
    }

    // Initialize chart
    initialize(containerId) {
        try {
            this.chartContainer = document.getElementById(containerId);
            if (!this.chartContainer) {
                throw new Error(`Chart container not found: ${containerId}`);
            }

            // Check if TradingView Lightweight Charts is available
            if (typeof LightweightCharts === 'undefined') {
                this.loadTradingViewLibrary();
                return;
            }

            this.createChart();
            this.isInitialized = true;
            
            console.log('Chart manager initialized');
            this.emit('chartInitialized');
            
        } catch (error) {
            console.error('Failed to initialize chart:', error);
            this.showChartError(error.message);
        }
    }

    // Load TradingView Lightweight Charts library
    loadTradingViewLibrary() {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js';
        script.onload = () => {
            console.log('TradingView library loaded');
            this.createChart();
        };
        script.onerror = () => {
            console.error('Failed to load TradingView library');
            this.showChartError('Failed to load chart library');
        };
        document.head.appendChild(script);
    }

    // Create chart
    createChart() {
        try {
            // Create chart instance
            this.chart = LightweightCharts.createChart(this.chartContainer, this.chartOptions);
            
            // Create candlestick series
            this.candlestickSeries = this.chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350'
            });
            
            // Create EMA series
            this.ema9Series = this.chart.addLineSeries({
                color: '#ff9800',
                lineWidth: 2,
                title: '9 EMA'
            });
            
            this.ema15Series = this.chart.addLineSeries({
                color: '#2196f3',
                lineWidth: 2,
                title: '15 EMA'
            });
            
            // Create volume series
            this.volumeSeries = this.chart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: {
                    type: 'volume'
                },
                priceScaleId: 'volume',
                scaleMargins: {
                    top: 0.8,
                    bottom: 0
                }
            });
            
            // Set volume scale
            this.chart.priceScale('volume').applyOptions({
                scaleMargins: {
                    top: 0.8,
                    bottom: 0
                }
            });
            
            // Handle chart events
            this.chart.subscribeCrosshairMove((param) => {
                this.onCrosshairMove(param);
            });
            
            // Set initial data if available
            if (this.candleData.length > 0) {
                this.updateChartData();
            }
            
            console.log('Chart created successfully');
            
        } catch (error) {
            console.error('Failed to create chart:', error);
            this.showChartError('Failed to create chart');
        }
    }

    // Update chart with new data
    updateChartData() {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            // Update candlestick data
            if (this.candleData.length > 0) {
                const formattedCandles = this.candleData.map(candle => ({
                    time: Math.floor(candle.openTime / 1000),
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close
                }));
                
                this.candlestickSeries.setData(formattedCandles);
            }
            
            // Update EMA data
            if (this.ema9Data.length > 0) {
                const formattedEMA9 = this.ema9Data.map((value, index) => ({
                    time: Math.floor(this.candleData[index]?.openTime / 1000) || Date.now() / 1000,
                    value: value
                }));
                
                this.ema9Series.setData(formattedEMA9);
            }
            
            if (this.ema15Data.length > 0) {
                const formattedEMA15 = this.ema15Data.map((value, index) => ({
                    time: Math.floor(this.candleData[index]?.openTime / 1000) || Date.now() / 1000,
                    value: value
                }));
                
                this.ema15Series.setData(formattedEMA15);
            }
            
            // Update volume data
            if (this.volumeData.length > 0) {
                const formattedVolume = this.volumeData.map((volume, index) => ({
                    time: Math.floor(this.candleData[index]?.openTime / 1000) || Date.now() / 1000,
                    value: volume,
                    color: this.candleData[index]?.close > this.candleData[index]?.open ? '#26a69a' : '#ef5350'
                }));
                
                this.volumeSeries.setData(formattedVolume);
            }
            
            // Fit content to view
            this.chart.timeScale().fitContent();
            
        } catch (error) {
            console.error('Failed to update chart data:', error);
        }
    }

    // Add new candle to chart
    addCandle(candle) {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            const formattedCandle = {
                time: Math.floor(candle.openTime / 1000),
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
            };
            
            this.candlestickSeries.update(formattedCandle);
            
            // Update volume
            const volumeBar = {
                time: Math.floor(candle.openTime / 1000),
                value: candle.volume,
                color: candle.close > candle.open ? '#26a69a' : '#ef5350'
            };
            
            this.volumeSeries.update(volumeBar);
            
        } catch (error) {
            console.error('Failed to add candle to chart:', error);
        }
    }

    // Update EMA values on chart
    updateEMA(ema9, ema15) {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            if (this.candleData.length > 0) {
                const currentTime = Math.floor(this.candleData[this.candleData.length - 1].openTime / 1000);
                
                if (ema9 !== undefined) {
                    this.ema9Series.update({
                        time: currentTime,
                        value: ema9
                    });
                }
                
                if (ema15 !== undefined) {
                    this.ema15Series.update({
                        time: currentTime,
                        value: ema15
                    });
                }
            }
        } catch (error) {
            console.error('Failed to update EMA on chart:', error);
        }
    }

    // Add pattern markers to chart
    addPatternMarker(time, pattern, price, color = '#ffeb3b') {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            const marker = {
                time: Math.floor(time / 1000),
                position: 'belowBar',
                color: color,
                shape: 'arrowUp',
                text: pattern
            };
            
            this.candlestickSeries.setMarkers([marker]);
            
        } catch (error) {
            console.error('Failed to add pattern marker:', error);
        }
    }

    // Add support/resistance levels
    addSupportResistance(levels) {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            levels.forEach(level => {
                const line = this.chart.addLineSeries({
                    color: level.type === 'support' ? '#4caf50' : '#f44336',
                    lineWidth: 1,
                    lineStyle: 2, // Dashed line
                    title: `${level.type.toUpperCase()}: $${level.price}`
                });
                
                if (this.candleData.length > 0) {
                    const startTime = Math.floor(this.candleData[0].openTime / 1000);
                    const endTime = Math.floor(this.candleData[this.candleData.length - 1].openTime / 1000);
                    
                    line.setData([
                        { time: startTime, value: level.price },
                        { time: endTime, value: level.price }
                    ]);
                }
            });
            
        } catch (error) {
            console.error('Failed to add support/resistance levels:', error);
        }
    }

    // Handle crosshair movement
    onCrosshairMove(param) {
        if (param.time) {
            const data = param.seriesData;
            const candleData = data.get(this.candlestickSeries);
            const ema9Data = data.get(this.ema9Series);
            const ema15Data = data.get(this.ema15Series);
            const volumeData = data.get(this.volumeSeries);
            
            // Emit crosshair data
            this.emit('crosshairMove', {
                time: param.time,
                candle: candleData,
                ema9: ema9Data,
                ema15: ema15Data,
                volume: volumeData
            });
        }
    }

    // Set chart time range
    setTimeRange(from, to) {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            this.chart.timeScale().setVisibleRange({
                from: Math.floor(from / 1000),
                to: Math.floor(to / 1000)
            });
        } catch (error) {
            console.error('Failed to set time range:', error);
        }
    }

    // Zoom chart
    zoomChart(scale) {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            this.chart.timeScale().applyOptions({
                rightOffset: 0,
                barSpacing: scale
            });
        } catch (error) {
            console.error('Failed to zoom chart:', error);
        }
    }

    // Fit chart content
    fitContent() {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            this.chart.timeScale().fitContent();
        } catch (error) {
            console.error('Failed to fit content:', error);
        }
    }

    // Export chart as image
    exportChart() {
        if (!this.isInitialized || !this.chart) return null;
        
        try {
            return this.chart.takeScreenshot();
        } catch (error) {
            console.error('Failed to export chart:', error);
            return null;
        }
    }

    // Show chart error
    showChartError(message) {
        if (this.chartContainer) {
            this.chartContainer.innerHTML = `
                <div class="flex items-center justify-center h-full text-red-400">
                    <div class="text-center">
                        <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
                        <p class="text-lg font-semibold">Chart Error</p>
                        <p class="text-sm text-gray-400">${message}</p>
                        <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
                            Retry
                        </button>
                    </div>
                </div>
            `;
        }
    }

    // Update chart theme
    updateTheme(isDark = true) {
        if (!this.isInitialized || !this.chart) return;
        
        try {
            const theme = isDark ? {
                backgroundColor: '#1a1a1a',
                textColor: '#ffffff',
                gridColor: '#333333'
            } : {
                backgroundColor: '#ffffff',
                textColor: '#000000',
                gridColor: '#e0e0e0'
            };
            
            this.chart.applyOptions({
                layout: {
                    backgroundColor: theme.backgroundColor,
                    textColor: theme.textColor
                },
                grid: {
                    vertLines: { color: theme.gridColor },
                    horzLines: { color: theme.gridColor }
                },
                rightPriceScale: {
                    borderColor: theme.gridColor,
                    textColor: theme.textColor
                },
                timeScale: {
                    borderColor: theme.gridColor,
                    textColor: theme.textColor
                }
            });
            
        } catch (error) {
            console.error('Failed to update chart theme:', error);
        }
    }

    // Destroy chart
    destroy() {
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        
        this.isInitialized = false;
        console.log('Chart destroyed');
    }

    // Event handling
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    // Remove event listener
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
}

// Export for use in other modules
window.ChartManager = ChartManager;