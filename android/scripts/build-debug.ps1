$ErrorActionPreference = 'Stop'
$androidRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$localSdk = Join-Path $androidRoot '.android-sdk'
$env:ANDROID_SDK_ROOT = if (Test-Path -LiteralPath $localSdk) { $localSdk } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_USER_HOME = Join-Path $androidRoot '.android-user-home'
$env:GRADLE_USER_HOME = Join-Path $androidRoot '.gradle-user-home'
$sdkProperty = $env:ANDROID_SDK_ROOT.Replace('\', '\\')
[System.IO.File]::WriteAllText((Join-Path $androidRoot 'local.properties'), "sdk.dir=$sdkProperty`n")
& "$androidRoot\gradlew.bat" -p $androidRoot clean assembleDebug --offline
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "$androidRoot\app\build\outputs\apk\debug\app-debug.apk"
