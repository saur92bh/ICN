class TradingStrategy {
    constructor() {
        this.isActive = false;
        this.currentPosition = null;
        this.tradeHistory = [];
        this.performanceMetrics = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: 0,
            winRate: 0,
            averageReturn: 0
        };
        
        // Strategy parameters
        this.strategyParams = {
            ema9Period: 9,
            ema15Period: 15,
            riskRewardRatio: 2.0,
            maxPositions: 1,
            positionSize: 0.01, // BTC amount
            stopLossBuffer: 10, // USD buffer for stop loss
            volumeThreshold: 1.2, // Volume multiplier for confirmation
            emaSlopeThreshold: 0.001, // Minimum slope for trend confirmation
            tradingWindow: {
                start: '10:00', // IST
                end: '23:00'    // IST
            }
        };
        
        // Market data
        this.candleHistory = [];
        this.ema9Data = [];
        this.ema15Data = [];
        this.currentPrice = 0;
        this.currentVolume = 0;
        
        // Event listeners
        this.eventListeners = new Map();
        
        // Analysis interval
        this.analysisInterval = null;
        this.lastAnalysisTime = 0;
    }

    // Initialize strategy with exchange API
    initialize(exchangeAPI) {
        this.exchangeAPI = exchangeAPI;
        
        // Subscribe to market data events
        this.exchangeAPI.on('kline', (candle) => this.onNewCandle(candle));
        this.exchangeAPI.on('ticker', (ticker) => this.onNewTicker(ticker));
        
        // Load historical data
        this.loadHistoricalData();
        
        console.log('Trading strategy initialized');
    }

    // Load historical data for analysis
    async loadHistoricalData() {
        try {
            const klines = await this.exchangeAPI.getHistoricalKlines(
                this.exchangeAPI.currentSymbol,
                '5m',
                100
            );
            
            this.candleHistory = klines;
            this.calculateEMAs();
            
            console.log(`Loaded ${klines.length} historical candles`);
        } catch (error) {
            console.error('Failed to load historical data:', error);
        }
    }

    // Handle new candle data
    onNewCandle(candle) {
        // Add to history
        this.candleHistory.push(candle);
        
        // Keep only last 100 candles
        if (this.candleHistory.length > 100) {
            this.candleHistory = this.candleHistory.slice(-100);
        }
        
        // Update current price
        this.currentPrice = candle.close;
        this.currentVolume = candle.volume;
        
        // Recalculate EMAs
        this.calculateEMAs();
        
        // Analyze strategy if active
        if (this.isActive && candle.isClosed) {
            this.analyzeStrategy();
        }
        
        // Emit candle update event
        this.emit('candleUpdate', candle);
    }

    // Handle new ticker data
    onNewTicker(ticker) {
        this.currentPrice = ticker.lastPrice;
        this.currentVolume = ticker.volume;
        
        // Emit ticker update event
        this.emit('tickerUpdate', ticker);
    }

    // Calculate EMA values
    calculateEMAs() {
        if (this.candleHistory.length < Math.max(this.strategyParams.ema9Period, this.strategyParams.ema15Period)) {
            return;
        }
        
        const closePrices = this.candleHistory.map(candle => candle.close);
        
        this.ema9Data = this.calculateEMA(closePrices, this.strategyParams.ema9Period);
        this.ema15Data = this.calculateEMA(closePrices, this.strategyParams.ema15Period);
        
        // Emit EMA update event
        this.emit('emaUpdate', {
            ema9: this.ema9Data[this.ema9Data.length - 1],
            ema15: this.ema15Data[this.ema15Data.length - 1]
        });
    }

    // Calculate Exponential Moving Average
    calculateEMA(prices, period) {
        const multiplier = 2 / (period + 1);
        const emaValues = [prices[0]];
        
        for (let i = 1; i < prices.length; i++) {
            const ema = (prices[i] - emaValues[i - 1]) * multiplier + emaValues[i - 1];
            emaValues.push(ema);
        }
        
        return emaValues;
    }

    // Calculate EMA slope for trend confirmation
    calculateEMASlope(emaValues, lookback = 3) {
        if (emaValues.length < lookback + 1) return 0;
        
        const recent = emaValues.slice(-lookback - 1);
        const slope = (recent[recent.length - 1] - recent[0]) / lookback;
        return slope;
    }

    // Check if within trading window (IST)
    isWithinTradingWindow() {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istTime = new Date(now.getTime() + istOffset);
        const currentHour = istTime.getHours();
        const currentMinute = istTime.getMinutes();
        
        const [startHour, startMin] = this.strategyParams.tradingWindow.start.split(':').map(Number);
        const [endHour, endMin] = this.strategyParams.tradingWindow.end.split(':').map(Number);
        
        const currentTime = currentHour * 60 + currentMinute;
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        return currentTime >= startTime && currentTime <= endTime;
    }

    // Recognize candlestick patterns
    recognizePattern(candles) {
        if (candles.length < 2) return null;
        
        const current = candles[candles.length - 1];
        const previous = candles[candles.length - 2];
        
        const patterns = [];
        
        // Bullish Engulfing
        if (previous.close < previous.open && // Previous red
            current.close > current.open && // Current green
            current.open < previous.close && // Current opens below prev close
            current.close > previous.open) { // Current closes above prev open
            patterns.push('BULLISH_ENGULFING');
        }
        
        // Bearish Engulfing
        if (previous.close > previous.open && // Previous green
            current.close < current.open && // Current red
            current.open > previous.close && // Current opens above prev close
            current.close < previous.open) { // Current closes below prev open
            patterns.push('BEARISH_ENGULFING');
        }
        
        // Hammer
        const body = Math.abs(current.close - current.open);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const upperWick = current.high - Math.max(current.open, current.close);
        
        if (lowerWick > body * 2 && upperWick < body * 0.1) {
            patterns.push('HAMMER');
        }
        
        // Inverted Hammer
        if (upperWick > body * 2 && lowerWick < body * 0.1) {
            patterns.push('INVERTED_HAMMER');
        }
        
        return patterns.length > 0 ? patterns : null;
    }

    // Analyze trading strategy
    analyzeStrategy() {
        if (!this.isActive || this.candleHistory.length < 20) return;
        
        const currentEMA9 = this.ema9Data[this.ema9Data.length - 1];
        const currentEMA15 = this.ema15Data[this.ema15Data.length - 1];
        const ema9Slope = this.calculateEMASlope(this.ema9Data);
        const ema15Slope = this.calculateEMASlope(this.ema15Data);
        const patterns = this.recognizePattern(this.candleHistory.slice(-2));
        
        // Check if within trading window
        if (!this.isWithinTradingWindow()) {
            this.emit('analysisUpdate', {
                signal: null,
                reason: 'Outside trading window (10AM-11PM IST)',
                trend: 'N/A',
                patterns: patterns
            });
            return;
        }
        
        // Check trend conditions
        const uptrend = currentEMA9 > currentEMA15 && 
                       ema9Slope > this.strategyParams.emaSlopeThreshold && 
                       ema15Slope > this.strategyParams.emaSlopeThreshold;
        
        const downtrend = currentEMA9 < currentEMA15 && 
                         ema9Slope < -this.strategyParams.emaSlopeThreshold && 
                         ema15Slope < -this.strategyParams.emaSlopeThreshold;
        
        let signal = null;
        let signalReason = '';
        let entryPrice = this.currentPrice;
        let stopLoss = 0;
        let takeProfit = 0;
        
        if (uptrend && !this.currentPosition) {
            // Check for BUY signals
            
            // Setup 1: Retest with Bullish Pattern
            if (patterns && (patterns.includes('BULLISH_ENGULFING') || patterns.includes('HAMMER'))) {
                const previousCandle = this.candleHistory[this.candleHistory.length - 2];
                if (previousCandle.close < previousCandle.open && // Previous red candle
                    (this.currentPrice >= currentEMA9 * 0.998 && this.currentPrice <= currentEMA9 * 1.002)) { // Near EMA9
                    signal = 'BUY';
                    signalReason = `Retest Setup: ${patterns.join(', ')} pattern at EMA9`;
                }
            }
            
            // Setup 2: Trap Seller Reversal
            if (!signal) {
                const previousCandle = this.candleHistory[this.candleHistory.length - 2];
                if (previousCandle.close < Math.min(currentEMA9, currentEMA15) && // Previous closed below EMA
                    this.currentPrice > Math.max(currentEMA9, currentEMA15)) { // Current above EMA
                    signal = 'BUY';
                    signalReason = 'Trap Seller Reversal: Price reclaimed EMA levels';
                }
            }
            
            if (signal === 'BUY') {
                stopLoss = Math.min(...this.candleHistory.slice(-3).map(c => c.low)) - this.strategyParams.stopLossBuffer;
                const riskAmount = entryPrice - stopLoss;
                takeProfit = entryPrice + (riskAmount * this.strategyParams.riskRewardRatio);
            }
        }
        
        if (downtrend && !this.currentPosition) {
            // Check for SELL signals
            
            // Setup 1: Retest with Bearish Pattern
            if (patterns && (patterns.includes('BEARISH_ENGULFING') || patterns.includes('INVERTED_HAMMER'))) {
                const previousCandle = this.candleHistory[this.candleHistory.length - 2];
                if (previousCandle.close > previousCandle.open && // Previous green candle
                    (this.currentPrice >= currentEMA9 * 0.998 && this.currentPrice <= currentEMA9 * 1.002)) { // Near EMA9
                    signal = 'SELL';
                    signalReason = `Retest Setup: ${patterns.join(', ')} pattern at EMA9`;
                }
            }
            
            // Setup 2: Trap Buyer Reversal
            if (!signal) {
                const previousCandle = this.candleHistory[this.candleHistory.length - 2];
                if (previousCandle.close > Math.max(currentEMA9, currentEMA15) && // Previous closed above EMA
                    this.currentPrice < Math.min(currentEMA9, currentEMA15)) { // Current below EMA
                    signal = 'SELL';
                    signalReason = 'Trap Buyer Reversal: Price broke below EMA levels';
                }
            }
            
            if (signal === 'SELL') {
                stopLoss = Math.max(...this.candleHistory.slice(-3).map(c => c.high)) + this.strategyParams.stopLossBuffer;
                const riskAmount = stopLoss - entryPrice;
                takeProfit = entryPrice - (riskAmount * this.strategyParams.riskRewardRatio);
            }
        }
        
        // Emit analysis results
        this.emit('analysisUpdate', {
            signal: signal,
            reason: signalReason || 'No setup detected',
            trend: uptrend ? 'UPTREND' : downtrend ? 'DOWNTREND' : 'SIDEWAYS',
            patterns: patterns,
            ema9: currentEMA9,
            ema15: currentEMA15,
            ema9Slope: ema9Slope,
            ema15Slope: ema15Slope,
            entryPrice: entryPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit
        });
        
        // Execute trade if signal detected
        if (signal && !this.currentPosition) {
            this.executeTrade(signal, signalReason, entryPrice, stopLoss, takeProfit);
        }
        
        this.lastAnalysisTime = Date.now();
    }

    // Execute trade
    async executeTrade(side, reason, entryPrice, stopLoss, takeProfit) {
        try {
            console.log(`Executing ${side} trade: ${reason}`);
            
            // Create position
            const position = {
                id: Date.now(),
                side: side,
                symbol: this.exchangeAPI.currentSymbol,
                size: this.strategyParams.positionSize,
                entryPrice: entryPrice,
                currentPrice: this.currentPrice,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                timestamp: new Date(),
                reason: reason,
                status: 'OPEN'
            };
            
            this.currentPosition = position;
            
            // Place order on exchange (if not in test mode)
            if (!this.exchangeAPI.testMode) {
                const order = await this.exchangeAPI.placeOrder(
                    side,
                    this.strategyParams.positionSize,
                    entryPrice,
                    'LIMIT'
                );
                
                position.orderId = order.orderId;
                position.orderStatus = order.status;
            }
            
            // Emit trade execution event
            this.emit('tradeExecuted', position);
            
            console.log(`Trade executed: ${side} ${this.strategyParams.positionSize} ${this.exchangeAPI.currentSymbol} at $${entryPrice}`);
            
        } catch (error) {
            console.error('Trade execution failed:', error);
            this.emit('tradeError', error);
        }
    }

    // Check position exit conditions
    checkExitConditions() {
        if (!this.currentPosition || this.currentPosition.status !== 'OPEN') return;
        
        const position = this.currentPosition;
        let shouldExit = false;
        let exitReason = '';
        
        if (position.side === 'BUY') {
            if (this.currentPrice <= position.stopLoss) {
                shouldExit = true;
                exitReason = 'Stop Loss';
            } else if (this.currentPrice >= position.takeProfit) {
                shouldExit = true;
                exitReason = 'Take Profit';
            }
        } else if (position.side === 'SELL') {
            if (this.currentPrice >= position.stopLoss) {
                shouldExit = true;
                exitReason = 'Stop Loss';
            } else if (this.currentPrice <= position.takeProfit) {
                shouldExit = true;
                exitReason = 'Take Profit';
            }
        }
        
        if (shouldExit) {
            this.closePosition(exitReason);
        }
    }

    // Close position
    async closePosition(reason) {
        try {
            const position = this.currentPosition;
            const exitPrice = this.currentPrice;
            
            // Calculate P&L
            let pnl = 0;
            if (position.side === 'BUY') {
                pnl = (exitPrice - position.entryPrice) * position.size;
            } else {
                pnl = (position.entryPrice - exitPrice) * position.size;
            }
            
            // Update position
            position.exitPrice = exitPrice;
            position.exitTime = new Date();
            position.pnl = pnl;
            position.status = 'CLOSED';
            position.exitReason = reason;
            
            // Add to trade history
            this.tradeHistory.push({ ...position });
            
            // Update performance metrics
            this.updatePerformanceMetrics(position);
            
            // Clear current position
            this.currentPosition = null;
            
            // Emit position closed event
            this.emit('positionClosed', position);
            
            console.log(`Position closed: ${reason}, P&L: $${pnl.toFixed(2)}`);
            
        } catch (error) {
            console.error('Failed to close position:', error);
        }
    }

    // Update performance metrics
    updatePerformanceMetrics(closedPosition) {
        this.performanceMetrics.totalTrades++;
        this.performanceMetrics.totalProfit += closedPosition.pnl;
        
        if (closedPosition.pnl > 0) {
            this.performanceMetrics.winningTrades++;
        } else {
            this.performanceMetrics.losingTrades++;
        }
        
        this.performanceMetrics.winRate = (this.performanceMetrics.winningTrades / this.performanceMetrics.totalTrades) * 100;
        this.performanceMetrics.averageReturn = this.performanceMetrics.totalProfit / this.performanceMetrics.totalTrades;
        
        // Emit metrics update
        this.emit('metricsUpdate', this.performanceMetrics);
    }

    // Start strategy
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        
        // Start analysis interval
        this.analysisInterval = setInterval(() => {
            if (this.isActive) {
                this.analyzeStrategy();
            }
        }, 10000); // Analyze every 10 seconds
        
        // Start position monitoring
        const positionMonitor = setInterval(() => {
            if (this.isActive) {
                this.checkExitConditions();
            } else {
                clearInterval(positionMonitor);
            }
        }, 5000); // Check every 5 seconds
        
        console.log('Trading strategy started');
        this.emit('strategyStarted');
    }

    // Stop strategy
    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        
        console.log('Trading strategy stopped');
        this.emit('strategyStopped');
    }

    // Get strategy status
    getStatus() {
        return {
            isActive: this.isActive,
            currentPosition: this.currentPosition,
            tradingWindow: this.isWithinTradingWindow(),
            lastAnalysis: this.lastAnalysisTime,
            performance: this.performanceMetrics
        };
    }

    // Update strategy parameters
    updateParameters(newParams) {
        this.strategyParams = { ...this.strategyParams, ...newParams };
        this.emit('parametersUpdated', this.strategyParams);
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
window.TradingStrategy = TradingStrategy;