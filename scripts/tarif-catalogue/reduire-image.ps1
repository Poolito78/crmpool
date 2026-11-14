# Réduit une image du catalogue pour la page tarif en ligne : 900 px de large
# au plus, JPEG qualité 78, fond blanc sous la transparence (PNG).
# Les photos de chantier font 4 à 9 Mo : servies telles quelles, la page
# pèserait plus de 30 Mo.
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Cible,
    [int]$Largeur = 900
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Source)
try {
    # Photo de téléphone : l'orientation est dans l'EXIF, pas dans les pixels.
    if ($img.PropertyIdList -contains 0x0112) {
        switch ($img.GetPropertyItem(0x0112).Value[0]) {
            3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
            6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
            8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
        }
    }
    $l =[Math]::Min($Largeur, $img.Width)
    $h = [int]([Math]::Round($img.Height * $l / $img.Width))
    $bmp = New-Object System.Drawing.Bitmap $l, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $l, $h)
    $g.Dispose()
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $p = New-Object System.Drawing.Imaging.EncoderParameters 1
    $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 78L
    $bmp.Save($Cible, $codec, $p)
    $bmp.Dispose()
} finally {
    $img.Dispose()
}
