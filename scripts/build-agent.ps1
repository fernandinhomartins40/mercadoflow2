param(
  [string]$ProjectRoot = (Get-Location)
)

Set-Location "$ProjectRoot/pdv2cloud-agent/service"

python -m pip install -r requirements.txt
