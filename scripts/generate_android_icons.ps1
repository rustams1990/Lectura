Add-Type -AssemblyName System.Drawing

$srcPath = "c:\Users\User\Desktop\Lectura\public\icon-512.png"
$srcImg = [System.Drawing.Image]::FromFile($srcPath)

$configs = @(
    @{ Dir = "mipmap-mdpi"; Size = 48; ForeSize = 108 },
    @{ Dir = "mipmap-hdpi"; Size = 72; ForeSize = 162 },
    @{ Dir = "mipmap-xhdpi"; Size = 96; ForeSize = 216 },
    @{ Dir = "mipmap-xxhdpi"; Size = 144; ForeSize = 324 },
    @{ Dir = "mipmap-xxxhdpi"; Size = 192; ForeSize = 432 }
)

foreach ($cfg in $configs) {
    $dirPath = "c:\Users\User\Desktop\Lectura\android\app\src\main\res\" + $cfg.Dir
    if (-not (Test-Path $dirPath)) {
        New-Item -ItemType Directory -Path $dirPath -Force | Out-Null
    }

    # Standard & Round Icon
    $bmp = New-Object System.Drawing.Bitmap($cfg.Size, $cfg.Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($srcImg, 0, 0, $cfg.Size, $cfg.Size)
    $g.Dispose()

    $bmp.Save((Join-Path $dirPath "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save((Join-Path $dirPath "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    # Foreground Icon for Adaptive Icons (with safe zone margin)
    $foreBmp = New-Object System.Drawing.Bitmap($cfg.ForeSize, $cfg.ForeSize)
    $fg = [System.Drawing.Graphics]::FromImage($foreBmp)
    $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $fg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $iconInnerSize = [int]($cfg.ForeSize * 0.72)
    $offset = [int](($cfg.ForeSize - $iconInnerSize) / 2)
    $fg.DrawImage($srcImg, $offset, $offset, $iconInnerSize, $iconInnerSize)
    $fg.Dispose()

    $foreBmp.Save((Join-Path $dirPath "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $foreBmp.Dispose()

    Write-Host "Generated icons for $($cfg.Dir)"
}

$srcImg.Dispose()
Write-Host "All Android icons generated successfully!"
