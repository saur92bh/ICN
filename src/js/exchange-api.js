class ExchangeAPI {
    constructor() {
        this.connections = new Map();
        this.currentExchange = null;
        this.currentSymbol = null;
        this.isConnected = false;
        this.wsConnection = null;
        this.restClient = null;
        this.apiKey = '';
        this.apiSecret = '';
        this.testMode = true;
        
        // Exchange configurations
        this.exchangeConfigs = {
            binance: {
                name: 'Binance',
                wsUrl: 'wss://stream.binance.com:9443/ws/',
                restUrl: 'https://api.binance.com/api/v3/',
                testnetUrl: 'https://testnet.binance.vision/api/v3/',
                wsTestnetUrl: 'wss://testnet.binance.vision/ws/',
                endpoints: {
                    klines: '/klines',
                    ticker: '/ticker/24hr',
                    account: '/account',
                    order: '/order',
                    openOrders: '/openOrders'
                }
            },
            bybit: {
                name: 'Bybit',
                wsUrl: 'wss://stream.bybit.com/v5/public/linear',
                restUrl: 'https://api.bybit.com/v5/',
                testnetUrl: 'https://api-testnet.bybit.com/v5/',
                wsTestnetUrl: 'wss://stream-testnet.bybit.com/v5/public/linear',
                endpoints: {
                    klines: '/market/kline',
                    ticker: '/market/tickers',
                    account: '/account/wallet/balance',
                    order: '/order/create',
                    openOrders: '/order/realtime'
                }
            },
            bingx: {
                name: 'BingX',
                wsUrl: 'wss://open-api-ws.bingx.com/market',
                restUrl: 'https://open-api.bingx.com/openApi/',
                testnetUrl: 'https://open-api-testnet.bingx.com/openApi/',
                wsTestnetUrl: 'wss://open-api-ws-testnet.bingx.com/market',
                endpoints: {
                    klines: '/market/kline',
                    ticker: '/market/ticker',
                    account: '/account/balance',
                    order: '/trade/place-order',
                    openOrders: '/trade/open-orders'
                }
            },
            okx: {
                name: 'OKX',
                wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
                restUrl: 'https://www.okx.com/api/v5/',
                testnetUrl: 'https://www.okx.com/api/v5/',
                wsTestnetUrl: 'wss://wspap.okx.com:8443/ws/v5/public',
                endpoints: {
                    klines: '/market/candles',
                    ticker: '/market/ticker',
                    account: '/account/balance',
                    order: '/trade/order',
                    openOrders: '/trade/orders-pending'
                }
            },
            kucoin: {
                name: 'KuCoin',
                wsUrl: 'wss://ws-api.kucoin.com/',
                restUrl: 'https://api.kucoin.com/api/v1/',
                testnetUrl: 'https://sandbox-api.kucoin.com/api/v1/',
                wsTestnetUrl: 'wss://sandbox-ws-api.kucoin.com/',
                endpoints: {
                    klines: '/market/candles',
                    ticker: '/market/stats',
                    account: '/accounts',
                    order: '/orders',
                    openOrders: '/orders'
                }
            }
        };
        
        this.eventListeners = new Map();
    }

    // Initialize connection to exchange
    async connect(exchange, symbol, apiKey, apiSecret, testMode = true) {
        try {
            this.currentExchange = exchange;
            this.currentSymbol = symbol;
            this.apiKey = apiKey;
            this.apiSecret = apiSecret;
            this.testMode = testMode;

            const config = this.exchangeConfigs[exchange];
            if (!config) {
                throw new Error(`Unsupported exchange: ${exchange}`);
            }

            // Test API credentials
            await this.testCredentials();

            // Initialize REST client
            this.restClient = this.createRestClient(config);

            // Initialize WebSocket connection
            await this.initializeWebSocket(config);

            this.isConnected = true;
            this.emit('connected', { exchange, symbol, testMode });
            
            return true;
        } catch (error) {
            console.error('Connection failed:', error);
            this.emit('error', error);
            return false;
        }
    }

    // Test API credentials
    async testCredentials() {
        try {
            const config = this.exchangeConfigs[this.currentExchange];
            const baseUrl = this.testMode ? config.testnetUrl : config.restUrl;
            
            // Test with account info or simple endpoint
            const response = await fetch(`${baseUrl}${config.endpoints.ticker}?symbol=${this.currentSymbol}`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error(`API test failed: ${response.status} ${response.statusText}`);
            }

            return true;
        } catch (error) {
            throw new Error(`Credential test failed: ${error.message}`);
        }
    }

    // Create REST client
    createRestClient(config) {
        const baseUrl = this.testMode ? config.testnetUrl : config.restUrl;
        
        return {
            baseUrl,
            async request(endpoint, options = {}) {
                const url = `${baseUrl}${endpoint}`;
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            }
        };
    }

    // Initialize WebSocket connection
    async initializeWebSocket(config) {
        const wsUrl = this.testMode ? config.wsTestnetUrl : config.wsUrl;
        
        return new Promise((resolve, reject) => {
            try {
                this.wsConnection = new WebSocket(wsUrl);
                
                this.wsConnection.onopen = () => {
                    console.log(`WebSocket connected to ${config.name}`);
                    this.subscribeToMarketData();
                    resolve();
                };

                this.wsConnection.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleWebSocketMessage(data);
                    } catch (error) {
                        console.error('WebSocket message parse error:', error);
                    }
                };

                this.wsConnection.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.wsConnection.onclose = () => {
                    console.log('WebSocket connection closed');
                    this.isConnected = false;
                    this.emit('disconnected');
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    // Subscribe to market data
    subscribeToMarketData() {
        if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
            return;
        }

        const subscription = {
            method: 'SUBSCRIBE',
            params: [
                `${this.currentSymbol.toLowerCase()}@kline_5m`,
                `${this.currentSymbol.toLowerCase()}@ticker`
            ],
            id: Date.now()
        };

        this.wsConnection.send(JSON.stringify(subscription));
    }

    // Handle WebSocket messages
    handleWebSocketMessage(data) {
        if (data.e === 'kline') {
            // Binance kline data
            this.processKlineData(data);
        } else if (data.e === '24hrTicker') {
            // Binance ticker data
            this.processTickerData(data);
        } else if (data.topic && data.topic.includes('kline')) {
            // Bybit kline data
            this.processKlineData(data);
        } else if (data.topic && data.topic.includes('ticker')) {
            // Bybit ticker data
            this.processTickerData(data);
        }
    }

    // Process kline (candlestick) data
    processKlineData(data) {
        let candle;
        
        if (data.e === 'kline') {
            // Binance format
            candle = {
                openTime: data.k.t,
                open: parseFloat(data.k.o),
                high: parseFloat(data.k.h),
                low: parseFloat(data.k.l),
                close: parseFloat(data.k.c),
                volume: parseFloat(data.k.v),
                closeTime: data.k.T,
                isClosed: data.k.x
            };
        } else if (data.topic && data.topic.includes('kline')) {
            // Bybit format
            const klineData = data.data[0];
            candle = {
                openTime: klineData.start,
                open: parseFloat(klineData.open),
                high: parseFloat(klineData.high),
                low: parseFloat(klineData.low),
                close: parseFloat(klineData.close),
                volume: parseFloat(klineData.volume),
                closeTime: klineData.end,
                isClosed: true
            };
        }

        if (candle) {
            this.emit('kline', candle);
        }
    }

    // Process ticker data
    processTickerData(data) {
        let ticker;
        
        if (data.e === '24hrTicker') {
            // Binance format
            ticker = {
                symbol: data.s,
                priceChange: parseFloat(data.P),
                priceChangePercent: parseFloat(data.P),
                weightedAvgPrice: parseFloat(data.w),
                prevClosePrice: parseFloat(data.x),
                lastPrice: parseFloat(data.c),
                lastQty: parseFloat(data.Q),
                bidPrice: parseFloat(data.b),
                askPrice: parseFloat(data.a),
                openPrice: parseFloat(data.o),
                highPrice: parseFloat(data.h),
                lowPrice: parseFloat(data.l),
                volume: parseFloat(data.v),
                quoteVolume: parseFloat(data.q),
                openTime: data.O,
                closeTime: data.C
            };
        } else if (data.topic && data.topic.includes('ticker')) {
            // Bybit format
            const tickerData = data.data;
            ticker = {
                symbol: tickerData.symbol,
                priceChange: parseFloat(tickerData.price24hPcnt) * 100,
                priceChangePercent: parseFloat(tickerData.price24hPcnt) * 100,
                lastPrice: parseFloat(tickerData.lastPrice),
                highPrice: parseFloat(tickerData.highPrice24h),
                lowPrice: parseFloat(tickerData.lowPrice24h),
                volume: parseFloat(tickerData.volume24h),
                turnover: parseFloat(tickerData.turnover24h)
            };
        }

        if (ticker) {
            this.emit('ticker', ticker);
        }
    }

    // Get historical kline data
    async getHistoricalKlines(symbol, interval = '5m', limit = 100) {
        try {
            const config = this.exchangeConfigs[this.currentExchange];
            const endpoint = config.endpoints.klines;
            
            let url;
            if (this.currentExchange === 'binance') {
                url = `${this.restClient.baseUrl}${endpoint}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
            } else if (this.currentExchange === 'bybit') {
                url = `${this.restClient.baseUrl}${endpoint}?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
            } else {
                url = `${this.restClient.baseUrl}${endpoint}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            return this.parseHistoricalKlines(data, this.currentExchange);
        } catch (error) {
            console.error('Failed to get historical klines:', error);
            throw error;
        }
    }

    // Parse historical klines based on exchange
    parseHistoricalKlines(data, exchange) {
        let klines = [];
        
        if (exchange === 'binance') {
            klines = data.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6]
            }));
        } else if (exchange === 'bybit') {
            klines = data.result.list.map(kline => ({
                openTime: parseInt(kline[0]),
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: parseInt(kline[6])
            }));
        }

        return klines.reverse(); // Return in chronological order
    }

    // Get account balance
    async getAccountBalance() {
        try {
            const config = this.exchangeConfigs[this.currentExchange];
            const endpoint = config.endpoints.account;
            
            const response = await this.restClient.request(endpoint, {
                headers: this.getAuthHeaders()
            });

            return this.parseAccountBalance(response, this.currentExchange);
        } catch (error) {
            console.error('Failed to get account balance:', error);
            throw error;
        }
    }

    // Parse account balance based on exchange
    parseAccountBalance(data, exchange) {
        if (exchange === 'binance') {
            return data.balances.map(balance => ({
                asset: balance.asset,
                free: parseFloat(balance.free),
                locked: parseFloat(balance.locked)
            }));
        } else if (exchange === 'bybit') {
            return data.result.list.map(balance => ({
                asset: balance.coin,
                free: parseFloat(balance.walletBalance),
                locked: parseFloat(balance.locked)
            }));
        }
        
        return [];
    }

    // Place order
    async placeOrder(side, quantity, price, orderType = 'LIMIT') {
        try {
            const config = this.exchangeConfigs[this.currentExchange];
            const endpoint = config.endpoints.order;
            
            const orderData = {
                symbol: this.currentSymbol,
                side: side.toUpperCase(),
                type: orderType,
                quantity: quantity
            };

            if (orderType === 'LIMIT') {
                orderData.price = price;
                orderData.timeInForce = 'GTC';
            }

            const response = await this.restClient.request(endpoint, {
                method: 'POST',
                body: JSON.stringify(orderData),
                headers: this.getAuthHeaders()
            });

            return this.parseOrderResponse(response, this.currentExchange);
        } catch (error) {
            console.error('Failed to place order:', error);
            throw error;
        }
    }

    // Parse order response based on exchange
    parseOrderResponse(data, exchange) {
        if (exchange === 'binance') {
            return {
                orderId: data.orderId,
                symbol: data.symbol,
                side: data.side,
                type: data.type,
                quantity: parseFloat(data.origQty),
                price: parseFloat(data.price),
                status: data.status
            };
        } else if (exchange === 'bybit') {
            return {
                orderId: data.result.orderId,
                symbol: data.result.symbol,
                side: data.result.side,
                type: data.result.orderType,
                quantity: parseFloat(data.result.qty),
                price: parseFloat(data.result.price),
                status: data.result.orderStatus
            };
        }
        
        return data;
    }

    // Get authentication headers
    getAuthHeaders() {
        if (!this.apiKey || !this.apiSecret) {
            return {};
        }

        const timestamp = Date.now();
        const signature = this.generateSignature(timestamp);

        return {
            'X-MBX-APIKEY': this.apiKey,
            'X-MBX-TIMESTAMP': timestamp,
            'X-MBX-SIGNATURE': signature
        };
    }

    // Generate signature for authentication
    generateSignature(timestamp) {
        // This is a simplified signature generation
        // In production, you'd use proper HMAC-SHA256 signing
        const queryString = `timestamp=${timestamp}`;
        return btoa(queryString + this.apiSecret);
    }

    // Disconnect from exchange
    disconnect() {
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }
        
        this.isConnected = false;
        this.currentExchange = null;
        this.currentSymbol = null;
        
        this.emit('disconnected');
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
window.ExchangeAPI = ExchangeAPI;