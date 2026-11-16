Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverPath = Replace(appDir & "\server.js", "'", "''")

psCmd = "powershell.exe -NoProfile -WindowStyle Hidden -Command ""$procs = Get-CimInstance Win32_Process -Filter \""Name='node.exe'\"" | Where-Object { $_.CommandLine -like '*" & serverPath & "*' }; if ($procs) { $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; exit 0 } else { exit 2 }"""

code = shell.Run(psCmd, 0, True)

If code = 0 Then
  MsgBox "PictureTagger server stopped.", 64, "PictureTagger"
Else
  MsgBox "PictureTagger server is not running.", 64, "PictureTagger"
End If
