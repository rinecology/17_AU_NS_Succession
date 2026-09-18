@echo off
cd /d "%~dp0dist"
echo Succession pathways — http://localhost:8000
python -m http.server 8000
pause
