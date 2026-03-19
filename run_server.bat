@echo off
cd /d "%~dp0"
python -m http.server 8001 --bind 127.0.0.1 > server.log 2>&1
