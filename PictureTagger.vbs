Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appDir

' Check if node is available
On Error Resume Next
exitCode = shell.Run("cmd /c where node >nul 2>&1", 0, True)
On Error GoTo 0

If exitCode <> 0 Then
  MsgBox "Node.js not found. Please install Node.js 18+.", 16, "PictureTagger"
  WScript.Quit 1
End If

' Launch server hidden (0) without waiting (False); --open opens browser automatically
shell.Run "node """ & appDir & "\server.js"" --open", 0, False
