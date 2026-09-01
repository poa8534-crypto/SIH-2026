param(
    [int]$Start = 0,
    [int]$Count = 1000
)

$ErrorActionPreference = 'Stop'

$stagingRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$retrievedAt = (Get-Date).ToUniversalTime().ToString('o')
$userAgent = 'NAVIS-research-dataset/1.0 (public-source archival; contact repository owner via project workspace)'

$sources = @(
    # WSDOT C8078 - canonical Inspector's Daily Reports (21 PDFs).
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-01-13.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-01-13.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-01-14.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-01-14.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-01.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-01.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-04.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-04.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-07.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-07.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-10.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-10.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-11-2.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-11-2.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-11-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-11-TN.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-11.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-11.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-12-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-12-TN.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-12.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-12.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-14.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-14.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-15.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-15.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-16-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-16-TN.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-16.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-16.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-17-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-17-TN.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-17.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-17.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-18.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-18.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-02-21.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-02-21.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-03-01.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-03-01.pdf' },
    @{ Group='wsdot_c8078_idr'; File='raw/wsdot/C8078/idrs/IDR-2011-03-02.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-25%20Inspector%27s%20Daily%20Report/IDR-2011-03-02.pdf' },

    # WSDOT C8078 - earlier archive copies retained for provenance/duplicate analysis.
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/021111_IDR_C8078_DT.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/021111_IDR_C8078_DT.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/021211_IDR_C8078_DT.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/021211_IDR_C8078_DT.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/021611_IDR_C8078_DT.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/021611_IDR_C8078_DT.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/021711_IDR_C8078_DT.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/021711_IDR_C8078_DT.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-11-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-11-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-12-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-12-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-14-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-14-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-15-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-15-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-16-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-16-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-17-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-17-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-18-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-18-IDR-TN.pdf' },
    @{ Group='wsdot_c8078_legacy_idr'; File='raw/wsdot/C8078/legacy_idr_copies/2011-02-21-IDR-TN.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/IDR/2011-02-21-IDR-TN.pdf' },

    # Same-contract schedule and time/progress context.
    @{ Group='wsdot_c8078_schedule'; File='raw/wsdot/C8078/schedules/2011-01-21.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-13%20Project%20Schedule/2011-01-21.pdf' },
    @{ Group='wsdot_c8078_schedule'; File='raw/wsdot/C8078/schedules/2011-02-14-.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-13%20Project%20Schedule/2011-02-14-.pdf' },
    @{ Group='wsdot_c8078_context'; File='raw/wsdot/C8078/project_context/C8078-Progress-Estimate-2.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/C8078%20-%20Progress%20Estimate%202.pdf' },
    @{ Group='wsdot_c8078_context'; File='raw/wsdot/C8078/project_context/Est-2011-03-03.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-27%20Estimates/Est-2011-03-03.pdf' },
    @{ Group='wsdot_c8078_contract_time'; File='raw/wsdot/C8078/contract_time/2011-02-15-1.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-4%20Contract%20Time/2011-02-15-1.pdf' },
    @{ Group='wsdot_c8078_contract_time'; File='raw/wsdot/C8078/contract_time/2011-02-23-2.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-4%20Contract%20Time/2011-02-23-2.pdf' },
    @{ Group='wsdot_c8078_contract_time'; File='raw/wsdot/C8078/contract_time/2011-03-01-3.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-4%20Contract%20Time/2011-03-01-3.pdf' },
    @{ Group='wsdot_c8078_contract_time'; File='raw/wsdot/C8078/contract_time/2011-03-02-4.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-4%20Contract%20Time/2011-03-02-4.pdf' },
    @{ Group='wsdot_c8078_contract_time'; File='raw/wsdot/C8078/contract_time/2011-09-27.pdf'; Url='https://data.wsdot.wa.gov/accountability/ssb5806/Repository/7_Project%20Delivery/C-8078%20-%20Temp%20Test%20Pile/1-4%20Contract%20Time/2011-09-27.pdf' },

    # WSDOT schemas/guidance.
    @{ Group='wsdot_reference'; File='raw/wsdot/reference/DOT-Form-422-004.pdf'; Url='https://wsdot.wa.gov/publications/fulltext/forms/422-004.PDF' },
    @{ Group='wsdot_reference'; File='raw/wsdot/reference/DOT-Form-422-004A.pdf'; Url='https://wsdot.wa.gov/publications/fulltext/forms/422-004A.PDF' },
    @{ Group='wsdot_reference'; File='raw/wsdot/reference/DOT-Form-422-004B.pdf'; Url='https://wsdot.wa.gov/publications/fulltext/forms/422-004B.PDF' },
    @{ Group='wsdot_reference'; File='raw/wsdot/reference/WSDOT-Construction-Manual-M41-01.47.pdf'; Url='https://wsdot.wa.gov/publications/manuals/fulltext/M41-01/M4101.47Complete.pdf' },

    # FHWA forms and reporting/schema guidance.
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-1413-Contractor-Daily-Record.pdf'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/docs/federal-lands/construction/15746/cdr-1413.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-1413-Inspector-Daily-Record.pdf'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/docs/federal-lands/construction/15741/idr-1413.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/WFLHD-465-Contractor-Daily-Record.pdf'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/2024-07/WFLHD-465-CDR.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/WFLHD-472-Contractor-Daily-QC-Report.pdf'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/2024-07/WFLHD-472-QCR.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-1446A-Construction-Inspection-Report.pdf'; Url='https://highways.dot.gov/federal-lands/construction/forms/wfl/fhwa-1446a' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-Construction-Program-Management-and-Inspection-Guide-2004.pdf'; Url='https://www.fhwa.dot.gov/construction/cpmi04.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-Create-Daily-Diary.pdf'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/docs/federal-lands/construction/16751/create-daily-diary.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-Masterworks-Construction-Participant-Guide.pdf'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/M06A-Construction.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/FHWA-Reports-Dashboard-Participant-Guide.pdf'; Url='https://highways.dot.gov/federal-lands/estimates/mw-guide/M10-Reports-Dashboard.pdf' },
    @{ Group='fhwa_reference'; File='raw/fhwa/reference/EFL-Construction-Forms.zip'; Url='https://highways.dot.gov/sites/fhwa.dot.gov/files/docs/federal-lands/construction/forms-efl/EFL_Construction_Forms.zip' },

    # Policy/robots captures, preserved in their native text/HTML formats.
    @{ Group='policy'; File='raw/policy/data-wsdot-robots.txt'; Url='https://data.wsdot.wa.gov/robots.txt' },
    @{ Group='policy'; File='raw/policy/wsdot-robots.txt'; Url='https://wsdot.wa.gov/robots.txt' },
    @{ Group='policy'; File='raw/policy/highways-dot-gov-robots.txt'; Url='https://highways.dot.gov/robots.txt' },
    @{ Group='policy'; File='raw/policy/fhwa-dot-gov-robots.txt'; Url='https://www.fhwa.dot.gov/robots.txt' },
    @{ Group='policy'; File='raw/policy/wsdot-web-privacy-notice.html'; Url='https://wsdot.wa.gov/about/policies/web-privacy-notice' }
)

$selectedSources = @($sources | Select-Object -Skip $Start -First $Count)

$results = foreach ($source in $selectedSources) {
    $outputPath = Join-Path $stagingRoot $source.File
    $outputDirectory = Split-Path -Parent $outputPath
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

    $status = 'downloaded'
    $errorMessage = ''
    $httpStatus = $null
    $contentType = $null
    if (Test-Path -LiteralPath $outputPath) {
        $status = 'already_present'
    }
    else {
        try {
            $response = Invoke-WebRequest -Uri $source.Url -OutFile $outputPath -UserAgent $userAgent -PassThru -MaximumRedirection 8
            $httpStatus = [int]$response.StatusCode
            $contentType = [string]$response.Headers.'Content-Type'
        }
        catch {
            $status = 'failed'
            $errorMessage = $_.Exception.Message
            if (Test-Path -LiteralPath $outputPath) {
                Remove-Item -LiteralPath $outputPath -Force
            }
        }
    }

    $sizeBytes = $null
    $sha256 = $null
    if ($status -ne 'failed' -and (Test-Path -LiteralPath $outputPath)) {
        $sizeBytes = (Get-Item -LiteralPath $outputPath).Length
        $sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    [pscustomobject]@{
        group = $source.Group
        local_path = $source.File -replace '\\', '/'
        source_url = $source.Url
        retrieved_at_utc = $retrievedAt
        status = $status
        http_status = $httpStatus
        content_type = $contentType
        size_bytes = $sizeBytes
        sha256 = $sha256
        error = $errorMessage
        data_origin = 'real'
    }

    if ($status -eq 'downloaded') {
        $delayMs = if ($source.Url -match 'fhwa\.dot\.gov|highways\.dot\.gov') { 1000 } else { 250 }
        Start-Sleep -Milliseconds $delayMs
    }
}

$logName = 'download_log_{0:D3}_{1:D3}.csv' -f $Start, $selectedSources.Count
$results | Export-Csv -LiteralPath (Join-Path $stagingRoot $logName) -NoTypeInformation -Encoding utf8
$results | Group-Object status | Select-Object Name, Count
