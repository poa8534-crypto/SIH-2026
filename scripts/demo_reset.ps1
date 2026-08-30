#Requires -Version 5.1
<#
    Reset the demo to a known clean state and print the numbers to eyeball
    before demoing.

        powershell -ExecutionPolicy Bypass -File scripts\demo_reset.ps1

    The server must already be running WITH the reset flag enabled, because
    POST /admin/reset answers 404 without it:

        $env:NAVIS_ENABLE_RESET = "1"
        python -m uvicorn server.main:app --reload

    ── Why reset is called with ?dpr_only=true ──────────────────────────────
    POST /admin/reset is not a clear-only call. server/demo.py:reset_demo()
    clears the ingest rows and then re-ingests dataset/ itself, and the only
    knob it exposes is ?dpr_only, which narrows its own ingest to the
    dpr_day_*.txt files. So this script asks reset for the least it can do,
    then POSTs the fixed list below to /ingest.

    Re-POSTing the eleven DPR files is safe and deliberate: POST /ingest
    refuses byte-identical content by sha256 (main.py's duplicate-upload
    guard), so they come back as "already ingested" and nothing is written
    twice. The two spreadsheets are the files this script actually ingests.
    Either way the end state is the same 13-file corpus on every run.

    ── The fixed set, in this exact ingest order ────────────────────────────
        dpr_day_01.txt .. dpr_day_10.txt   ten clean daily progress reports
        dpr_day_11_messy.txt               deliberately messy input, kept in
                                           because the robustness story in
                                           DEMO.md depends on it
        civil_progress.xlsx                discipline spreadsheet
        piping_progress.xlsx               discipline spreadsheet

    Order matters and is not cosmetic. On a source conflict the stored value
    is whichever source was ingested last, so spreadsheets-after-reports is
    what makes the conflict rows on Home reproducible. This is the same order
    server/demo.py uses (sorted .txt, then sorted .xlsx).

    Exit code: 0 when the reset and all 13 ingests succeeded. Non-zero means
    the demo state is NOT clean. A count that disagrees with DEMO.md prints a
    warning but still exits 0 — that is a dataset question, not a run failure.
#>
[CmdletBinding()]
param(
    # Match the uvicorn port if you started the server on something else.
    [string] $BaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'
# Invoke-WebRequest's progress bar is slow and noisy in 5.1.
$ProgressPreference    = 'SilentlyContinue'

$BaseUrl = $BaseUrl.TrimEnd('/')

# The known-good state documented in DEMO.md.
$Expected = @{ Activities = 120; WithActuals = 67; ReviewQueue = 118 }

$DemoFiles = @(
    'dpr_day_01.txt'
    'dpr_day_02.txt'
    'dpr_day_03.txt'
    'dpr_day_04.txt'
    'dpr_day_05.txt'
    'dpr_day_06.txt'
    'dpr_day_07.txt'
    'dpr_day_08.txt'
    'dpr_day_09.txt'
    'dpr_day_10.txt'
    'dpr_day_11_messy.txt'
    'civil_progress.xlsx'
    'piping_progress.xlsx'
)

# ── Helpers ─────────────────────────────────────────────────────────────────

function Get-WebErrorDetail {
    <#
        Pull the status code and response body off a failed web call.
        Invoke-RestMethod throws before returning anything in 5.1, so the body
        has to be read from the exception's own response stream.
    #>
    param($ErrorRecord)

    $status = $null
    $body   = ''

    $response = $null
    if ($ErrorRecord.Exception -and
        $ErrorRecord.Exception.PSObject.Properties['Response']) {
        $response = $ErrorRecord.Exception.Response
    }

    if ($response) {
        try { $status = [int] $response.StatusCode } catch { $status = $null }
    }

    # 5.1 hands the response body over in ErrorDetails and has usually already
    # drained the stream by the time we get here, so this is the reliable read.
    if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
        $body = [string] $ErrorRecord.ErrorDetails.Message
    }

    # Fall back to the stream for the cases ErrorDetails does not cover.
    if (-not $body -and $response) {
        try {
            $stream = $response.GetResponseStream()
            if ($stream.CanSeek) { $null = $stream.Seek(0, 'Begin') }
            $reader = New-Object System.IO.StreamReader($stream)
            $body   = $reader.ReadToEnd()
            $reader.Close()
        } catch { }
    }

    # FastAPI puts the useful sentence in .detail; fall back to the raw body.
    if ($body) {
        try {
            $parsed = $body | ConvertFrom-Json
            if ($parsed.PSObject.Properties['detail'] -and $parsed.detail) {
                $body = [string] $parsed.detail
            }
        } catch { }
    }
    if (-not $body) { $body = $ErrorRecord.Exception.Message }

    [pscustomobject] @{
        Status = $status
        Body   = ($body -replace '\s+', ' ').Trim()
    }
}

function Write-Fail {
    param([string] $What, $Detail)

    $line = "FAILED   $What"
    if ($Detail -and $null -ne $Detail.Status) {
        $line = "FAILED   $What -- HTTP $($Detail.Status)"
    }
    Write-Host $line -ForegroundColor Red
    if ($Detail -and $Detail.Body) {
        Write-Host "         $($Detail.Body)" -ForegroundColor Red
    }
}

function Send-IngestFile {
    <#
        POST one file to /ingest as multipart/form-data.

        Windows PowerShell 5.1's Invoke-RestMethod has no -Form, so the body is
        assembled by hand. Latin-1 maps every byte 0-255 to the same codepoint,
        which is what lets the .xlsx bytes survive the round trip through a
        string unchanged.
    #>
    param(
        [string] $Uri,
        [System.IO.FileInfo] $File
    )

    $boundary = [System.Guid]::NewGuid().ToString()
    $CRLF     = "`r`n"
    $latin1   = [System.Text.Encoding]::GetEncoding('iso-8859-1')

    $partType = switch ($File.Extension.ToLower()) {
        '.xlsx' { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        '.txt'  { 'text/plain' }
        default { 'application/octet-stream' }
    }

    $fileBytes = [System.IO.File]::ReadAllBytes($File.FullName)
    $lines = @(
        "--$boundary"
        ('Content-Disposition: form-data; name="file"; filename="{0}"' -f $File.Name)
        "Content-Type: $partType"
        ''
        $latin1.GetString($fileBytes)
        "--$boundary--"
        ''
    )

    $call = @{
        Uri         = $Uri
        Method      = 'Post'
        Body        = $latin1.GetBytes(($lines -join $CRLF))
        ContentType = "multipart/form-data; boundary=$boundary"
        TimeoutSec  = 300
    }
    Invoke-RestMethod @call
}

# ── 0. Check the dataset before touching anything destructive ───────────────

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataset     = Join-Path $projectRoot 'dataset'

Write-Host ''
Write-Host "Demo reset  ->  $BaseUrl"
Write-Host "dataset: $dataset"
Write-Host ''

$missing = @()
foreach ($name in $DemoFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $dataset $name))) {
        $missing += $name
    }
}
if ($missing.Count -gt 0) {
    Write-Fail "dataset is incomplete -- $($missing.Count) file(s) missing" $null
    foreach ($name in $missing) { Write-Host "         $name" -ForegroundColor Red }
    Write-Host '         Nothing was reset. Restore the files and run again.'
    exit 2
}

# ── 1. Is the API even up? Fail here rather than half way through a reset ───

try {
    $null = Invoke-WebRequest -Uri "$BaseUrl/openapi.json" -UseBasicParsing -TimeoutSec 10
} catch {
    Write-Fail "cannot reach the API at $BaseUrl" (Get-WebErrorDetail $_)
    Write-Host ''
    Write-Host '         Start it from the project root, with reset enabled:'
    Write-Host '             $env:NAVIS_ENABLE_RESET = "1"'
    Write-Host '             python -m uvicorn server.main:app --reload'
    exit 1
}

# ── 2. POST /admin/reset ────────────────────────────────────────────────────

Write-Host 'POST /admin/reset?dpr_only=true ... (a few seconds; ~10s on the first call after a server restart, while MiniLM loads)'
try {
    $reset = Invoke-RestMethod -Uri "$BaseUrl/admin/reset?dpr_only=true" `
                               -Method Post -TimeoutSec 600
} catch {
    $detail = Get-WebErrorDetail $_
    Write-Fail 'POST /admin/reset' $detail
    # 404 means the route is gated off, and the server's own message above
    # already says so; all it leaves out is the PowerShell syntax.
    if ($detail.Status -eq 404) {
        Write-Host '         In PowerShell:  $env:NAVIS_ENABLE_RESET = "1"'
    }
    exit 1
}

Write-Host ("OK       reset cleared and re-ingested {0} file(s): {1} activities, {2} events, {3} auto-linked" -f `
            $reset.files_ingested, $reset.activities, $reset.events_extracted, $reset.auto_linked) `
           -ForegroundColor Green
Write-Host ''

# ── 3. Re-ingest the fixed set, in order ────────────────────────────────────

Write-Host "POST /ingest x $($DemoFiles.Count), in fixed order ..."

$ingested   = 0
$duplicates = 0
$failures   = @()

foreach ($name in $DemoFiles) {
    $file = Get-Item -LiteralPath (Join-Path $dataset $name)
    try {
        $result = Send-IngestFile -Uri "$BaseUrl/ingest" -File $file
    } catch {
        $detail = Get-WebErrorDetail $_
        $failures += $name
        Write-Host ("  {0,-22} FAILED  {1}" -f $name, $detail.Body) -ForegroundColor Red
        continue
    }

    if ([string] $result.message -like '*Duplicate upload ignored*') {
        $duplicates++
        Write-Host ("  {0,-22} already ingested by the reset" -f $name) -ForegroundColor DarkGray
    } else {
        $ingested++
        Write-Host ("  {0,-22} {1}" -f $name, $result.message)
    }
}

Write-Host ("         {0} ingested here, {1} already present, {2} failed" -f `
            $ingested, $duplicates, $failures.Count)
Write-Host ''

# ── 4. The numbers to sanity-check before demoing ───────────────────────────

try {
    $schedule = Invoke-RestMethod -Uri "$BaseUrl/schedule" -Method Get -TimeoutSec 300
    $queue    = Invoke-RestMethod -Uri "$BaseUrl/review-queue" -Method Get -TimeoutSec 300
} catch {
    Write-Fail 'reading back /schedule and /review-queue' (Get-WebErrorDetail $_)
    exit 1
}

# An empty JSON array comes back as $null in 5.1, and a one-item array comes
# back unwrapped, so neither can be counted directly.
$queueDepth = 0
if ($null -ne $queue) { $queueDepth = @($queue).Count }

$activities  = [int] $schedule.total_activities
$withActuals = [int] $schedule.activities_with_actuals

Write-Host ("SUMMARY  activities={0}  with actuals={1}  review queue={2}" -f `
            $activities, $withActuals, $queueDepth) -ForegroundColor Cyan

if ($activities  -ne $Expected.Activities -or
    $withActuals -ne $Expected.WithActuals -or
    $queueDepth  -ne $Expected.ReviewQueue) {
    Write-Host ("WARNING  differs from the known-good state in DEMO.md (expected activities={0}, with actuals={1}, review queue={2})" -f `
                $Expected.Activities, $Expected.WithActuals, $Expected.ReviewQueue) `
               -ForegroundColor Yellow
    Write-Host '         Check dataset/ before assuming the run went wrong.'
}

if ($failures.Count -gt 0) {
    Write-Host ''
    Write-Fail "$($failures.Count) file(s) did not ingest -- the demo state is NOT clean" $null
    foreach ($name in $failures) { Write-Host "         $name" -ForegroundColor Red }
    exit 1
}

Write-Host ''
Write-Host 'Demo state is clean. Reload the browser -- no restart needed.' -ForegroundColor Green
exit 0
