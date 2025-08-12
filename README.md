# EMA Strategy Trading Bot - Professional Edition

A sophisticated, automated cryptocurrency trading bot built with Electron that implements the EMA (Exponential Moving Average) strategy with candlestick pattern recognition for precise trade execution.

## 🚀 Features

### Core Trading Strategy
- **9 EMA & 15 EMA Analysis**: Dual EMA crossover system for trend identification
- **Candlestick Pattern Recognition**: 
  - Bullish: Bullish Engulfing, Hammer
  - Bearish: Bearish Engulfing, Inverted Hammer
- **Automated Trade Execution**: BUY/SELL signals with 1:2 risk-reward ratio
- **Trading Window Management**: Active 10:00 AM to 11:00 PM IST
- **Real-time Market Analysis**: Continuous monitoring and analysis

### Technical Features
- **Multi-Exchange Support**: Binance, Bybit, BingX, OKX, KuCoin
- **Real-time Data Streaming**: WebSocket connections for live market data
- **Professional Charting**: TradingView Lightweight Charts integration
- **Risk Management**: Automated stop-loss and take-profit execution
- **Performance Tracking**: Comprehensive P&L and win-rate analytics

### User Interface
- **Modern Desktop App**: Built with Electron for cross-platform compatibility
- **Real-time Dashboard**: Live market data, EMA values, and trading status
- **Interactive Charts**: Professional candlestick charts with EMA overlays
- **Position Management**: Real-time position tracking and trade history
- **Responsive Design**: Beautiful UI with dark theme and glass effects

## 📋 Prerequisites

- **Node.js**: Version 16.0 or higher
- **npm**: Version 8.0 or higher
- **Operating System**: Windows 10+, macOS 10.14+, or Linux (Ubuntu 18.04+)
- **Exchange Account**: API-enabled account on supported exchanges
- **API Permissions**: Read, Futures Trading permissions required

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ema-strategy-trading-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build the Application
```bash
npm run build
```

### 4. Start the Application
```bash
npm start
```

## 🔧 Configuration

### API Setup

1. **Generate API Keys**:
   - Log into your exchange account
   - Navigate to API Management
   - Create new API key with appropriate permissions
   - Enable IP restrictions for security

2. **Configure in App**:
   - Select your exchange from the dropdown
   - Choose trading symbol (BTCUSDT, XAUUSDT, etc.)
   - Enter API Key and Secret
   - Enable Test Mode for initial testing

### Strategy Parameters

The bot uses these default parameters (configurable):
- **EMA Periods**: 9 and 15
- **Risk-Reward Ratio**: 1:2 minimum
- **Position Size**: 0.01 BTC (adjustable)
- **Stop Loss Buffer**: $10 USD
- **Volume Threshold**: 1.2x average volume
- **EMA Slope Threshold**: 0.001 for trend confirmation

## 📊 Trading Strategy Details

### BUY Conditions

#### Setup 1: Retest with Bullish Pattern
- **Trend**: 9 EMA > 15 EMA (both sloping upward)
- **Pattern**: Bullish Engulfing or Hammer
- **Entry**: Price near 9 EMA with red candle pullback
- **Confirmation**: Volume above threshold

#### Setup 2: Trap Seller Reversal
- **Trend**: 9 EMA > 15 EMA (both sloping upward)
- **Setup**: Red candle closes below EMA levels
- **Entry**: Next candle closes above EMAs (green)
- **Target**: Risk-reward ratio of 1:2

### SELL Conditions

#### Setup 1: Retest with Bearish Pattern
- **Trend**: 9 EMA < 15 EMA (both sloping downward)
- **Pattern**: Bearish Engulfing or Inverted Hammer
- **Entry**: Price near 9 EMA with green candle pullback
- **Confirmation**: Volume above threshold

#### Setup 2: Trap Buyer Reversal
- **Trend**: 9 EMA < 15 EMA (both sloping downward)
- **Setup**: Green candle closes above EMA levels
- **Entry**: Next candle closes below EMAs (red)
- **Target**: Risk-reward ratio of 1:2

## 🎯 Usage Guide

### 1. Initial Setup
- Launch the application
- Configure your exchange API credentials
- Select trading symbol and timeframe
- Enable Test Mode for initial testing

### 2. Connection
- Click "Connect" to establish exchange connection
- Verify connection status indicator turns green
- Check real-time market data display

### 3. Start Trading
- Click "Start Trading" to activate the strategy
- Monitor real-time analysis and signals
- Watch for BUY/SELL signals in the dashboard

### 4. Monitor Performance
- Track open positions in real-time
- View trade history and performance metrics
- Monitor win rate and total profit

### 5. Risk Management
- Set appropriate position sizes
- Monitor stop-loss and take-profit levels
- Review strategy performance regularly

## 🔒 Security Features

- **Local Storage**: API credentials stored locally only
- **No Data Transmission**: Credentials never sent to external servers
- **IP Restrictions**: Support for exchange IP whitelisting
- **Test Mode**: Paper trading for strategy validation
- **Secure Authentication**: Proper API signature generation

## 📈 Performance Monitoring

### Key Metrics
- **Total Profit/Loss**: Real-time P&L tracking
- **Win Rate**: Percentage of profitable trades
- **Total Trades**: Number of completed trades
- **Average Return**: Mean return per trade
- **Drawdown**: Maximum loss from peak

### Risk Management
- **Position Sizing**: Configurable trade sizes
- **Stop Loss**: Automated loss prevention
- **Take Profit**: Locked-in profit targets
- **Maximum Positions**: Limit concurrent trades

## 🚨 Important Notes

### Trading Hours
- **Active Window**: 10:00 AM to 11:00 PM IST
- **Outside Hours**: Bot monitors but doesn't trade
- **Time Zone**: All times are in Indian Standard Time (IST)

### Risk Disclaimer
- **High Risk**: Cryptocurrency trading involves substantial risk
- **No Guarantees**: Past performance doesn't guarantee future results
- **Capital Loss**: You can lose your entire investment
- **Professional Use**: Designed for experienced traders

### Testing Recommendations
- **Start Small**: Begin with test mode and small amounts
- **Monitor Closely**: Watch bot performance initially
- **Adjust Parameters**: Fine-tune strategy settings
- **Paper Trading**: Use test mode for strategy validation

## 🐛 Troubleshooting

### Common Issues

#### Connection Problems
- Verify API credentials are correct
- Check internet connection
- Ensure API permissions are enabled
- Verify IP restrictions on exchange

#### No Trading Signals
- Check if within trading window (10AM-11PM IST)
- Verify market conditions meet strategy criteria
- Check EMA calculations and pattern recognition
- Review strategy parameters

#### Performance Issues
- Monitor system resources
- Check exchange API rate limits
- Verify WebSocket connection stability
- Review error logs in console

### Error Codes
- **E001**: API authentication failed
- **E002**: Exchange connection timeout
- **E003**: Insufficient balance
- **E004**: Order placement failed
- **E005**: Strategy analysis error

## 🔄 Updates and Maintenance

### Regular Maintenance
- **Daily**: Review trading performance
- **Weekly**: Analyze strategy effectiveness
- **Monthly**: Update strategy parameters
- **Quarterly**: Review and optimize code

### Version Updates
- **Check Releases**: Monitor for new versions
- **Backup Data**: Export settings before updates
- **Test Changes**: Verify functionality after updates
- **Rollback Plan**: Keep previous version available

## 📚 Technical Documentation

### Architecture
- **Frontend**: Electron + HTML/CSS/JavaScript
- **Backend**: Node.js with WebSocket support
- **Charts**: TradingView Lightweight Charts
- **Database**: Local storage (SQLite)

### API Integration
- **REST APIs**: Historical data and order placement
- **WebSocket**: Real-time market data streaming
- **Authentication**: HMAC-SHA256 signature generation
- **Rate Limiting**: Built-in API call throttling

### Performance Optimization
- **Memory Management**: Efficient data structures
- **Network Optimization**: Connection pooling
- **UI Responsiveness**: Asynchronous operations
- **Resource Cleanup**: Proper cleanup on exit

## 🤝 Support and Community

### Getting Help
- **Documentation**: Review this README thoroughly
- **Console Logs**: Check browser console for errors
- **GitHub Issues**: Report bugs and request features
- **Community**: Join trading bot communities

### Contributing
- **Code Quality**: Follow existing code standards
- **Testing**: Test changes thoroughly
- **Documentation**: Update docs for new features
- **Pull Requests**: Submit well-documented PRs

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Legal Disclaimer

This software is for educational and professional use only. Users are responsible for:
- Compliance with local trading regulations
- Understanding cryptocurrency trading risks
- Managing their own trading capital
- Verifying exchange terms and conditions

The developers are not responsible for any financial losses incurred through the use of this software.

## 🎉 Getting Started

1. **Install the application** following the installation guide
2. **Configure your exchange API** with proper permissions
3. **Start with Test Mode** to validate the strategy
4. **Monitor performance** and adjust parameters as needed
5. **Switch to Live Mode** when confident in the strategy

Happy Trading! 🚀📈
