Set sh = CreateObject("WScript.Shell")
sh.Run """" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\uxermanager.exe""", 0, False
