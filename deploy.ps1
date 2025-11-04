# ChatBridge Vercel Deployment Script
# Quick deployment helper for Windows PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ChatBridge Vercel Deployment Helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
$requiredFiles = @("api/gemini.js", "package.json", "vercel.json", "manifest.json")
$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "ERROR: Missing required files:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please run this script from the ChatBridge directory." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ All required files found" -ForegroundColor Green
Write-Host ""

# Step 1: Generate secret
Write-Host "Step 1: Generate Security Secret" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
$secret = [guid]::NewGuid().ToString()
Write-Host "Your generated secret (save this!):" -ForegroundColor Cyan
Write-Host $secret -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Copy this secret - you'll need it for:" -ForegroundColor Yellow
Write-Host "  1. Vercel environment variable (EXT_SECRET)" -ForegroundColor Gray
Write-Host "  2. background.js configuration (VERCEL_EXT_SECRET)" -ForegroundColor Gray
Write-Host ""

# Step 2: Check Vercel CLI
Write-Host "Step 2: Check Vercel CLI" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if ($vercelInstalled) {
    Write-Host "✅ Vercel CLI is installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Vercel CLI not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Would you like to:" -ForegroundColor Yellow
    Write-Host "  [1] Use Vercel Web UI (recommended for first-time)" -ForegroundColor Cyan
    Write-Host "  [2] Install Vercel CLI now" -ForegroundColor Cyan
    Write-Host "  [3] Exit and install manually" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "Enter choice (1-3)"
    
    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Host "Opening Vercel Web UI deployment guide..." -ForegroundColor Green
            Start-Process "https://vercel.com/new"
            Write-Host ""
            Write-Host "Manual Steps:" -ForegroundColor Yellow
            Write-Host "  1. Import your GitHub repository" -ForegroundColor Gray
            Write-Host "  2. Skip build settings (use defaults)" -ForegroundColor Gray
            Write-Host "  3. Add environment variables:" -ForegroundColor Gray
            Write-Host "     - GEMINI_API_KEY = AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ" -ForegroundColor Gray
            Write-Host "     - EXT_SECRET = $secret" -ForegroundColor Gray
            Write-Host "     - NODE_ENV = production" -ForegroundColor Gray
            Write-Host "  4. Click 'Deploy'" -ForegroundColor Gray
            Write-Host ""
            Write-Host "After deployment, run this script again to test!" -ForegroundColor Cyan
            exit 0
        }
        "2" {
            Write-Host ""
            Write-Host "Installing Vercel CLI..." -ForegroundColor Cyan
            npm install -g vercel
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to install Vercel CLI" -ForegroundColor Red
                Write-Host "Try: npm install -g vercel" -ForegroundColor Yellow
                exit 1
            }
            Write-Host "✅ Vercel CLI installed" -ForegroundColor Green
        }
        "3" {
            Write-Host ""
            Write-Host "To install Vercel CLI manually, run:" -ForegroundColor Yellow
            Write-Host "  npm install -g vercel" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Then run this script again." -ForegroundColor Gray
            exit 0
        }
        default {
            Write-Host "Invalid choice. Exiting." -ForegroundColor Red
            exit 1
        }
    }
}
Write-Host ""

# Step 3: Deploy to Vercel
Write-Host "Step 3: Deploy to Vercel" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Ready to deploy? This will:" -ForegroundColor Cyan
Write-Host "  1. Deploy your code to Vercel" -ForegroundColor Gray
Write-Host "  2. Create a production URL" -ForegroundColor Gray
Write-Host "  3. Set up serverless functions" -ForegroundColor Gray
Write-Host ""
$deploy = Read-Host "Deploy now? (y/n)"

if ($deploy -ne "y") {
    Write-Host "Deployment cancelled. Run this script again when ready." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Deploying to Vercel..." -ForegroundColor Cyan
vercel --prod

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    Write-Host "Try running 'vercel --prod' manually to see detailed errors." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✅ Deployment successful!" -ForegroundColor Green
Write-Host ""

# Step 4: Get deployment URL
Write-Host "Step 4: Configure Extension" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "Enter your Vercel deployment URL (from output above):" -ForegroundColor Cyan
Write-Host "Example: https://chatbridge-abc123.vercel.app" -ForegroundColor Gray
$deploymentUrl = Read-Host "URL"

if (-not $deploymentUrl) {
    Write-Host "No URL provided. You'll need to configure manually." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual configuration:" -ForegroundColor Cyan
    Write-Host "  1. Open background.js" -ForegroundColor Gray
    Write-Host "  2. Find lines ~290-295" -ForegroundColor Gray
    Write-Host "  3. Update:" -ForegroundColor Gray
    Write-Host "     const VERCEL_PROXY_URL = 'YOUR_URL/api/gemini';" -ForegroundColor Gray
    Write-Host "     const VERCEL_EXT_SECRET = '$secret';" -ForegroundColor Gray
    exit 0
}

# Ensure URL has /api/gemini path
if (-not $deploymentUrl.EndsWith("/api/gemini")) {
    if ($deploymentUrl.EndsWith("/")) {
        $deploymentUrl = $deploymentUrl + "api/gemini"
    } else {
        $deploymentUrl = $deploymentUrl + "/api/gemini"
    }
}

Write-Host ""
Write-Host "Configuration ready:" -ForegroundColor Green
Write-Host "  VERCEL_PROXY_URL = $deploymentUrl" -ForegroundColor Cyan
Write-Host "  VERCEL_EXT_SECRET = $secret" -ForegroundColor Cyan
Write-Host ""

# Step 5: Update background.js
Write-Host "Would you like to automatically update background.js? (y/n)" -ForegroundColor Yellow
$autoUpdate = Read-Host "Update"

if ($autoUpdate -eq "y") {
    Write-Host ""
    Write-Host "Updating background.js..." -ForegroundColor Cyan
    
    $backgroundPath = "background.js"
    $content = Get-Content $backgroundPath -Raw
    
    # Replace VERCEL_PROXY_URL
    $content = $content -replace "const VERCEL_PROXY_URL = '';", "const VERCEL_PROXY_URL = '$deploymentUrl';"
    # Replace VERCEL_EXT_SECRET
    $content = $content -replace "const VERCEL_EXT_SECRET = '';", "const VERCEL_EXT_SECRET = '$secret';"
    
    Set-Content $backgroundPath $content
    
    Write-Host "✅ background.js updated" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Manual update required:" -ForegroundColor Yellow
    Write-Host "  1. Open background.js" -ForegroundColor Gray
    Write-Host "  2. Find lines ~290-295" -ForegroundColor Gray
    Write-Host "  3. Update:" -ForegroundColor Gray
    Write-Host "     const VERCEL_PROXY_URL = '$deploymentUrl';" -ForegroundColor Cyan
    Write-Host "     const VERCEL_EXT_SECRET = '$secret';" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Set environment variables in Vercel Dashboard:" -ForegroundColor Gray
Write-Host "     - GEMINI_API_KEY = AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ" -ForegroundColor Gray
Write-Host "     - EXT_SECRET = $secret" -ForegroundColor Gray
Write-Host "     - NODE_ENV = production" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Reload extension in Chrome:" -ForegroundColor Gray
Write-Host "     chrome://extensions/ → Find ChatBridge → Click Reload" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Test on any AI chat site (ChatGPT, Claude, etc.)" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. (Optional) Rotate your API key for extra security" -ForegroundColor Gray
Write-Host "     See DEPLOYMENT_COMPLETE.md for instructions" -ForegroundColor Gray
Write-Host ""

# Step 6: Test deployment
Write-Host "Would you like to test the deployment now? (y/n)" -ForegroundColor Yellow
$test = Read-Host "Test"

if ($test -eq "y") {
    Write-Host ""
    Write-Host "Testing deployment..." -ForegroundColor Cyan
    
    $headers = @{
        'Content-Type' = 'application/json'
        'x-ext-secret' = $secret
    }
    
    $body = @{
        endpoint = 'https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent'
        body = @{
            model = 'models/text-embedding-004'
            content = @{
                parts = @(@{ text = 'Hello world' })
            }
        }
        method = 'POST'
    } | ConvertTo-Json -Depth 10
    
    try {
        Write-Host "Sending test request to: $deploymentUrl" -ForegroundColor Gray
        $response = Invoke-RestMethod -Uri $deploymentUrl -Method POST -Headers $headers -Body $body
        Write-Host ""
        Write-Host "✅ Test successful!" -ForegroundColor Green
        Write-Host "Response preview:" -ForegroundColor Cyan
        $response | ConvertTo-Json -Depth 2 | Write-Host -ForegroundColor Gray
    } catch {
        Write-Host ""
        Write-Host "❌ Test failed" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Common issues:" -ForegroundColor Yellow
        Write-Host "  - Environment variables not set in Vercel" -ForegroundColor Gray
        Write-Host "  - Secret mismatch between extension and Vercel" -ForegroundColor Gray
        Write-Host "  - Deployment still in progress (wait 1-2 minutes)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Check Vercel logs: npx vercel logs" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "For detailed documentation, see:" -ForegroundColor Cyan
Write-Host "  - VERCEL_DEPLOYMENT.md (full guide)" -ForegroundColor Gray
Write-Host "  - DEPLOYMENT_CHECKLIST.md (quick steps)" -ForegroundColor Gray
Write-Host "  - DEPLOYMENT_COMPLETE.md (changes summary)" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Happy deploying! 🚀" -ForegroundColor Green
