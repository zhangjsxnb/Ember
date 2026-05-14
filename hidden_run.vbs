Set ws = CreateObject("Wscript.Shell")
' 运行刚才那个 bat 脚本，0 代表完全隐藏窗口
ws.run "cmd /c C:\Users\123\Desktop\Ember\start_backend.bat", 0