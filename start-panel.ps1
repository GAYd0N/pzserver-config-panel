[CmdletBinding()]
param(
  [string]$BindAddress = "127.0.0.1",
  [ValidateRange(1, 65535)]
  [int]$Port = 3000,
  [string]$Config = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Push-Location $root

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "未找到 Node.js，请先安装 Node.js 18 或更高版本。"
  }

  if (-not (Test-Path "node_modules/typescript/bin/tsc")) {
    throw "依赖尚未安装，请先在项目目录执行 npm install。"
  }

  $needsBuild = -not (Test-Path "dist/server.js")
  if (-not $needsBuild) {
    $buildTime = (Get-Item "dist/server.js").LastWriteTimeUtc
    $newestSource = Get-ChildItem "src" -Recurse -File -Filter "*.ts" |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1

    if ($newestSource -and $newestSource.LastWriteTimeUtc -gt $buildTime) {
      $needsBuild = $true
    }
  }

  if ($needsBuild) {
    Write-Host "正在编译 TypeScript..." -ForegroundColor Cyan
    & node "node_modules/typescript/bin/tsc" "-p" "tsconfig.json"
    if ($LASTEXITCODE -ne 0) {
      throw "编译失败，面板未启动。"
    }
  }

  $serverArgs = @("dist/server.js", "--host", $BindAddress, "--port", "$Port")
  if ($Config) {
    $serverArgs += @("--config", $Config)
  }

  if ($BindAddress -notmatch '^(127\.|localhost$|\[?::1\]?$)') {
    Write-Warning "面板没有身份认证。绑定到 $BindAddress 后，同一网络中的其他设备可能访问控制面板。"
  }

  Write-Host "启动面板，按 Ctrl+C 停止。" -ForegroundColor Green
  & node @serverArgs
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
