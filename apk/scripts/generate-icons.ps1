Add-Type -AssemblyName System.Drawing

$sourcePath = "$PSScriptRoot\..\icon-512.png"
if (-not (Test-Path $sourcePath)) {
    Write-Error "Source icon not found: $sourcePath"
    exit 1
}

$srcImg = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sourcePath).Path)
Write-Host "Source image loaded: $($srcImg.Width)x$($srcImg.Height)"

$c1 = $srcImg.GetPixel(0, 0)
Write-Host ("Corner pixel: A={0} R={1} G={2} B={3}" -f $c1.A, $c1.R, $c1.G, $c1.B)

$resDir = "$PSScriptRoot\..\android\app\src\main\res"

# Density map for standard icons (square/round) and foregrounds (adaptive)
$mipmapConfigs = @(
    @{ Folder = "mipmap-mdpi";    IconSize = 48;  FgSize = 108 },
    @{ Folder = "mipmap-hdpi";    IconSize = 72;  FgSize = 162 },
    @{ Folder = "mipmap-xhdpi";   IconSize = 96;  FgSize = 216 },
    @{ Folder = "mipmap-xxhdpi";  IconSize = 144; FgSize = 324 },
    @{ Folder = "mipmap-xxxhdpi"; IconSize = 192; FgSize = 432 }
)

function Resize-Image {
    param(
        [System.Drawing.Bitmap]$source,
        [int]$targetWidth,
        [int]$targetHeight,
        [string]$outputPath,
        [bool]$centerWithPadding = $false,
        [float]$paddingRatio = 0.72,
        [System.Drawing.Color]$bgColor = [System.Drawing.Color]::Transparent
    )

    $targetBmp = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($targetBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($bgColor -ne [System.Drawing.Color]::Transparent) {
        $brush = New-Object System.Drawing.SolidBrush($bgColor)
        $g.FillRectangle($brush, 0, 0, $targetWidth, $targetHeight)
        $brush.Dispose()
    }

    if ($centerWithPadding) {
        $contentW = [int]($targetWidth * $paddingRatio)
        $contentH = [int]($targetHeight * $paddingRatio)
        $x = [int](($targetWidth - $contentW) / 2)
        $y = [int](($targetHeight - $contentH) / 2)
        $g.DrawImage($source, $x, $y, $contentW, $contentH)
    } else {
        $g.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
    }

    $g.Dispose()

    if (Test-Path $outputPath) {
        Remove-Item $outputPath -Force
    }
    $targetBmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $targetBmp.Dispose()
    Write-Host "Generated: $outputPath"
}

$brandColor = [System.Drawing.Color]::FromArgb(255, 0, 43, 73) # #002B49

foreach ($cfg in $mipmapConfigs) {
    $folderPath = Join-Path $resDir $cfg.Folder
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
    }

    # ic_launcher.png (standard icon)
    Resize-Image -source $srcImg -targetWidth $cfg.IconSize -targetHeight $cfg.IconSize -outputPath (Join-Path $folderPath "ic_launcher.png") -bgColor $brandColor
    # ic_launcher_round.png
    Resize-Image -source $srcImg -targetWidth $cfg.IconSize -targetHeight $cfg.IconSize -outputPath (Join-Path $folderPath "ic_launcher_round.png") -bgColor $brandColor
    # ic_launcher_foreground.png (safe zone centered, transparent background)
    Resize-Image -source $srcImg -targetWidth $cfg.FgSize -targetHeight $cfg.FgSize -outputPath (Join-Path $folderPath "ic_launcher_foreground.png") -centerWithPadding $true -paddingRatio 0.70
}

# Update splash images
$splashFiles = Get-ChildItem -Path $resDir -Filter "splash.png" -Recurse
foreach ($sp in $splashFiles) {
    try {
        $orig = [System.Drawing.Bitmap]::FromFile($sp.FullName)
        $w = $orig.Width
        $h = $orig.Height
        $orig.Dispose()

        $splashBmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($splashBmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        
        $brush = New-Object System.Drawing.SolidBrush($brandColor)
        $g.FillRectangle($brush, 0, 0, $w, $h)
        $brush.Dispose()

        $logoSize = [Math]::Min($w, $h) * 0.40
        $x = ($w - $logoSize) / 2
        $y = ($h - $logoSize) / 2
        $g.DrawImage($srcImg, [int]$x, [int]$y, [int]$logoSize, [int]$logoSize)
        $g.Dispose()

        Remove-Item $sp.FullName -Force
        $splashBmp.Save($sp.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
        $splashBmp.Dispose()
        Write-Host "Updated splash: $($sp.FullName) ($w x $h)"
    } catch {
        Write-Warning "Failed to update splash $($sp.FullName): $_"
    }
}

$srcImg.Dispose()
Write-Host "All icons and splashes generated successfully!"
