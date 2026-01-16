param(
  [string]$ApiUrl = "http://localhost:8080/actuator/health",
  [string]$AgentUrl = "http://localhost:8765/health"
)

Write-Host "API health:"; 
try { Invoke-RestMethod $ApiUrl } catch { Write-Host $_.Exception.Message }

Write-Host "Agent health:";
try { Invoke-RestMethod $AgentUrl } catch { Write-Host $_.Exception.Message }
