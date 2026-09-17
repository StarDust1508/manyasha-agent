@echo off
setlocal
node "%~dp0..\src\cli.mjs" %*
exit /b %errorlevel%
