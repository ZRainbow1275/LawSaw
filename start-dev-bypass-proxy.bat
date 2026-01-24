@echo off
chcp 65001 >nul
echo ============================================
echo   LawSaw Dev Server - Proxy Bypass Mode
echo ============================================
echo.

:: 设置环境变量绕过代理
set NO_PROXY=localhost,127.0.0.1,0.0.0.0
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=

:: 切换到项目目录
cd /d D:\Desktop\LawSaw

:: 启动开发服务器 (绑定到所有接口)
echo Starting dev server on http://localhost:8849
echo NO_PROXY=%NO_PROXY%
echo.
pnpm --filter @law-eye/web dev
