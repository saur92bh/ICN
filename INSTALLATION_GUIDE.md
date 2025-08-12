# 🚀 EMA Strategy Trading Bot - Installation Guide

## 📋 Quick Start

### Prerequisites
- **Node.js 16+** and **npm 8+**
- **Operating System**: Windows 10+, macOS 10.14+, or Linux (Ubuntu 18.04+)
- **Exchange Account** with API access (Binance, Bybit, BingX, OKX, or KuCoin)

### 🎯 One-Click Installation

#### Windows Users
```bash
# Double-click the launch.bat file
# OR run in Command Prompt:
launch.bat
```

#### Linux/macOS Users
```bash
# Make executable and run:
chmod +x launch.sh
./launch.sh

# OR run directly:
bash launch.sh
```

## 🔧 Manual Installation

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start the Application
```bash
npm start
```

### Step 3: Build for Distribution (Optional)
```bash
npm run build
```

## 📁 Project Structure

```
ema-strategy-trading-bot/
├── src/                          # Source code
│   ├── main.js                   # Electron main process
│   ├── index.html                # Main application UI
│   └── js/                       # JavaScript modules
│       ├── exchange-api.js       # Exchange connectivity
│       ├── trading-strategy.js   # EMA strategy logic
│       ├── chart-manager.js      # Chart management
│       ├── ui-manager.js         # User interface
│       └── main.js               # Application controller
├── assets/                       # Application assets
├── package.json                  # Dependencies and scripts
├── launch.sh                     # Linux/macOS launcher
├── launch.bat                    # Windows launcher
└── README.md                     # Comprehensive documentation
```

## 🎯 First-Time Setup

### 1. Launch Application
- Run the launcher script for your OS
- Wait for the application to load
- You'll see a professional trading dashboard

### 2. Configure Exchange API
- **Select Exchange**: Choose from supported exchanges
- **Choose Symbol**: BTCUSDT, XAUUSDT, ETHUSDT, etc.
- **Enter API Key**: Your exchange API key
- **Enter API Secret**: Your exchange API secret
- **Enable Test Mode**: Recommended for initial testing

### 3. Connect to Exchange
- Click "Connect" button
- Wait for connection confirmation
- Verify real-time data is flowing

### 4. Start Trading Strategy
- Click "Start Trading" button
- Monitor strategy analysis in real-time
- Watch for BUY/SELL signals

## 🔑 API Configuration

### Supported Exchanges
- **Binance**: Most popular, excellent API
- **Bybit**: Good for futures trading
- **BingX**: User-friendly interface
- **OKX**: Professional trading features
- **KuCoin**: Wide altcoin selection

### Required API Permissions
- **Read**: Market data access
- **Futures Trading**: Order placement
- **IP Restrictions**: Enable for security

### API Key Security
- ✅ Store locally only
- ✅ Never share with others
- ✅ Enable IP whitelisting
- ✅ Use test mode initially

## 📊 Strategy Configuration

### Default Parameters
```javascript
{
  ema9Period: 9,           // 9-period EMA
  ema15Period: 15,         // 15-period EMA
  riskRewardRatio: 2.0,    // 1:2 risk-reward
  positionSize: 0.01,      // BTC amount per trade
  stopLossBuffer: 10,      // USD buffer for stop loss
  volumeThreshold: 1.2,    // Volume confirmation
  emaSlopeThreshold: 0.001 // Trend strength requirement
}
```

### Trading Window
- **Active Hours**: 10:00 AM - 11:00 PM IST
- **Time Zone**: Indian Standard Time (UTC+5:30)
- **Outside Hours**: Monitoring only, no trades

## 🚨 Important Notes

### Risk Management
- **Start Small**: Begin with test mode
- **Monitor Closely**: Watch initial performance
- **Adjust Parameters**: Fine-tune strategy settings
- **Set Limits**: Maximum position sizes

### Testing Recommendations
- **Paper Trading**: Use test mode first
- **Small Amounts**: Start with minimal capital
- **Performance Review**: Analyze results weekly
- **Strategy Refinement**: Adjust based on performance

## 🐛 Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check Node.js version
node --version  # Should be 16+

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check for errors
npm start
```

#### Connection Issues
- Verify API credentials
- Check internet connection
- Ensure API permissions are correct
- Verify IP restrictions on exchange

#### No Trading Signals
- Check trading window (10AM-11PM IST)
- Verify market conditions
- Review strategy parameters
- Check console for errors

### Error Codes
- **E001**: API authentication failed
- **E002**: Exchange connection timeout
- **E003**: Insufficient balance
- **E004**: Order placement failed
- **E005**: Strategy analysis error

## 🔄 Updates and Maintenance

### Regular Tasks
- **Daily**: Review trading performance
- **Weekly**: Analyze strategy effectiveness
- **Monthly**: Update strategy parameters
- **Quarterly**: Review and optimize code

### Version Updates
```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Restart application
npm start
```

## 📞 Support

### Getting Help
1. **Check Documentation**: Review README.md thoroughly
2. **Console Logs**: Check browser console for errors
3. **Community**: Join trading bot communities
4. **Issues**: Report bugs on GitHub

### Useful Commands
```bash
# Development mode
npm run dev

# Build application
npm run build

# Package for distribution
npm run dist

# Check application status
npm run status
```

## 🎉 Success Checklist

- [ ] Application launches successfully
- [ ] Exchange API connection established
- [ ] Real-time market data flowing
- [ ] Trading strategy activated
- [ ] First signals detected
- [ ] Performance metrics tracking
- [ ] Risk management configured
- [ ] Regular monitoring established

## ⚠️ Legal Disclaimer

This software is for educational and professional use only. Users are responsible for:
- Compliance with local trading regulations
- Understanding cryptocurrency trading risks
- Managing their own trading capital
- Verifying exchange terms and conditions

**The developers are not responsible for any financial losses incurred through the use of this software.**

---

## 🚀 Ready to Trade?

1. **Install** the application following this guide
2. **Configure** your exchange API credentials
3. **Test** the strategy in test mode
4. **Monitor** performance and adjust parameters
5. **Go Live** when confident in the strategy

**Happy Trading! 🎯📈**

---

*For detailed technical documentation, see README.md*
*For troubleshooting, check the console logs and error messages*