@echo off
setlocal
node "%~dp0..\scripts\pinned-hermes.mjs" %*
exit /b %errorlevel%
