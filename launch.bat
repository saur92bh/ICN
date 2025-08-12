@echo off
echo 🚀 Launching EMA Strategy Trading Bot...
echo ========================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 16+ first.
    pause
    exit /b 1
)

echo ✅ Node.js version: 
node --version

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

echo 🔧 Starting the trading bot...
echo 📱 The application will open in a new window.
echo ⏳ Please wait...

REM Start the application
npm start

echo 👋 Trading bot application closed.
pause