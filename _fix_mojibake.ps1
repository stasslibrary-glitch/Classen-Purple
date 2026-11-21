$map = @{}
$map['ðŸ’œ'] = '💜'
$map['â¤ï¸'] = '❤️'
$map['â¤'] = '❤'
$map['ðŸ˜‚'] = '😂'
$map['ðŸŽ‰'] = '🎉'
$map['ðŸ‘Œ'] = '👌'
$map['ðŸ—‘'] = '🗑'
$map['â†©'] = '↩'
$map['âœŽ'] = '✎'
$map['Â·'] = '·'
$map['â€”'] = '—'
$map['â€™'] = "'"
$map['â€œ'] = '"'
$map['â€'] = '"'
$map['â€¦'] = '…'
$map['âš™'] = '⚙'
$map['âœ“'] = '✓'
$map['â€¹'] = '‹'
$map['âŒ‚'] = '⌂'
$map['â™¡'] = '♡'
$map['â–¦'] = '▦'
$map['â™§'] = '♧'
$map['â­'] = '⭐'
$map['ðŸ”¥'] = '🔥'
$map['ðŸŽ®'] = '🎮'
$map['ðŸŒ¹'] = '🌹'
$map['ðŸŽµ'] = '🎵'
$map['ðŸ»'] = '🐻'
$map['ðŸ“'] = '🍓'
$map['ðŸ°'] = '🍰'
$map['ðŸ’‹'] = '💋'
$map['ðŸ”„'] = '🔄'
$map['ðŸŽ¨'] = '🎨'
$map['ðŸ’¬'] = '💬'
$map['ðŸ“¸'] = '📸'
$map['ðŸ—“ï¸'] = '🗓️'
$map['â˜‘ï¸'] = '☑️'
$map['âœ¦'] = '✦'
$map['âˆž'] = '∞'
$map['ðŸ«‚'] = '🫂'
$map['ðŸ’'] = '💍'
$map['â¤ï¸â€ðŸ”¥'] = '❤️‍🔥'
$map['ðŸ¥°'] = '🥰'
$map['ðŸ˜'] = '😍'
$map['ðŸ˜˜'] = '😘'
$map['ðŸ˜Š'] = '😊'
$map['ðŸ˜‰'] = '😉'
$map['ðŸ¥¹'] = '🥹'
$map['ðŸ˜­'] = '😭'
$map['ðŸ’•'] = '💕'
$map['â¤ï¸‍ðŸ”¥'] = '❤️‍🔥'

$files = Get-ChildItem -Recurse -File -Include *.html,*.js,*.css,*.json | Where-Object { $_.FullName -notmatch '\\.git\\' }
$changed = @()
foreach ($f in $files) {
  $text = [System.IO.File]::ReadAllText($f.FullName)
  $orig = $text
  foreach ($k in $map.Keys) { $text = $text.Replace($k, $map[$k]) }
  if ($text -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $text, [System.Text.UTF8Encoding]::new($false))
    $changed += $f.FullName.Replace((Get-Location).Path+'\','')
  }
}
$changed | Sort-Object
Write-Output "---"
Write-Output $changed.Count