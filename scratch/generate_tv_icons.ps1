Add-Type -AssemblyName System.Drawing

$srcPath = "c:\antigravity\project\lumiere\front\tizen\icon.png"
$srcImg = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "Source icon loaded: $($srcImg.Width) x $($srcImg.Height)"

$ribCropW = 312
$ribCropH = 250
$ribCrop = New-Object System.Drawing.Bitmap($ribCropW, $ribCropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Clean cutout of ribbon where dark background (< 18) is transparent,
# and original fiery flare is softened to a clean base.
for ($y = 0; $y -lt $ribCropH; $y++) {
    for ($x = 0; $x -lt $ribCropW; $x++) {
        $p = $srcImg.GetPixel($x + 145, $y + 88)
        $bright = [int](($p.R * 0.299) + ($p.G * 0.587) + ($p.B * 0.114))

        if ($bright -lt 16) {
            $ribCrop.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            $curA = 255
            $curR = $p.R
            $curG = $p.G
            $curB = $p.B
            if ($bright -lt 36) {
                $curA = [int](($bright - 16) / 20.0 * 255)
            }
            # Tame original fire flare so the theatrical beam shines cleanly
            if ($x -gt 195 -and $y -ge 50 -and $y -le 180) {
                $dist = [Math]::Sqrt(($x - 197)*($x - 197) + ($y - 117)*($y - 117))
                $damp = [Math]::Max(0.0, [Math]::Min(1.0, 1.0 - ($dist / 35.0)))
                $curA = [int]($curA * $damp * 0.7)
            }
            $ribCrop.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($curA, $curR, $curG, $curB))
        }
    }
}

$txtCropW = 340
$txtCropH = 65
$txtCrop = New-Object System.Drawing.Bitmap($txtCropW, $txtCropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $txtCropH; $y++) {
    for ($x = 0; $x -lt $txtCropW; $x++) {
        $p = $srcImg.GetPixel($x + 90, $y + 360)
        $bright = [int](($p.R * 0.299) + ($p.G * 0.587) + ($p.B * 0.114))
        if ($bright -lt 16) {
            $txtCrop.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } elseif ($bright -lt 36) {
            $alpha = [int](($bright - 16) / 20.0 * 255)
            $txtCrop.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $p.R, $p.G, $p.B))
        } else {
            $txtCrop.SetPixel($x, $y, $p)
        }
    }
}

function Generate-TVBanner($W, $H, $destPath) {
    $parent = Split-Path $destPath -Parent
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    $banner = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($banner)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Background: Deep rich cinematic dark gradient
    $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
    $cLeft = [System.Drawing.Color]::FromArgb(255, 10, 11, 16)
    $cRight = [System.Drawing.Color]::FromArgb(255, 17, 20, 27)
    $linBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $cLeft, $cRight, [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $g.FillRectangle($linBrush, $rect)
    $linBrush.Dispose()

    # Border
    $bPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 255, 215, 0), 1)
    $g.DrawRectangle($bPen, 0, 0, $W - 1, $H - 1)
    $bPen.Dispose()

    # Coordinates
    $ribTargetH = [int]($H * 0.64)
    $ribTargetW = [int]($ribTargetH * ($ribCropW / $ribCropH))
    $ribX = [int]($W * 0.06)
    $ribY = [int](($H - $ribTargetH) / 2)
    $destRib = New-Object System.Drawing.Rectangle($ribX, $ribY, $ribTargetW, $ribTargetH)

    [float]$lx = [float]($ribX + ($ribTargetW * (197.0 / $ribCropW)))
    [float]$ly = [float]($ribY + ($ribTargetH * (117.0 / $ribCropH)))

    # --- VARIANT 5: Wide Theater Spotlight (UNDER Ribbon) ---
    $pts = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF($lx, $ly)),
        (New-Object System.Drawing.PointF([float]$W, 0.0)),
        (New-Object System.Drawing.PointF([float]$W, [float]$H)),
        (New-Object System.Drawing.PointF($lx, [float]($ly + 30.0 * ($H / 360.0))))
    )
    $widePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $widePath.AddPolygon($pts)
    $wpgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($widePath)
    $wpgb.CenterPoint = New-Object System.Drawing.PointF($lx, $ly)
    $wpgb.CenterColor = [System.Drawing.Color]::FromArgb(50, 255, 215, 120)
    $wpgb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 10, 11, 16))
    $g.FillPath($wpgb, $widePath)
    $wpgb.Dispose()
    $widePath.Dispose()

    # Draw Ribbon on left
    $srcRib = New-Object System.Drawing.Rectangle(0, 0, $ribCropW, $ribCropH)
    $g.DrawImage($ribCrop, $destRib, $srcRib.X, $srcRib.Y, $srcRib.Width, $srcRib.Height, [System.Drawing.GraphicsUnit]::Pixel)

    # --- VARIANT 5: Projector Lens Hotspot (OVER Ribbon) ---
    $lensRadius = [float](12.0 * ($H / 360.0))
    $lensPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $lensPath.AddEllipse([float]($lx - $lensRadius), [float]($ly - $lensRadius), [float]($lensRadius * 2), [float]($lensRadius * 2))
    $lpgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($lensPath)
    $lpgb.CenterColor = [System.Drawing.Color]::FromArgb(255, 255, 245, 210)
    $lpgb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 235, 175, 50))
    $g.FillPath($lpgb, $lensPath)
    $lpgb.Dispose()
    $lensPath.Dispose()

    # Draw Text on right
    $txtTargetW = [int]($W * 0.43)
    $txtTargetH = [int]($txtTargetW * ($txtCropH / $txtCropW))
    $txtX = [int]($W * 0.51)
    $txtY = [int](($H - $txtTargetH) / 2) - [int]($H * 0.028)
    $destTxt = New-Object System.Drawing.Rectangle($txtX, $txtY, $txtTargetW, $txtTargetH)
    $srcTxt = New-Object System.Drawing.Rectangle(0, 0, $txtCropW, $txtCropH)
    $g.DrawImage($txtCrop, $destTxt, $srcTxt.X, $srcTxt.Y, $srcTxt.Width, $srcTxt.Height, [System.Drawing.GraphicsUnit]::Pixel)

    # Subtitle "CINEMA & TV"
    $fontSize = [float]($H * 0.038)
    if ($fontSize -lt 7) { $fontSize = 7 }
    $fontFamily = New-Object System.Drawing.FontFamily("Arial")
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 220, 160, 40))
    $subX = $txtX + [int]($txtTargetW * 0.16)
    $subY = $txtY + $txtTargetH + [int]($H * 0.038)
    $g.DrawString("CINEMA & TV", $font, $subBrush, $subX, $subY)
    $subBrush.Dispose()
    $font.Dispose()
    $fontFamily.Dispose()

    # Subtle gold accent line
    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 212, 160, 23), [float]($H * 0.005 + 1))
    $g.DrawLine($linePen, $txtX + 5, $txtY + $txtTargetH + [int]($H * 0.022), $txtX + $txtTargetW - 5, $txtY + $txtTargetH + [int]($H * 0.022))
    $linePen.Dispose()

    $banner.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $banner.Dispose()
    Write-Host "Generated Banner ($($W)x$($H)): $destPath"
}

function Generate-SquareIcon($size, $destPath) {
    $parent = Split-Path $destPath -Parent
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    $destBmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Dark background
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 11, 16))
    $g.FillRectangle($bgBrush, $rect)
    $bgBrush.Dispose()

    # Ribbon symbol filling 78% of the square
    $drawH = [int]($size * 0.78)
    $drawW = [int]($drawH * ($ribCropW / $ribCropH))
    $posX = [int](($size - $drawW) / 2)
    $posY = [int](($size - $drawH) / 2)

    [float]$lx = [float]($posX + ($drawW * (197.0 / $ribCropW)))
    [float]$ly = [float]($posY + ($drawH * (117.0 / $ribCropH)))

    # Subtle projector light cone behind
    $pts = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF($lx, $ly)),
        (New-Object System.Drawing.PointF([float]$size, 0.0)),
        (New-Object System.Drawing.PointF([float]$size, [float]$size)),
        (New-Object System.Drawing.PointF($lx, [float]($ly + 15.0 * ($size / 192.0))))
    )
    $widePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $widePath.AddPolygon($pts)
    $wpgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($widePath)
    $wpgb.CenterPoint = New-Object System.Drawing.PointF($lx, $ly)
    $wpgb.CenterColor = [System.Drawing.Color]::FromArgb(45, 255, 215, 120)
    $wpgb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 10, 11, 16))
    $g.FillPath($wpgb, $widePath)
    $wpgb.Dispose()
    $widePath.Dispose()

    # Ribbon
    $destRect = New-Object System.Drawing.Rectangle($posX, $posY, $drawW, $drawH)
    $g.DrawImage($ribCrop, $destRect, 0, 0, $ribCropW, $ribCropH, [System.Drawing.GraphicsUnit]::Pixel)

    # Lens apex glow
    $lensRadius = [float](7.0 * ($size / 192.0))
    if ($lensRadius -ge 2.0) {
        $lensPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $lensPath.AddEllipse([float]($lx - $lensRadius), [float]($ly - $lensRadius), [float]($lensRadius * 2), [float]($lensRadius * 2))
        $lpgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($lensPath)
        $lpgb.CenterColor = [System.Drawing.Color]::FromArgb(255, 255, 245, 210)
        $lpgb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 235, 175, 50))
        $g.FillPath($lpgb, $lensPath)
        $lpgb.Dispose()
        $lensPath.Dispose()
    }

    $destBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $destBmp.Dispose()
    Write-Host "Generated Square Icon ($($size)x$($size)): $destPath"
}

$tvRes = "c:\antigravity\project\lumiere\android\tv\src\main\res"

# Generate TV banners across all densities with Variant 5 Wide Theater Spotlight
Generate-TVBanner 320 180 (Join-Path $tvRes "drawable\ic_banner.png")
Generate-TVBanner 240 135 (Join-Path $tvRes "drawable-hdpi\ic_banner.png")
Generate-TVBanner 320 180 (Join-Path $tvRes "drawable-xhdpi\ic_banner.png")
Generate-TVBanner 480 270 (Join-Path $tvRes "drawable-xxhdpi\ic_banner.png")
Generate-TVBanner 640 360 (Join-Path $tvRes "drawable-xxxhdpi\ic_banner.png")

# Generate square launcher icons
Generate-SquareIcon 48 (Join-Path $tvRes "mipmap-mdpi\ic_launcher.png")
Generate-SquareIcon 72 (Join-Path $tvRes "mipmap-hdpi\ic_launcher.png")
Generate-SquareIcon 96 (Join-Path $tvRes "mipmap-xhdpi\ic_launcher.png")
Generate-SquareIcon 144 (Join-Path $tvRes "mipmap-xxhdpi\ic_launcher.png")
Generate-SquareIcon 192 (Join-Path $tvRes "mipmap-xxxhdpi\ic_launcher.png")
Generate-SquareIcon 192 (Join-Path $tvRes "drawable\ic_launcher.png")

$ribCrop.Dispose()
$txtCrop.Dispose()
$srcImg.Dispose()
Write-Host "All TV icons and banners with Variant 5 generated successfully!"
