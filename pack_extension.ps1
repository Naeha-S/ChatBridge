$ErrorActionPreference = "Stop"
$zipName = "chatbridge-release.zip"

Write-Host "Packaging ChatBridge Extension..."

# Remove old zip if exists
if (Test-Path $zipName) {
    Remove-Item $zipName -Force
}

# Define folders/files to exclude
$exclude = @(
    ".git*",
    "node_modules",
    "tests",
    "workers",
    "docs",
    "documentation",
    "PROGRESS_CHECKLIST.md",
    "package.json",
    "package-lock.json",
    "jest*",
    "pack_extension.ps1",
    "chatbridge-release.zip",
    ".gemini*"
)

# Get all files and directories in current folder
$items = Get-ChildItem -Path .

# Filter out excluded items
$itemsToZip = $items | Where-Object { 
    $name = $_.Name
    $skip = $false
    foreach ($ex in $exclude) {
        if ($name -like $ex) {
            $skip = $true
            break
        }
    }
    -not $skip
}

# Compress into zip
Write-Host "Creating $zipName..."
Compress-Archive -Path $itemsToZip.FullName -DestinationPath $zipName -Force

Write-Host "Done! Successfully packaged to $zipName"
