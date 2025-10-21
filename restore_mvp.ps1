# restore_mvp.ps1
# Restores the repository to the MVP commit recorded in .mvp_snapshot.json
# WARNING: This will overwrite working files if you force-checkout. The script will refuse to run if there are uncommitted changes.

$cwd = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location $cwd

if (-not (Test-Path .mvp_snapshot.json)) {
  Write-Error ".mvp_snapshot.json not found. Cannot restore."
  exit 1
}

$json = Get-Content .mvp_snapshot.json -Raw | ConvertFrom-Json
$commit = $json.commit
Write-Host "MVP commit recorded: $commit"

# Check for uncommitted changes
$changes = git status --porcelain
if ($changes) {
  Write-Host "You have uncommitted changes. Please commit or stash them before running this restore script." -ForegroundColor Yellow
  git status --short
  exit 2
}

# Checkout the commit into a new branch named mvp/restore-<commit>
$branch = "mvp/restore-$($commit.Substring(0,7))"
Write-Host "Creating branch $branch at commit $commit and checking out..."
git checkout -b $branch $commit
Write-Host "Checked out $branch at $commit."
Write-Host "If you want to reset your main branch to this commit, run:`n git checkout main; git reset --hard $commit` (careful: this is destructive)."