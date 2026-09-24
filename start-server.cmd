@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js belum terpasang di komputer ini.
  echo  Install dahulu dari https://nodejs.org (versi 24 atau lebih baru), lalu jalankan lagi.
  echo.
  pause
  exit /b 1
)
node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js yang terpasang terlalu lama (modul sqlite bawaan belum tersedia).
  echo  Install Node.js versi 24 atau lebih baru dari https://nodejs.org
  echo.
  pause
  exit /b 1
)
echo.
echo  Menjalankan server Restock.id... buka http://localhost:3000 di browser.
echo  Tutup jendela ini untuk menghentikan server.
echo.
node server.js
pause