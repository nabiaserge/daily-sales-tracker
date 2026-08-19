$ErrorActionPreference = 'Stop'
$secretRoot = 'C:\Users\guyse\Documents\Codex\secrets\suivi-ventes'
$passwordFile = Join-Path $secretRoot 'upload-password.txt'
$keystoreFile = Join-Path $secretRoot 'suivi-ventes-upload.jks'

if ((Test-Path -LiteralPath $passwordFile) -or (Test-Path -LiteralPath $keystoreFile)) {
    throw "Une clé existe déjà dans $secretRoot. Elle ne sera pas remplacée."
}

New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null
$randomBytes = New-Object byte[] 32
$randomNumberGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomNumberGenerator.GetBytes($randomBytes)
$randomNumberGenerator.Dispose()
$plainPassword = [Convert]::ToBase64String($randomBytes)
[System.IO.File]::WriteAllText($passwordFile, $plainPassword)
[System.IO.File]::SetAttributes($passwordFile, [System.IO.FileAttributes]::Hidden)

$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
& $keytool -genkeypair -v -keystore $keystoreFile -storepass $plainPassword -keypass $plainPassword -alias 'suivi-ventes-upload' -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Suivi Ventes, OU=Mobile, O=Nabia, L=NDjamena, C=TD'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$plainPassword = $null
Write-Output "Clé créée dans $secretRoot. Sauvegardez ce dossier dans un emplacement privé distinct."
