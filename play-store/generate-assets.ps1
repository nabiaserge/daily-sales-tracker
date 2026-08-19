$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputRoot = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

function New-RoundedRectanglePath {
    param([float]$X,[float]$Y,[float]$Width,[float]$Height,[float]$Radius)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $path.AddArc($X,$Y,$diameter,$diameter,180,90)
    $path.AddArc($X+$Width-$diameter,$Y,$diameter,$diameter,270,90)
    $path.AddArc($X+$Width-$diameter,$Y+$Height-$diameter,$diameter,$diameter,0,90)
    $path.AddArc($X,$Y+$Height-$diameter,$diameter,$diameter,90,90)
    $path.CloseFigure()
    return $path
}

function Save-Png {
    param([System.Drawing.Bitmap]$Bitmap,[string]$Name)
    $path = Join-Path $outputRoot $Name
    $Bitmap.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
    $Bitmap.Dispose()
}

$teal = [System.Drawing.Color]::FromArgb(15,118,110)
$dark = [System.Drawing.Color]::FromArgb(11,94,88)
$mint = [System.Drawing.Color]::FromArgb(153,246,228)
$paper = [System.Drawing.Color]::FromArgb(244,248,247)

$icon = New-Object System.Drawing.Bitmap 512,512
$graphics = [System.Drawing.Graphics]::FromImage($icon)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear($teal)
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Rectangle]::new(0,0,512,512),$teal,$dark,45)
$graphics.FillRectangle($gradient,0,0,512,512)
$font = New-Object System.Drawing.Font('Segoe UI',240,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('V',$font,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new(18,8,476,470),$format)
$barBrush = New-Object System.Drawing.SolidBrush $mint
$graphics.FillRectangle($barBrush,338,100,28,70)
$graphics.FillRectangle($barBrush,380,62,28,108)
$graphics.Dispose(); $gradient.Dispose(); $font.Dispose(); $format.Dispose(); $barBrush.Dispose()
Save-Png $icon 'icon-512.png'

$feature = New-Object System.Drawing.Bitmap 1024,500
$graphics = [System.Drawing.Graphics]::FromImage($feature)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear($paper)
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Rectangle]::new(0,0,1024,500),$teal,$dark,20)
$graphics.FillRectangle($gradient,0,0,1024,500)
$circleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24,255,255,255))
$graphics.FillEllipse($circleBrush,680,-130,470,470)
$graphics.FillEllipse($circleBrush,770,230,320,320)
$logoPath = New-RoundedRectanglePath 74 78 170 170 44
$graphics.FillPath([System.Drawing.Brushes]::White,$logoPath)
$logoFont = New-Object System.Drawing.Font('Segoe UI',105,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$logoBrush = New-Object System.Drawing.SolidBrush $teal
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('V',$logoFont,$logoBrush,[System.Drawing.RectangleF]::new(75,76,170,170),$format)
$titleFont = New-Object System.Drawing.Font('Segoe UI',68,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = New-Object System.Drawing.Font('Segoe UI',28,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('Ventes.',$titleFont,[System.Drawing.Brushes]::White,74,286)
$graphics.DrawString('Suivez. Analysez. Décidez.',$subtitleFont,[System.Drawing.Brushes]::White,78,380)
$graphics.Dispose(); $gradient.Dispose(); $circleBrush.Dispose(); $logoPath.Dispose(); $logoFont.Dispose(); $logoBrush.Dispose(); $format.Dispose(); $titleFont.Dispose(); $subtitleFont.Dispose()
Save-Png $feature 'feature-graphic-1024x500.png'

Write-Output $outputRoot
