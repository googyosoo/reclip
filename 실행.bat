@echo off
chcp 65001 >nul
title Reclip Pro - 수업용 미디어 다운로더
cd /d "%~dp0"

echo ======================================================================
echo    Reclip Pro — 선생님을 위한 수업 자료 미디어 도구
echo ======================================================================
echo.

:: 1. Node.js 확인
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다!
    echo   👉 공식 웹사이트에서 LTS 버전을 설치해 주세요:
    echo      https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [1/4] Node.js 확인 완료: %NODE_VER%

:: 2. yt-dlp 확인 및 자동 설치
set YTDLP_FOUND=0
where yt-dlp >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set YTDLP_FOUND=1
    echo [2/4] yt-dlp 확인 완료: 시스템 PATH에 등록됨
) else (
    python -m yt_dlp --version >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set YTDLP_FOUND=1
        echo [2/4] yt-dlp 확인 완료: Python 모듈로 실행 가능
    ) else (
        echo [2/4] yt-dlp를 찾을 수 없습니다. 자동 설치를 시도합니다...
        where python >nul 2>nul
        if %ERRORLEVEL% equ 0 (
            echo      pip를 통해 yt-dlp를 설치합니다...
            python -m pip install --upgrade yt-dlp
            python -m yt_dlp --version >nul 2>nul
            if %ERRORLEVEL% equ 0 (
                set YTDLP_FOUND=1
                echo      yt-dlp 자동 설치 완료!
            )
        )
    )
)

if %YTDLP_FOUND% equ 0 (
    echo.
    echo [경고] yt-dlp가 설치되지 않았습니다!
    echo   👉 해결 방법 1: Python 설치 후 'pip install yt-dlp' 실행
    echo   👉 해결 방법 2: https://github.com/yt-dlp/yt-dlp/releases 에서
    echo      yt-dlp.exe를 다운로드하여 Windows 경로에 넣어주세요.
    echo.
    pause
    exit /b 1
)

:: 3. ffmpeg 확인
where ffmpeg >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo [주의] ffmpeg가 시스템 경로에 없습니다.
    echo      고화질 영상(1080p 이상) 병합 및 MP3 변환에 필요합니다.
    echo   👉 간편 설치: 관리자 터미널에서 'winget install Gyan.FFmpeg' 실행
    echo      또는 https://www.gyan.dev/ffmpeg/builds/ 에서 다운로드 가능합니다.
    echo.
    timeout /t 3 >nul
) else (
    echo [3/4] ffmpeg 확인 완료: 미디어 병합 및 변환 지원
)

:: 4. npm 패키지 설치 확인
if not exist "node_modules\" (
    echo.
    echo [4/4] 필요한 패키지를 최초 1회 설치합니다 (npm install)...
    call npm install --silent
    if %ERRORLEVEL% neq 0 (
        echo [오류] npm 패키지 설치에 실패했습니다.
        pause
        exit /b 1
    )
    echo      패키지 설치 완료!
) else (
    echo [4/4] 필수 패키지 준비 완료
)

echo.
echo ======================================================================
echo    Reclip Pro 서버를 시작합니다.
echo    브라우저가 자동으로 열립니다: http://127.0.0.1:8080
echo    종료하시려면 이 창에서 Ctrl+C 를 누르세요.
echo ======================================================================
echo.

:: 서버 시작 전 브라우저 열기 (1초 지연 후 접속)
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:8080"

:: 서버 실행
node server.js
