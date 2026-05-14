@echo off
:: 进入你放代码的 API 文件夹
cd /d "C:\Users\123\Desktop\Ember\api"

:: 启动 Python 后端 (放在后台)
start /b python -m uvicorn xhs_api_server:app --port 8000

:: 启动固定隧道路由 (把你刚才想的名字替换掉下面最后的那个词)
start /b npx localtunnel --port 8000 --subdomain ember-api-zhang123