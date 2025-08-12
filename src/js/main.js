class TradingBotApp {
    constructor() {
        this.exchangeAPI = null;
        this.tradingStrategy = null;
        this.chartManager = null;
        this.uiManager = null;
        
        this.isInitialized = false;
        this.isRunning = false;
        
        // App state
        this.appState = {
            isConnected: false,
            isTrading: false,
            currentSymbol: 'BTCUSDT',
            currentExchange: 'binance',
            testMode: true
        };
        
        // Event listeners
        this.eventListeners = new Map();
    }

    // Initialize the application
    async initialize() {
        try {
            console.log('Initializing EMA Strategy Trading Bot...');
            
            // Initialize UI Manager first
            this.uiManager = new UIManager();
            this.uiManager.initialize();
            
            // Wait for UI to be ready
            await this.waitForUI();
            
            // Initialize other components
            this.exchangeAPI = new ExchangeAPI();
            this.tradingStrategy = new TradingStrategy();
            this.chartManager = new ChartManager();
            
            // Initialize chart
            this.chartManager.initialize('priceChart');
            
            // Initialize trading strategy
            this.tradingStrategy.initialize(this.exchangeAPI);
            
            // Bind events
            this.bindEvents();
            
            // Start UI updates
            this.uiManager.startUpdates();
            
            this.isInitialized = true;
            console.log('Trading Bot Application initialized successfully');
            
            // Emit initialization complete
            this.emit('appInitialized');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError('Application initialization failed', error.message);
        }
    }

    // Wait for UI to be ready
    waitForUI() {
        return new Promise((resolve) => {
            if (this.uiManager.isInitialized) {
                resolve();
            } else {
                this.uiManager.on('uiInitialized', resolve);
            }
        });
    }

    // Bind application events
    bindEvents() {
        // UI Manager events
        this.uiManager.on('connectRequest', (config) => this.handleConnectRequest(config));
        this.uiManager.on('startTradingRequest', () => this.handleStartTradingRequest());
        this.uiManager.on('stopTradingRequest', () => this.handleStopTradingRequest());
        this.uiManager.on('symbolChange', (symbol) => this.handleSymbolChange(symbol));
        
        // Exchange API events
        this.exchangeAPI.on('connected', (data) => this.handleExchangeConnected(data));
        this.exchangeAPI.on('disconnected', () => this.handleExchangeDisconnected());
        this.exchangeAPI.on('error', (error) => this.handleExchangeError(error));
        this.exchangeAPI.on('kline', (candle) => this.handleNewCandle(candle));
        this.exchangeAPI.on('ticker', (ticker) => this.handleNewTicker(ticker));
        
        // Trading Strategy events
        this.tradingStrategy.on('strategyStarted', () => this.handleStrategyStarted());
        this.tradingStrategy.on('strategyStopped', () => this.handleStrategyStopped());
        this.tradingStrategy.on('analysisUpdate', (analysis) => this.handleAnalysisUpdate(analysis));
        this.tradingStrategy.on('tradeExecuted', (trade) => this.handleTradeExecuted(trade));
        this.tradingStrategy.on('positionClosed', (position) => this.handlePositionClosed(position));
        this.tradingStrategy.on('metricsUpdate', (metrics) => this.handleMetricsUpdate(metrics));
        
        // Chart Manager events
        this.chartManager.on('chartInitialized', () => this.handleChartInitialized());
        this.chartManager.on('crosshairMove', (data) => this.handleCrosshairMove(data));
    }

    // Handle connection request from UI
    async handleConnectRequest(config) {
        try {
            console.log('Connecting to exchange:', config.exchange);
            
            // Update UI status
            this.uiManager.updateConnectionStatus('connecting');
            
            // Store configuration
            this.appState.currentExchange = config.exchange;
            this.appState.currentSymbol = config.symbol;
            this.appState.testMode = config.testMode;
            
            // Connect to exchange
            const success = await this.exchangeAPI.connect(
                config.exchange,
                config.symbol,
                config.apiKey,
                config.apiSecret,
                config.testMode
            );
            
            if (success) {
                this.appState.isConnected = true;
                this.uiManager.updateConnectionStatus('connected');
                this.uiManager.showNotification(`Connected to ${config.exchange} successfully`, 'success');
                
                // Load historical data and update chart
                await this.loadInitialData();
                
            } else {
                throw new Error('Connection failed');
            }
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.uiManager.updateConnectionStatus('error');
            this.uiManager.showNotification(`Connection failed: ${error.message}`, 'error');
        }
    }

    // Handle exchange connected
    handleExchangeConnected(data) {
        console.log('Exchange connected:', data);
        this.appState.isConnected = true;
        
        // Update UI
        this.uiManager.updateConnectionStatus('connected');
        this.uiManager.showNotification(`Connected to ${data.exchange} (${data.testMode ? 'Test Mode' : 'Live Mode'})`, 'success');
    }

    // Handle exchange disconnected
    handleExchangeDisconnected() {
        console.log('Exchange disconnected');
        this.appState.isConnected = false;
        this.appState.isTrading = false;
        
        // Update UI
        this.uiManager.updateConnectionStatus('disconnected');
        this.uiManager.updateTradingStatus('idle');
        
        // Stop trading if active
        if (this.tradingStrategy.isActive) {
            this.tradingStrategy.stop();
        }
        
        this.uiManager.showNotification('Disconnected from exchange', 'warning');
    }

    // Handle exchange error
    handleExchangeError(error) {
        console.error('Exchange error:', error);
        this.uiManager.showNotification(`Exchange error: ${error.message}`, 'error');
    }

    // Handle start trading request
    handleStartTradingRequest() {
        try {
            if (!this.appState.isConnected) {
                this.uiManager.showNotification('Please connect to exchange first', 'warning');
                return;
            }
            
            console.log('Starting trading strategy...');
            this.uiManager.updateTradingStatus('starting');
            
            // Start trading strategy
            this.tradingStrategy.start();
            
            this.appState.isTrading = true;
            this.uiManager.updateTradingStatus('active');
            this.uiManager.showNotification('Trading strategy started', 'success');
            
        } catch (error) {
            console.error('Failed to start trading:', error);
            this.uiManager.updateTradingStatus('idle');
            this.uiManager.showNotification(`Failed to start trading: ${error.message}`, 'error');
        }
    }

    // Handle stop trading request
    handleStopTradingRequest() {
        try {
            console.log('Stopping trading strategy...');
            this.uiManager.updateTradingStatus('stopping');
            
            // Stop trading strategy
            this.tradingStrategy.stop();
            
            this.appState.isTrading = false;
            this.uiManager.updateTradingStatus('idle');
            this.uiManager.showNotification('Trading strategy stopped', 'info');
            
        } catch (error) {
            console.error('Failed to stop trading:', error);
            this.uiManager.showNotification(`Failed to stop trading: ${error.message}`, 'error');
        }
    }

    // Handle symbol change
    handleSymbolChange(symbol) {
        console.log('Symbol changed to:', symbol);
        this.appState.currentSymbol = symbol;
        
        // Reload data for new symbol
        if (this.appState.isConnected) {
            this.loadInitialData();
        }
    }

    // Handle strategy started
    handleStrategyStarted() {
        console.log('Trading strategy started');
        this.uiManager.updateTradingStatus('active');
    }

    // Handle strategy stopped
    handleStrategyStopped() {
        console.log('Trading strategy stopped');
        this.uiManager.updateTradingStatus('idle');
    }

    // Handle analysis update
    handleAnalysisUpdate(analysis) {
        console.log('Strategy analysis:', analysis);
        
        // Update UI with analysis results
        this.uiManager.updateTradingStatusDetails({
            signal: analysis.signal,
            tradingWindow: analysis.trend !== 'N/A',
            nextAnalysis: Date.now() + 10000
        });
        
        // Update chart with pattern markers if signal detected
        if (analysis.signal && analysis.patterns) {
            const currentTime = Date.now();
            analysis.patterns.forEach(pattern => {
                this.chartManager.addPatternMarker(
                    currentTime,
                    pattern,
                    analysis.entryPrice,
                    analysis.signal === 'BUY' ? '#4caf50' : '#f44336'
                );
            });
        }
        
        // Emit analysis event
        this.emit('analysisUpdate', analysis);
    }

    // Handle trade executed
    handleTradeExecuted(trade) {
        console.log('Trade executed:', trade);
        
        // Update UI
        this.uiManager.updateOpenPositions([trade]);
        
        // Show notification
        this.uiManager.showNotification(
            `${trade.side} ${trade.size} ${trade.symbol} at $${trade.entryPrice}`,
            'success'
        );
        
        // Emit trade event
        this.emit('tradeExecuted', trade);
    }

    // Handle position closed
    handlePositionClosed(position) {
        console.log('Position closed:', position);
        
        // Update UI
        this.uiManager.updateOpenPositions([]);
        this.uiManager.updateTradeHistory([position, ...this.tradingStrategy.tradeHistory]);
        
        // Show notification
        const pnlText = position.pnl >= 0 ? `+$${position.pnl.toFixed(2)}` : `-$${Math.abs(position.pnl).toFixed(2)}`;
        this.uiManager.showNotification(
            `Position closed: ${position.exitReason}, P&L: ${pnlText}`,
            position.pnl >= 0 ? 'success' : 'warning'
        );
        
        // Emit position event
        this.emit('positionClosed', position);
    }

    // Handle metrics update
    handleMetricsUpdate(metrics) {
        console.log('Performance metrics updated:', metrics);
        
        // Update UI
        this.uiManager.updatePerformanceMetrics(metrics);
        
        // Emit metrics event
        this.emit('metricsUpdate', metrics);
    }

    // Handle new candle data
    handleNewCandle(candle) {
        // Update chart
        this.chartManager.addCandle(candle);
        
        // Update UI market data
        this.uiManager.updateMarketData({
            price: candle.close,
            volume: candle.volume,
            timestamp: candle.openTime
        });
        
        // Emit candle event
        this.emit('candleUpdate', candle);
    }

    // Handle new ticker data
    handleNewTicker(ticker) {
        // Update UI market data
        this.uiManager.updateMarketData({
            price: ticker.lastPrice,
            change: ticker.priceChangePercent,
            volume: ticker.volume,
            timestamp: Date.now()
        });
        
        // Emit ticker event
        this.emit('tickerUpdate', ticker);
    }

    // Handle chart initialized
    handleChartInitialized() {
        console.log('Chart initialized');
        
        // Load initial data if available
        if (this.appState.isConnected) {
            this.loadInitialData();
        }
    }

    // Handle crosshair move
    handleCrosshairMove(data) {
        // Update tooltip or other UI elements with crosshair data
        if (data.candle) {
            // Could update a tooltip with OHLCV data
        }
    }

    // Load initial data for chart and analysis
    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            
            // Get historical klines
            const klines = await this.exchangeAPI.getHistoricalKlines(
                this.appState.currentSymbol,
                '5m',
                100
            );
            
            // Update chart data
            this.chartManager.candleData = klines;
            this.chartManager.ema9Data = this.tradingStrategy.ema9Data;
            this.chartManager.ema15Data = this.tradingStrategy.ema15Data;
            this.chartManager.volumeData = klines.map(k => k.volume);
            
            // Update chart
            this.chartManager.updateChartData();
            
            // Update UI with initial data
            if (klines.length > 0) {
                const lastCandle = klines[klines.length - 1];
                this.uiManager.updateMarketData({
                    price: lastCandle.close,
                    volume: lastCandle.volume,
                    timestamp: lastCandle.closeTime
                });
            }
            
            console.log('Initial data loaded successfully');
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.uiManager.showNotification('Failed to load initial data', 'error');
        }
    }

    // Get application status
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isRunning: this.isRunning,
            isConnected: this.appState.isConnected,
            isTrading: this.appState.isTrading,
            exchange: this.appState.currentExchange,
            symbol: this.appState.currentSymbol,
            testMode: this.appState.testMode,
            strategy: this.tradingStrategy ? this.tradingStrategy.getStatus() : null
        };
    }

    // Show error message
    showError(title, message) {
        console.error(`${title}: ${message}`);
        
        if (this.uiManager) {
            this.uiManager.showNotification(`${title}: ${message}`, 'error');
        }
    }

    // Start the application
    start() {
        if (!this.isInitialized) {
            console.error('Application not initialized');
            return;
        }
        
        this.isRunning = true;
        console.log('Trading Bot Application started');
        this.emit('appStarted');
    }

    // Stop the application
    stop() {
        if (this.isRunning) {
            // Stop trading if active
            if (this.tradingStrategy && this.tradingStrategy.isActive) {
                this.tradingStrategy.stop();
            }
            
            // Disconnect from exchange
            if (this.exchangeAPI && this.exchangeAPI.isConnected) {
                this.exchangeAPI.disconnect();
            }
            
            this.isRunning = false;
            console.log('Trading Bot Application stopped');
            this.emit('appStopped');
        }
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

    // Cleanup resources
    destroy() {
        try {
            this.stop();
            
            // Cleanup components
            if (this.chartManager) {
                this.chartManager.destroy();
            }
            
            if (this.uiManager) {
                this.uiManager.destroy();
            }
            
            // Clear event listeners
            this.eventListeners.clear();
            
            this.isInitialized = false;
            console.log('Trading Bot Application destroyed');
            
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('DOM loaded, initializing Trading Bot Application...');
        
        // Create and initialize the application
        window.tradingBotApp = new TradingBotApp();
        await window.tradingBotApp.initialize();
        
        // Start the application
        window.tradingBotApp.start();
        
        console.log('Trading Bot Application ready');
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        
        // Show error on page
        document.body.innerHTML = `
            <div class="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <div class="text-center">
                    <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                    <h1 class="text-2xl font-bold mb-2">Application Error</h1>
                    <p class="text-gray-400 mb-4">Failed to initialize the trading bot application</p>
                    <p class="text-sm text-red-400">${error.message}</p>
                    <button onclick="location.reload()" class="mt-6 px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700">
                        Reload Application
                    </button>
                </div>
            </div>
        `;
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.tradingBotApp) {
        window.tradingBotApp.destroy();
    }
});

// Handle window focus/blur for performance
window.addEventListener('focus', () => {
    if (window.tradingBotApp && window.tradingBotApp.isRunning) {
        console.log('Window focused, resuming updates');
    }
});

window.addEventListener('blur', () => {
    if (window.tradingBotApp && window.tradingBotApp.isRunning) {
        console.log('Window blurred, pausing updates');
    }
});

// Export for use in other modules
window.TradingBotApp = TradingBotApp;