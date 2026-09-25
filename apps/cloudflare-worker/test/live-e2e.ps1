param([Parameter(Mandatory = $true)][string]$BaseUrl)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')

function Invoke-JsonPost([string]$Path, [hashtable]$Body) {
  Invoke-RestMethod -Uri "$base$Path" -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 8)
}

function Receive-Packet([Net.WebSockets.ClientWebSocket]$Socket) {
  $buffer = New-Object byte[] 65536
  $segment = [ArraySegment[byte]]::new($buffer)
  $stream = [IO.MemoryStream]::new()
  do {
    $timeout = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(12))
    try { $result = $Socket.ReceiveAsync($segment, $timeout.Token).GetAwaiter().GetResult() }
    finally { $timeout.Dispose() }
    if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'WebSocket closed unexpectedly' }
    $stream.Write($buffer, 0, $result.Count)
  } while (-not $result.EndOfMessage)
  $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
  $stream.Dispose()
  $json | ConvertFrom-Json
}

function Connect-Player([string]$Code, [string]$PlayerId) {
  $uri = [Uri](($base -replace '^https:', 'wss:') + "/ws?room=$Code&playerId=$PlayerId")
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  [void]$socket.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $first = Receive-Packet $socket
  if ($first.type -ne 'event' -or $first.event -ne 'state') { throw 'Initial room state was not received' }
  $socket
}

$script:sequence = 0
function Send-Event([Net.WebSockets.ClientWebSocket]$Socket, [string]$Event, [hashtable]$Payload = @{}) {
  $script:sequence++
  $id = "e2e-$script:sequence"
  $json = @{ id = $id; event = $Event; payload = $Payload } | ConvertTo-Json -Compress -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  [void]$Socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  do { $packet = Receive-Packet $Socket } while ($packet.type -ne 'ack' -or $packet.id -ne $id)
  if (-not $packet.data.ok) { throw $packet.data.error }
}

function Wait-Playing([Net.WebSockets.ClientWebSocket]$Socket) {
  do { $packet = Receive-Packet $Socket } while ($packet.type -ne 'event' -or $packet.event -ne 'state' -or $packet.data.status -ne 'playing')
  $packet.data
}

$sockets = @()
try {
  $owner = Invoke-JsonPost '/rooms' @{ playerId = 'e2e-owner'; name = '公网测试房主'; rules = @{ rounds = 4 } }
  if (-not $owner.ok) { throw $owner.error }
  $players = @($owner)
  1..3 | ForEach-Object {
    $joined = Invoke-JsonPost "/rooms/$($owner.code)/join" @{ playerId = "e2e-p$_"; name = "公网测试$_" }
    if (-not $joined.ok) { throw $joined.error }
    $players += $joined
  }
  foreach ($player in $players) { $sockets += Connect-Player $owner.code $player.playerId }
  1..3 | ForEach-Object { Send-Event $sockets[$_] 'toggleReady' }

  # The owner receives the playing state before the start acknowledgement.
  $script:sequence++
  $startId = "e2e-$script:sequence"
  $startJson = @{ id = $startId; event = 'start'; payload = @{} } | ConvertTo-Json -Compress
  $startBytes = [Text.Encoding]::UTF8.GetBytes($startJson)
  [void]$sockets[0].SendAsync([ArraySegment[byte]]::new($startBytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $ownerState = $null
  do {
    $packet = Receive-Packet $sockets[0]
    if ($packet.type -eq 'event' -and $packet.event -eq 'state' -and $packet.data.status -eq 'playing') { $ownerState = $packet.data }
  } while ($packet.type -ne 'ack' -or $packet.id -ne $startId)
  if (-not $packet.data.ok) { throw $packet.data.error }

  $states = @($ownerState)
  1..3 | ForEach-Object { $states += Wait-Playing $sockets[$_] }
  for ($index = 0; $index -lt 4; $index++) {
    $state = $states[$index]
    if ($state.status -ne 'playing' -or $state.players.Count -ne 4) { throw 'Four-player game did not start' }
    foreach ($candidate in $state.players) {
      $hasHand = $candidate.PSObject.Properties.Name -contains 'hand'
      if ($candidate.id -eq $players[$index].playerId -and -not $hasHand) { throw 'Own hand was not delivered' }
      if ($candidate.id -ne $players[$index].playerId -and $hasHand) { throw 'Another player hand was exposed' }
    }
  }
  @{ ok = $true; room = $owner.code; players = 4; status = 'playing'; privateHands = $true } | ConvertTo-Json -Compress
} finally {
  foreach ($socket in $sockets) {
    if ($socket.State -ne [Net.WebSockets.WebSocketState]::Closed) { $socket.Abort() }
    $socket.Dispose()
  }
}
