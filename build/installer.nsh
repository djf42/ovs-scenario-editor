; installer.nsh
; Custom NSIS include for OVS Scenario Editor.
; Recreates the desktop shortcut with the icon path explicitly set,
; which fixes Windows showing the default Electron icon on the desktop.

!macro customInstall
  ; Delete the shortcut electron-builder just created and remake it
  ; with an explicit icon reference so Windows uses the correct icon.
  Delete "$DESKTOP\OVS Scenario Editor.lnk"
  CreateShortcut "$DESKTOP\OVS Scenario Editor.lnk" \
    "$INSTDIR\OVS Scenario Editor.exe" \
    "" \
    "$INSTDIR\OVS Scenario Editor.exe" \
    0
!macroend
