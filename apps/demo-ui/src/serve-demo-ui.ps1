param(
    [int]$Port = 4173,
    [string]$Root = $PSScriptRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ContentType {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".css" { return "text/css; charset=utf-8" }
        ".js" { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".svg" { return "image/svg+xml" }
        ".png" { return "image/png" }
        ".jpg" { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        default { return "application/octet-stream" }
    }
}

function Write-BytesResponse {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode,
        [string]$ContentType,
        [byte[]]$Bytes
    )

    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

$rootPath = [System.IO.Path]::GetFullPath($Root)
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

Write-Host "Serving Disaster Tracker demo UI from $rootPath"
Write-Host "UI:      http://localhost:$Port"
Write-Host "Press Ctrl+C to stop."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()

        try {
            $requestPath = $context.Request.Url.AbsolutePath
            $relativePath =
                if ([string]::IsNullOrWhiteSpace($requestPath) -or $requestPath -eq "/") {
                    "index.html"
                }
                else {
                    [Uri]::UnescapeDataString($requestPath.TrimStart("/")).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
                }

            $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))
            if (-not $candidatePath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
                Write-BytesResponse -Response $context.Response -StatusCode 403 -ContentType "text/plain; charset=utf-8" -Bytes $bytes
                continue
            }

            if (-not (Test-Path $candidatePath -PathType Leaf)) {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                Write-BytesResponse -Response $context.Response -StatusCode 404 -ContentType "text/plain; charset=utf-8" -Bytes $bytes
                continue
            }

            $bytes = [System.IO.File]::ReadAllBytes($candidatePath)
            Write-BytesResponse -Response $context.Response -StatusCode 200 -ContentType (Get-ContentType -Path $candidatePath) -Bytes $bytes
        }
        catch {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("Internal Server Error")
            Write-BytesResponse -Response $context.Response -StatusCode 500 -ContentType "text/plain; charset=utf-8" -Bytes $bytes
            Write-Error $_
        }
        finally {
            $context.Response.OutputStream.Close()
        }
    }
}
finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }

    $listener.Close()
}
