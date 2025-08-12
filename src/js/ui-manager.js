class UIManager {
    constructor() {
        this.elements = {};
        this.isInitialized = false;
        
        // UI state
        this.uiState = {
            isConnected: false,
            isTrading: false,
            currentPrice: 0,
            lastUpdate: null,
            connectionStatus: 'Disconnected',
            tradingStatus: 'Idle'
        };
        
        // Update intervals
        this.updateIntervals = new Map();
        
        // Event listeners
        this.eventListeners = new Map();
    }

    // Initialize UI manager
    initialize() {
        try {
            this.cacheElements();
            this.bindEvents();
            this.initializeUI();
            this.isInitialized = true;
            
            console.log('UI Manager initialized');
            this.emit('uiInitialized');
            
        } catch (error) {
            console.error('Failed to initialize UI Manager:', error);
        }
    }

    // Cache DOM elements
    cacheElements() {
        // Connection elements
        this.elements.connectionStatus = document.getElementById('connectionStatus');
        this.elements.connectionText = document.getElementById('connectionText');
        this.elements.connectBtn = document.getElementById('connectBtn');
        this.elements.startTradingBtn = document.getElementById('startTradingBtn');
        this.elements.stopTradingBtn = document.getElementById('stopTradingBtn');
        
        // API configuration elements
        this.elements.exchangeSelect = document.getElementById('exchangeSelect');
        this.elements.symbolSelect = document.getElementById('symbolSelect');
        this.elements.apiKeyInput = document.getElementById('apiKeyInput');
        this.elements.apiSecretInput = document.getElementById('apiSecretInput');
        this.elements.testModeCheckbox = document.getElementById('testModeCheckbox');
        this.elements.toggleApiKey = document.getElementById('toggleApiKey');
        this.elements.toggleApiSecret = document.getElementById('toggleApiSecret');
        
        // Market data elements
        this.elements.currentPrice = document.getElementById('currentPrice');
        this.elements.priceChange = document.getElementById('priceChange');
        this.elements.currentVolume = document.getElementById('currentVolume');
        this.elements.lastUpdate = document.getElementById('lastUpdate');
        
        // EMA elements
        this.elements.ema9Value = document.getElementById('ema9Value');
        this.elements.ema15Value = document.getElementById('ema15Value');
        this.elements.trendDirection = document.getElementById('trendDirection');
        this.elements.trendStrength = document.getElementById('trendStrength');
        
        // Trading status elements
        this.elements.botStatus = document.getElementById('botStatus');
        this.elements.lastSignal = document.getElementById('lastSignal');
        this.elements.tradingWindow = document.getElementById('tradingWindow');
        this.elements.nextAnalysis = document.getElementById('nextAnalysis');
        
        // Performance elements
        this.elements.totalProfit = document.getElementById('totalProfit');
        this.elements.winRate = document.getElementById('winRate');
        this.elements.totalTrades = document.getElementById('totalTrades');
        this.elements.avgReturn = document.getElementById('avgReturn');
        
        // Position and trade elements
        this.elements.openPositions = document.getElementById('openPositions');
        this.elements.tradeHistory = document.getElementById('tradeHistory');
        
        // Main app elements
        this.elements.loadingScreen = document.getElementById('loadingScreen');
        this.elements.mainApp = document.getElementById('mainApp');
        
        // Validate required elements
        this.validateElements();
    }

    // Validate required elements exist
    validateElements() {
        const requiredElements = [
            'connectionStatus', 'connectionText', 'connectBtn', 'startTradingBtn', 'stopTradingBtn',
            'exchangeSelect', 'symbolSelect', 'apiKeyInput', 'apiSecretInput', 'testModeCheckbox',
            'currentPrice', 'priceChange', 'currentVolume', 'lastUpdate',
            'ema9Value', 'ema15Value', 'trendDirection', 'trendStrength',
            'botStatus', 'lastSignal', 'tradingWindow', 'nextAnalysis',
            'totalProfit', 'winRate', 'totalTrades', 'avgReturn',
            'openPositions', 'tradeHistory', 'loadingScreen', 'mainApp'
        ];
        
        const missingElements = requiredElements.filter(id => !this.elements[id]);
        if (missingElements.length > 0) {
            throw new Error(`Missing required elements: ${missingElements.join(', ')}`);
        }
    }

    // Bind event handlers
    bindEvents() {
        // Connection button events
        this.elements.connectBtn.addEventListener('click', () => this.onConnectClick());
        this.elements.startTradingBtn.addEventListener('click', () => this.onStartTradingClick());
        this.elements.stopTradingBtn.addEventListener('click', () => this.onStopTradingClick());
        
        // API configuration events
        this.elements.toggleApiKey.addEventListener('click', () => this.toggleApiKeyVisibility());
        this.elements.toggleApiSecret.addEventListener('click', () => this.toggleApiSecretVisibility());
        this.elements.exchangeSelect.addEventListener('change', () => this.onExchangeChange());
        this.elements.symbolSelect.addEventListener('change', () => this.onSymbolChange());
        
        // Form validation
        this.elements.apiKeyInput.addEventListener('input', () => this.validateForm());
        this.elements.apiSecretInput.addEventListener('input', () => this.validateForm());
    }

    // Initialize UI state
    initializeUI() {
        // Hide main app initially
        this.elements.mainApp.classList.add('hidden');
        
        // Set initial states
        this.updateConnectionStatus('disconnected');
        this.updateTradingStatus('idle');
        this.updateMarketData({ price: 0, change: 0, volume: 0 });
        this.updateEMA({ ema9: 0, ema15: 0 });
        this.updatePerformanceMetrics({ totalProfit: 0, winRate: 0, totalTrades: 0, avgReturn: 0 });
        
        // Start loading screen
        this.showLoadingScreen();
    }

    // Show loading screen
    showLoadingScreen() {
        this.elements.loadingScreen.classList.remove('hidden');
        this.elements.mainApp.classList.add('hidden');
        
        // Simulate loading time
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 2000);
    }

    // Hide loading screen
    hideLoadingScreen() {
        this.elements.loadingScreen.classList.add('hidden');
        this.elements.mainApp.classList.remove('hidden');
    }

    // Handle connect button click
    onConnectClick() {
        const exchange = this.elements.exchangeSelect.value;
        const symbol = this.elements.symbolSelect.value;
        const apiKey = this.elements.apiKeyInput.value.trim();
        const apiSecret = this.elements.apiSecretInput.value.trim();
        const testMode = this.elements.testModeCheckbox.checked;
        
        if (!this.validateForm()) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Emit connection request
        this.emit('connectRequest', {
            exchange,
            symbol,
            apiKey,
            apiSecret,
            testMode
        });
    }

    // Handle start trading button click
    onStartTradingClick() {
        this.emit('startTradingRequest');
    }

    // Handle stop trading button click
    onStopTradingClick() {
        this.emit('stopTradingRequest');
    }

    // Handle exchange change
    onExchangeChange() {
        const exchange = this.elements.exchangeSelect.value;
        this.updateSymbolOptions(exchange);
    }

    // Handle symbol change
    onSymbolChange() {
        const symbol = this.elements.symbolSelect.value;
        this.emit('symbolChange', symbol);
    }

    // Toggle API key visibility
    toggleApiKeyVisibility() {
        const input = this.elements.apiKeyInput;
        const button = this.elements.toggleApiKey;
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    // Toggle API secret visibility
    toggleApiSecretVisibility() {
        const input = this.elements.apiSecretInput;
        const button = this.elements.toggleApiSecret;
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    // Validate form
    validateForm() {
        const apiKey = this.elements.apiKeyInput.value.trim();
        const apiSecret = this.elements.apiSecretInput.value.trim();
        
        const isValid = apiKey.length > 0 && apiSecret.length > 0;
        
        // Update button state
        this.elements.connectBtn.disabled = !isValid;
        this.elements.connectBtn.classList.toggle('opacity-50', !isValid);
        
        return isValid;
    }

    // Update symbol options based on exchange
    updateSymbolOptions(exchange) {
        const symbolOptions = {
            binance: ['BTCUSDT', 'XAUUSDT', 'ETHUSDT', 'ADAUSDT', 'BNBUSDT'],
            bybit: ['BTCUSDT', 'XAUUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'],
            bingx: ['BTCUSDT', 'XAUUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT'],
            okx: ['BTCUSDT', 'XAUUSDT', 'ETHUSDT', 'ADAUSDT', 'LINKUSDT'],
            kucoin: ['BTCUSDT', 'XAUUSDT', 'ETHUSDT', 'ADAUSDT', 'ATOMUSDT']
        };
        
        const symbols = symbolOptions[exchange] || ['BTCUSDT'];
        
        this.elements.symbolSelect.innerHTML = '';
        symbols.forEach(symbol => {
            const option = document.createElement('option');
            option.value = symbol;
            option.textContent = symbol;
            this.elements.symbolSelect.appendChild(option);
        });
    }

    // Update connection status
    updateConnectionStatus(status) {
        const statusMap = {
            'disconnected': { class: 'status-disconnected', text: 'Disconnected' },
            'connecting': { class: 'status-connecting', text: 'Connecting...' },
            'connected': { class: 'status-connected', text: 'Connected' },
            'error': { class: 'status-disconnected', text: 'Connection Error' }
        };
        
        const statusInfo = statusMap[status] || statusMap.disconnected;
        
        // Update status indicator
        this.elements.connectionStatus.className = `status-indicator ${statusInfo.class}`;
        this.elements.connectionText.textContent = statusInfo.text;
        
        // Update button states
        if (status === 'connected') {
            this.elements.connectBtn.classList.add('hidden');
            this.elements.startTradingBtn.classList.remove('hidden');
            this.elements.stopTradingBtn.classList.add('hidden');
        } else {
            this.elements.connectBtn.classList.remove('hidden');
            this.elements.startTradingBtn.classList.add('hidden');
            this.elements.stopTradingBtn.classList.add('hidden');
        }
        
        this.uiState.isConnected = status === 'connected';
        this.uiState.connectionStatus = statusInfo.text;
    }

    // Update trading status
    updateTradingStatus(status) {
        const statusMap = {
            'idle': { text: 'Idle', color: 'text-gray-400' },
            'starting': { text: 'Starting...', color: 'text-yellow-400' },
            'active': { text: 'Active', color: 'text-green-400' },
            'stopping': { text: 'Stopping...', color: 'text-red-400' }
        };
        
        const statusInfo = statusMap[status] || statusMap.idle;
        
        this.elements.botStatus.textContent = statusInfo.text;
        this.elements.botStatus.className = `font-semibold ${statusInfo.color}`;
        
        // Update button states
        if (status === 'active') {
            this.elements.startTradingBtn.classList.add('hidden');
            this.elements.stopTradingBtn.classList.remove('hidden');
        } else {
            this.elements.startTradingBtn.classList.remove('hidden');
            this.elements.stopTradingBtn.classList.add('hidden');
        }
        
        this.uiState.isTrading = status === 'active';
        this.uiState.tradingStatus = statusInfo.text;
    }

    // Update market data
    updateMarketData(data) {
        if (data.price !== undefined) {
            this.elements.currentPrice.textContent = `$${data.price.toFixed(2)}`;
            this.uiState.currentPrice = data.price;
        }
        
        if (data.change !== undefined) {
            const changeText = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%`;
            this.elements.priceChange.textContent = changeText;
            this.elements.priceChange.className = `font-semibold ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`;
        }
        
        if (data.volume !== undefined) {
            this.elements.currentVolume.textContent = data.volume.toLocaleString();
        }
        
        if (data.timestamp) {
            this.elements.lastUpdate.textContent = new Date(data.timestamp).toLocaleTimeString();
            this.uiState.lastUpdate = data.timestamp;
        }
    }

    // Update EMA data
    updateEMA(data) {
        if (data.ema9 !== undefined) {
            this.elements.ema9Value.textContent = `$${data.ema9.toFixed(2)}`;
        }
        
        if (data.ema15 !== undefined) {
            this.elements.ema15Value.textContent = `$${data.ema15.toFixed(2)}`;
        }
        
        if (data.ema9 !== undefined && data.ema15 !== undefined) {
            const trend = data.ema9 > data.ema15 ? 'UPTREND' : 'DOWNTREND';
            const strength = Math.abs(data.ema9 - data.ema15) / data.ema15 * 100;
            
            this.elements.trendDirection.textContent = trend;
            this.elements.trendDirection.className = `font-semibold ${trend === 'UPTREND' ? 'text-green-400' : 'text-red-400'}`;
            
            this.elements.trendStrength.textContent = `${strength.toFixed(2)}%`;
        }
    }

    // Update trading status details
    updateTradingStatusDetails(data) {
        if (data.signal) {
            this.elements.lastSignal.textContent = data.signal;
            this.elements.lastSignal.className = `font-semibold ${data.signal === 'BUY' ? 'text-green-400' : 'text-red-400'}`;
        } else {
            this.elements.lastSignal.textContent = '--';
            this.elements.lastSignal.className = 'font-semibold text-gray-400';
        }
        
        if (data.tradingWindow !== undefined) {
            this.elements.tradingWindow.textContent = data.tradingWindow ? '🟢 ACTIVE' : '🔴 CLOSED';
        }
        
        if (data.nextAnalysis) {
            this.elements.nextAnalysis.textContent = new Date(data.nextAnalysis).toLocaleTimeString();
        }
    }

    // Update performance metrics
    updatePerformanceMetrics(metrics) {
        if (metrics.totalProfit !== undefined) {
            this.elements.totalProfit.textContent = `$${metrics.totalProfit.toFixed(2)}`;
            this.elements.totalProfit.className = `text-2xl font-bold ${metrics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`;
        }
        
        if (metrics.winRate !== undefined) {
            this.elements.winRate.textContent = `${metrics.winRate.toFixed(1)}%`;
        }
        
        if (metrics.totalTrades !== undefined) {
            this.elements.totalTrades.textContent = metrics.totalTrades;
        }
        
        if (metrics.avgReturn !== undefined) {
            this.elements.avgReturn.textContent = `${metrics.avgReturn.toFixed(2)}%`;
        }
    }

    // Update open positions
    updateOpenPositions(positions) {
        if (!positions || positions.length === 0) {
            this.elements.openPositions.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-inbox text-3xl mb-2"></i>
                    <p>No open positions</p>
                </div>
            `;
            return;
        }
        
        const positionsHTML = positions.map(position => `
            <div class="p-4 bg-gray-800 rounded border-l-4 ${position.side === 'BUY' ? 'border-green-500' : 'border-red-500'}">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="font-semibold ${position.side === 'BUY' ? 'text-green-400' : 'text-red-400'}">
                            ${position.side} ${position.symbol}
                        </span>
                        <span class="text-sm text-gray-400 ml-2">${position.size}</span>
                    </div>
                    <span class="text-xs text-gray-400">${new Date(position.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div>Entry: $${position.entryPrice.toFixed(2)}</div>
                    <div>Current: $${position.currentPrice.toFixed(2)}</div>
                    <div>Stop Loss: $${position.stopLoss.toFixed(2)}</div>
                    <div>Take Profit: $${position.takeProfit.toFixed(2)}</div>
                </div>
                <div class="mt-2 text-xs text-gray-400">${position.reason}</div>
            </div>
        `).join('');
        
        this.elements.openPositions.innerHTML = positionsHTML;
    }

    // Update trade history
    updateTradeHistory(trades) {
        if (!trades || trades.length === 0) {
            this.elements.tradeHistory.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-clock text-3xl mb-2"></i>
                    <p>No trades yet</p>
                </div>
            `;
            return;
        }
        
        const tradesHTML = trades.slice(0, 10).map(trade => `
            <div class="p-3 bg-gray-800 rounded border-l-4 ${trade.side === 'BUY' ? 'border-green-500' : 'border-red-500'}">
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-semibold ${trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'}">
                            ${trade.side}
                        </span>
                        <span class="text-sm text-gray-400 ml-2">${trade.symbol}</span>
                    </div>
                    <div class="text-right">
                        <div class="font-semibold">$${trade.price.toFixed(2)}</div>
                        <div class="text-xs text-gray-400">${new Date(trade.timestamp).toLocaleTimeString()}</div>
                    </div>
                </div>
            </div>
        `).join('');
        
        this.elements.tradeHistory.innerHTML = tradesHTML;
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
            type === 'error' ? 'bg-red-600' : 
            type === 'success' ? 'bg-green-600' : 
            type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'
        } text-white`;
        
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 
                                   type === 'success' ? 'check-circle' : 
                                   type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Start real-time updates
    startUpdates() {
        // Update trading window status every minute
        this.updateIntervals.set('tradingWindow', setInterval(() => {
            this.updateTradingWindowStatus();
        }, 60000));
        
        // Update next analysis time every 10 seconds
        this.updateIntervals.set('nextAnalysis', setInterval(() => {
            this.updateNextAnalysisTime();
        }, 10000));
    }

    // Stop real-time updates
    stopUpdates() {
        this.updateIntervals.forEach(interval => clearInterval(interval));
        this.updateIntervals.clear();
    }

    // Update trading window status
    updateTradingWindowStatus() {
        // This would check if current time is within trading window (10AM-11PM IST)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffset);
        const currentHour = istTime.getHours();
        
        const isActive = currentHour >= 10 && currentHour < 23;
        this.elements.tradingWindow.textContent = isActive ? '🟢 ACTIVE' : '🔴 CLOSED';
    }

    // Update next analysis time
    updateNextAnalysisTime() {
        const nextAnalysis = Date.now() + 10000; // 10 seconds from now
        this.elements.nextAnalysis.textContent = new Date(nextAnalysis).toLocaleTimeString();
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

    // Cleanup
    destroy() {
        this.stopUpdates();
        this.eventListeners.clear();
        this.isInitialized = false;
    }
}

// Export for use in other modules
window.UIManager = UIManager;