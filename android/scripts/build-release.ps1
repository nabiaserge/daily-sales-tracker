$ErrorActionPreference = 'Stop'
$androidRoot = Split-Path -Parent $PSScriptRoot
$secretRoot = 'C:\Users\guyse\Documents\Codex\secrets\suivi-ventes'
$passwordFile = Join-Path $secretRoot 'upload-password.txt'
$keystoreFile = Join-Path $secretRoot 'suivi-ventes-upload.jks'

if (!(Test-Path -LiteralPath $passwordFile) -or !(Test-Path -LiteralPath $keystoreFile)) {
    throw 'Clé de signature absente. Exécutez android/scripts/create-upload-key.ps1 une seule fois.'
}

$plainPassword = [System.IO.File]::ReadAllText($passwordFile).Trim()

try {
    $env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
    $localSdk = Join-Path $androidRoot '.android-sdk'
    $env:ANDROID_SDK_ROOT = if (Test-Path -LiteralPath $localSdk) { $localSdk } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" }
    $env:ANDROID_USER_HOME = Join-Path $androidRoot '.android-user-home'
    $env:GRADLE_USER_HOME = Join-Path $androidRoot '.gradle-user-home'
    $sdkProperty = $env:ANDROID_SDK_ROOT.Replace('\', '\\')
    [System.IO.File]::WriteAllText((Join-Path $androidRoot 'local.properties'), "sdk.dir=$sdkProperty`n")
    $env:SIGNING_STORE_FILE = $keystoreFile
    $env:SIGNING_STORE_PASSWORD = $plainPassword
    $env:SIGNING_KEY_ALIAS = 'suivi-ventes-upload'
    $env:SIGNING_KEY_PASSWORD = $plainPassword
    & "$androidRoot\gradlew.bat" -p $androidRoot clean bundleRelease assembleRelease --offline
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output "$androidRoot\app\build\outputs\bundle\release\app-release.aab"
    Write-Output "$androidRoot\app\build\outputs\apk\release\app-release.apk"
} finally {
    Remove-Item Env:SIGNING_STORE_FILE -ErrorAction SilentlyContinue
    Remove-Item Env:SIGNING_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SIGNING_KEY_ALIAS -ErrorAction SilentlyContinue
    Remove-Item Env:SIGNING_KEY_PASSWORD -ErrorAction SilentlyContinue
    $plainPassword = $null
}
