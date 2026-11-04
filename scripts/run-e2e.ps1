$serverProc = Start-Process -FilePath "node" -ArgumentList @("node_modules/next/dist/bin/next", "start", "-p", "3005") -WorkingDirectory "merchops-ai" -PassThru -RedirectStandardOutput "merchops-ai/server.log" -RedirectStandardError "merchops-ai/server.err"
try {
    Start-Sleep -Seconds 5
    node merchops-ai/scripts/verify-chart-render.mjs
    node merchops-ai/scripts/test-payouts-e2e.mjs
}
finally {
    if ($serverProc -and !$serverProc.HasExited) {
        Stop-Process -Id $serverProc.Id -Force
    }
    if (Test-Path "merchops-ai/server.err") {
        Get-Content "merchops-ai/server.err"
    }
}
