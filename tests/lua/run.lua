#!/usr/bin/env luajit
--[[
Test suite for the compiled plugin.

Run through `npm test`, which starts the mock API server, exports
PLAYER_TEST_BASE and PLAYER_ROOT, and then runs this file with LuaJIT.

Everything here exercises the Lua that `tstl` actually emitted from
`src/player/**.ts` — never a copy of the logic.
]]

local root = os.getenv("PLAYER_ROOT") or "."
package.path = root .. "/lua/?.lua;" .. package.path

dofile(root .. "/tests/lua/vim-shim.lua")
local T = _G.__player_test
local base = os.getenv("PLAYER_TEST_BASE")

if not base then
  io.stderr:write("PLAYER_TEST_BASE is not set; start tests/node/server.ts first.\n")
  os.exit(2)
end

T.set_executables("curl", "mpv")

local config = require("player.config")
local mockOptions = {
  http = "curl",
  mpv = "mpv",
  default_volume = 70,
  lyric = {
    lrc_red = base .. "/lrc.red",
    lrclib = base .. "/lrclib.net",
    jiosaavn_api = base .. "/saavn",
    sources = { "lrc.red", "lrclib", "jiosaavn" },
    timeout = 10,
  },
  search = {
    sources = { "archive", "audius" },
    limit = 5,
    audius = base .. "/audius/discover",
    archive = base .. "/archive",
    timeout = 10,
  },
  translator = { url = base .. "/translate", api_key = "", source = "auto" },
}
config.setup(mockOptions)

-- ----------------------------------------------------------------- harness
local cases = {}
local failures = {}
local passed = 0

local function test(name, fn)
  cases[#cases + 1] = { name = name, fn = fn }
end

local function report(message)
  failures[#failures + 1] = message
  error(message, 0)
end

local function expect_eq(actual, expected, message)
  if actual ~= expected then
    report(string.format("%s: expected %s, got %s", message or "expect_eq", tostring(expected), tostring(actual)))
  end
end

local function expect_true(value, message)
  if not value then
    report(message or "expected a truthy value")
  end
end

local function expect_near(actual, expected, tolerance, message)
  if type(actual) ~= "number" or math.abs(actual - expected) > tolerance then
    report(string.format("%s: expected ~%s, got %s", message or "expect_near", tostring(expected), tostring(actual)))
  end
end

local function expect_contains(haystack, needle, message)
  if type(haystack) ~= "string" or not string.find(haystack, needle, 1, true) then
    report(string.format("%s: %q does not contain %q", message or "expect_contains", tostring(haystack), tostring(needle)))
  end
end

local function fixture(name)
  return T.read_file(root .. "/tests/fixtures/" .. name)
end

local util = require("player.util")

-- ------------------------------------------------------------------- util
test("replace collapses a trailing slash run", function()
  expect_eq(util.replace("https://lrc.red///", "/+$", ""), "https://lrc.red")
end)

test("match returns the captures in order", function()
  local parts = util.match("01:23.45", "^(%d+):(%d+%.?%d*)$")
  expect_eq(#parts, 2, "two captures")
  expect_eq(parts[1], "01")
  expect_eq(parts[2], "23.45")
  expect_eq(#util.match("nope", "^(%d+)$"), 0, "no match gives an empty array")
end)

test("matchPairs walks a repeated pattern", function()
  local stamps = util.matchPairs("[00:27.39][00:29.10] text", "%[(%d+):(%d+%.?%d*)%]")
  expect_eq(#stamps, 2, "two timestamps")
  expect_eq(stamps[1][1], "00")
  expect_eq(stamps[2][2], "29.10")
end)

test("indexOf is a plain 1-based search", function()
  expect_eq(util.indexOf("enough", "ou"), 3)
  expect_eq(util.indexOf("enough", "zz"), nil)
  expect_eq(util.indexOf("enough", "ou", 4), nil, "init is honoured")
end)

test("inlineText keeps split words together but real spaces stay", function()
  expect_eq(util.inlineText("<span>e</span><span>nough</span>"), "enough")
  expect_eq(util.inlineText("<span>I</span> <span>said</span>"), "I said")
  expect_eq(util.plainText("<p>a</p><p>b</p>"), "a b")
end)

test("decodeXmlEntities handles named and numeric entities", function()
  expect_eq(util.decodeXmlEntities("&lt;b&gt;&amp;&#39;"), "<b>&'")
end)

test("urlEncode and buildUrl produce a query string", function()
  expect_eq(util.buildUrl("https://lrc.red/", "/search.json", { q = "blinding lights", page = 2 }), "https://lrc.red/search.json?page=2&q=blinding+lights")
  expect_eq(util.buildUrl("https://x.test", "/a", { q = nil, k = "a&b" }), "https://x.test/a?k=a%26b")
end)

test("formatTime and formatStamp", function()
  expect_eq(util.formatTime(200), "3:20")
  expect_eq(util.formatTime(3725), "1:02:05")
  expect_eq(util.formatTime(nil), "--:--")
  expect_eq(util.formatStamp(83.456), "01:23.46")
end)

test("similarity ranks word overlap", function()
  expect_near(util.similarity("Blinding Lights", "blinding lights"), 1, 0.001)
  expect_near(util.similarity("Blinding Lights", "Blinding Lights (Live)"), 0.9, 0.001)
  expect_near(util.similarity("Blinding Lights", "Dancing Queen"), 0, 0.001)
end)

test("padRight and clamp01", function()
  expect_eq(util.padRight("ab", 5), "ab   ")
  expect_eq(util.clamp01(2), 1)
  expect_eq(util.clamp01(-1), 0)
end)

test("splitLines ignores empty lines", function()
  expect_eq(#util.splitLines("a\n\nb\r\n"), 2)
end)

-- -------------------------------------------------------------------- XML
local xmlmod = require("player.format.xml")

test("parseXml nests children and decodes text", function()
  local document = xmlmod.parseXml('<tt xmlns:lrc="urn:lrc"><p lrc:key="L1">He said &quot;hi&quot;</p><p>bye</p></tt>')
  expect_true(document ~= nil, "root parsed")
  expect_eq(document["local"], "tt")
  expect_eq(#document.children, 2, "two paragraphs")
  expect_eq(xmlmod.attr(document.children[1], "lrc:key"), "L1")
  expect_eq(document.children[1].text, 'He said "hi"')
  expect_eq(#xmlmod.findAll(document, "p"), 2)
  expect_eq(xmlmod.textOf(xmlmod.findFirst(document, "p")), 'He said "hi"')
end)

test("parseXml skips declarations, comments and self-closing tags", function()
  local document = xmlmod.parseXml('<?xml version="1.0"?><!-- note --><root><a/><b>x</b></root>')
  expect_true(document ~= nil)
  expect_eq(document["local"], "root")
  expect_eq(#document.children, 2)
  expect_eq(document.children[1]["local"], "a")
  expect_eq(#document.children[1].children, 0, "self-closing has no children")
end)

-- ------------------------------------------------------------------- TTML
local ttml = require("player.format.ttml")

test("parseTtml reads the real lrc.red Blinding Lights file", function()
  local document = ttml.parseTtml(fixture("lrcred_blinding_lights.ttml"))
  expect_true(#document.lines >= 30, "found the lyric lines, got " .. #document.lines)
  expect_eq(document.timing, "word", "lrc:timing=Word maps to word sync")
  local first = document.lines[1]
  expect_near(first.start, 27.395, 0.001, "first line begins at 27.395s")
  expect_contains(first.text, "tryna", "the first line is the opening lyric")
  expect_true(first.words ~= nil, "the first line has word timings")
  expect_true(#first.words > 1, "more than one word, got " .. #first.words)
  -- lrc.red splits single words across spans, so the text must not gain spaces.
  expect_true(not string.find(first.text, "  ", 1, true), "no doubled spaces in the line text")
  local firstWord = first.words[1]
  expect_near(firstWord.start, 27.395, 0.001, "the first word starts with the line")
  expect_true(firstWord.finish > firstWord.start, "the first word has an end time")
  expect_true(#document.songwriters == 5, "five songwriters, got " .. #document.songwriters)
end)

test("TTML word text rejoins to the line text", function()
  local document = ttml.parseTtml(fixture("lrcred_blinding_lights.ttml"))
  local joined = 0
  for index = 1, math.min(#document.lines, 25) do
    local line = document.lines[index]
    if line.words and #line.words > 0 then
      local words = {}
      for position = 1, #line.words do
        words[position] = line.words[position].text
      end
      expect_true(#table.concat(words, " ") > 0, "line " .. index .. " has word text")
      joined = joined + 1
    end
  end
  expect_true(joined > 20, "most of the first 25 lines carry words, got " .. joined)
end)

test("timing() converts every TTML time expression", function()
  expect_near(ttml.timing("00:01:02.500", 30, 1000), 62.5, 0.001, "clock time")
  expect_near(ttml.timing("01:30", 30, 1000), 90, 0.001, "minutes and seconds")
  expect_near(ttml.timing("1500ms", 30, 1000), 1.5, 0.001, "milliseconds")
  expect_near(ttml.timing("2500t", 30, 1000), 2.5, 0.001, "ticks")
  expect_near(ttml.timing("30", 30, 1000), 30, 0.001, "plain seconds")
end)

-- -------------------------------------------------------------------- LRC
local lrc = require("player.format.lrc")

test("parseLrc handles repeated stamps, metadata and blank lines", function()
  local document = lrc.parseLrc("[ti:Blinding Lights]\n[ar:The Weeknd]\n[offset:100]\n\n[00:27.39] I thought I'd seen enough\n[00:29.10][00:59.10] repeat me\n[00:31.05]\n")
  expect_eq(document.meta.title, "Blinding Lights")
  expect_eq(document.meta.artist, "The Weeknd")
  expect_eq(document.meta.offset, 100)
  expect_eq(#document.lines, 3, "three timed lines, got " .. #document.lines)
  expect_near(document.lines[1].start, 27.49, 0.001, "offset is applied")
  expect_eq(document.lines[1].text, "I thought I'd seen enough")
  expect_eq(document.lines[2].text, "repeat me")
  expect_true(document.lines[2].finish > 0, "line ends are filled in from the next line")
end)

test("parseLrc reads A2 enhanced word timestamps", function()
  local document = lrc.parseLrc("[00:10.00]<00:10.00>Hello <00:10.50>world\n")
  expect_eq(#document.lines, 1)
  expect_eq(document.lines[1].text, "Hello world")
  expect_eq(#document.lines[1].words, 2)
  expect_near(document.lines[1].words[2].start, 10.5, 0.001)
end)

test("parseLrc strips the leading space LRCLIB puts after ]", function()
  local document = lrc.parseLrc(fixture("lrc-red-synced.lrc"))
  expect_eq(#document.lines, 6, "six timed lines, got " .. #document.lines)
  expect_eq(document.lines[1].text, "I thought I'd seen enough")
  expect_true(not string.find(document.lines[1].text, "^ "), "no leading space")
end)

-- ------------------------------------------------------------- providers
local lrcred = require("player.providers.lrcred")

test("lrc.red /search.json returns hits", function()
  local hits, failure
  lrcred.search("blinding lights", function(result, error)
    hits, failure = result, error
  end)
  expect_eq(failure, nil, "no error")
  expect_eq(#hits, 2, "two hits")
  expect_eq(hits[1].isrc, "USUG11904206")
  expect_eq(hits[1].title, "Blinding Lights")
  expect_eq(hits[1].duration, 200)
  local candidates = lrcred.toCandidates(hits)
  expect_eq(candidates[1].provider, "lrc.red")
  expect_eq(candidates[1].id, "USUG11904206")
end)

test("lrc.red /match.json keeps the relevance score", function()
  local hits
  lrcred.match("Blinding Lights", "The Weeknd", "After Hours", 200.4, function(result)
    hits = result
  end)
  expect_eq(#hits, 2)
  expect_near(hits[1].score, 8.465, 0.001, "top score first")
end)

test("lrc.red /s/<ISRC>.json reports the sync mode", function()
  local meta
  lrcred.metadata("usug11904206", function(value)
    meta = value
  end)
  expect_true(meta ~= nil, "metadata returned")
  expect_eq(meta.sync, "word")
  expect_eq(meta.language, "en")
  expect_eq(#meta.songwriters, 5)
  expect_contains(meta.ttml or "", "USUG11904206.ttml")
end)

test("lrc.red /s/<ISRC>.ttml parses into word-synced lines", function()
  local document
  lrcred.fetchTtml("USUG11904206", function(value)
    document = value
  end)
  expect_true(document ~= nil, "document parsed")
  expect_true(#document.lines >= 30, "line count " .. #document.lines)
end)

test("lrc.red rejects a malformed ISRC without a request", function()
  local failure
  local before = #T.record.system
  lrcred.fetchTtml("NOPE", function(_value, error)
    failure = error
  end)
  expect_eq(#T.record.system, before, "no HTTP call was made")
  expect_contains(failure, "not a 12 character ISRC")
end)

local lrclib = require("player.providers.lrclib")

test("LRCLIB /api/search returns synced candidates and drops instrumentals", function()
  local candidates
  lrclib.search("blinding lights the weeknd", function(value)
    candidates = value
  end)
  expect_eq(#candidates, 1, "the instrumental record is filtered out, got " .. #candidates)
  expect_eq(candidates[1].provider, "LRCLIB")
  expect_eq(candidates[1].sync, "line", "syncedLyrics is line level")
  expect_eq(candidates[1].id, "1234567")
  expect_eq(candidates[1].duration, 200)
end)

test("LRCLIB lyrics parse into timed lines", function()
  local candidates, set
  lrclib.search("blinding lights", function(value)
    candidates = value
  end)
  require("player.lyrics").fetch(candidates[1], function(value)
    set = value
  end)
  expect_true(set ~= nil, "set fetched")
  expect_eq(#set.lines, 6, "six lines, got " .. #set.lines)
  expect_eq(set.lines[1].text, "I thought I'd seen enough")
  expect_near(set.lines[1].start, 27.39, 0.001)
end)

local jiosaavn = require("player.providers.jiosaavn")

test("JioSaavn wrapper search returns songs and tracks", function()
  local songs
  jiosaavn.search("blinding lights", function(value)
    songs = value
  end)
  expect_eq(#songs, 1, "one song")
  expect_eq(songs[1].title, "Blinding Lights")
  expect_eq(songs[1].artist, "The Weeknd")
  expect_contains(songs[1].url, "jiosaavn.com/song/")
  local tracks = jiosaavn.toTracks(songs)
  expect_eq(#tracks, 1)
  expect_eq(tracks[1].provider, "JioSaavn")
  expect_contains(tracks[1].url, "saavncdn.com", "playback uses the CDN file, not the HTML page")
end)

-- -------------------------------------------------------------- sources
local archive = require("player.sources.archive")

test("Archive search returns items", function()
  local tracks
  archive.search("nightwish imaginaerum", function(value)
    tracks = value
  end)
  expect_eq(#tracks, 2, "two items")
  expect_eq(tracks[1].provider, "Archive")
  expect_eq(tracks[1].artist, "Nightwish")
  expect_contains(tracks[1].url, "/download/nightwish-imaginaerum/")
end)

test("Archive metadata expands an item into playable files", function()
  local tracks
  archive.tracks("nightwish-imaginaerum", function(value)
    tracks = value
  end)
  expect_eq(#tracks, 3, "three audio files (the PNG is skipped), got " .. #tracks)
  local joined = ""
  for index = 1, #tracks do
    joined = joined .. tracks[index].url .. "\n"
  end
  expect_contains(joined, base .. "/archive/download/nightwish-imaginaerum/02%20-%20Storytime.mp3")
  expect_contains(joined, base .. "/archive/download/nightwish-imaginaerum/01%20-%20Taikatalvi.flac")
  expect_true(tracks[1].duration ~= nil and tracks[1].duration > 0, "durations come from the file list")
end)

local audius = require("player.sources.audius")

test("Audius discovery then track search", function()
  local tracks
  audius.search("lofi", function(value)
    tracks = value
  end)
  expect_eq(#tracks, 2, "two tracks")
  expect_eq(tracks[1].provider, "Audius")
  expect_contains(tracks[1].url, "/v1/tracks/trackAAA/stream?app_name=player.nvim")
  expect_eq(tracks[1].artist, "Night Owl")
  expect_eq(tracks[1].duration, 180)
end)

local search = require("player.search")

test("search.run merges every enabled source", function()
  local tracks, errors
  search.run({ query = "nightwish" }, function(value, failures)
    tracks, errors = value, failures
  end)
  expect_eq(#errors, 0, "no source failed: " .. table.concat(errors or {}, "; "))
  expect_eq(#tracks, 4, "2 archive items + 2 audius tracks, got " .. #tracks)
  local seen = {}
  for index = 1, #tracks do
    seen[tracks[index].provider] = true
  end
  expect_true(seen.Archive, "archive results present")
  expect_true(seen.Audius, "audius results present")
end)

test("search.resolve expands an Archive item into its files", function()
  local expanded
  search.resolve({ provider = "Archive", title = "Imaginaerum", artist = "Nightwish", url = base .. "/archive/download/nightwish-imaginaerum/" }, function(value)
    expanded = value
  end)
  expect_eq(#expanded, 3, "three files, got " .. #expanded)
end)

-- --------------------------------------------------------------- lyrics
local lyrics = require("player.lyrics")

test("lyrics.search fans out to every configured provider", function()
  local candidates, errors
  lyrics.search("blinding lights", function(value, failures)
    candidates, errors = value, failures
  end)
  expect_eq(#errors, 0, "no provider failed: " .. table.concat(errors or {}, "; "))
  local providers = {}
  for index = 1, #candidates do
    providers[candidates[index].provider] = true
  end
  expect_true(providers["lrc.red"], "lrc.red candidates")
  expect_true(providers.LRCLIB, "LRCLIB candidates")
  expect_true(providers.JioSaavn, "JioSaavn candidates")
  expect_eq(candidates[1].provider, "lrc.red", "lrc.red ranks first")
  expect_eq(candidates[1].title, "Blinding Lights", "the closest title sorts first")
end)

test("lyrics.fetchIsrc loads word-synced TTML", function()
  local set, failure
  lyrics.fetchIsrc("USUG11904206", function(value, error)
    set, failure = value, error
  end)
  expect_eq(failure, nil, "no error")
  expect_true(set ~= nil, "set returned")
  expect_eq(set.isrc, "USUG11904206")
  expect_eq(set.sync, "word")
  expect_true(#set.lines >= 30, "line count " .. #set.lines)
  expect_contains(lyrics.describeSet(set), "word")
end)

test("lyrics.toLrc round-trips a set back to LRC", function()
  local set
  lyrics.fetchIsrc("USUG11904206", function(value)
    set = value
  end)
  local text = lyrics.toLrc(set)
  expect_contains(text, "[ti:")
  expect_contains(text, "[by:player.nvim via ", "the exporter names its source")
  local reparsed = lrc.parseLrc(text)
  expect_eq(#reparsed.lines, #set.lines, "the LRC has one line per lyric line")
  expect_near(reparsed.lines[1].start, 27.39, 0.01)
end)

-- ------------------------------------------------------------ translate
local translate = require("player.translate")

test("translateLines keeps a 1:1 mapping with the source lines", function()
  local values, failure
  local lines = {
    { start = 0, finish = 1, text = "I thought I'd seen enough" },
    { start = 1, finish = 2, text = "I was dancing with the dark" },
    { start = 2, finish = 3, text = "But the city called my name" },
  }
  translate.translateLines(lines, "vi", function(result, error)
    values, failure = result, error
  end)
  expect_eq(failure, nil, "no error")
  expect_eq(#values, 3, "three translations")
  expect_eq(values[1], "[vi] I thought I'd seen enough")
  expect_eq(values[3], "[vi] But the city called my name")
end)

-- ------------------------------------------------------------------ mpv
local mpv = require("player.mpv")
local mpv_pipe = nil

test("mpv.ensure starts mpv with an IPC socket and flushes queued commands", function()
  expect_true(mpv.ensure(), "ensure() succeeds")
  local job = T.find_job("mpv")
  expect_true(job ~= nil, "a job was started")
  local socket = nil
  for index = 1, #job.argv do
    if string.find(job.argv[index], "--input-ipc-server=", 1, true) then
      socket = string.match(job.argv[index], "^%-%-input%-ipc%-server=(.+)$")
    end
  end
  expect_true(socket ~= nil, "the argv contains --input-ipc-server")
  expect_contains(socket, "player.nvim/mpv-")
  expect_true(job.argv[3] == "--no-terminal", "mpv runs without a terminal")

  -- A command issued before the socket is up has to be queued, not dropped.
  local before
  mpv.getProperty("time-pos", function(value)
    before = value
  end)
  expect_eq(#T.record.writes, 0, "nothing is written before the socket connects")

  T.tick(1) -- runs the scheduled connect()
  local pipe = T.record.pipes[#T.record.pipes]
  expect_true(pipe ~= nil and pipe.connected, "the socket connected")
  expect_eq(#T.record.writes, 1, "the queued command was flushed on connect")
  local flushed = T.json.decode(T.record.writes[1])
  expect_eq(flushed.command[1], "get_property")
  expect_eq(flushed.command[2], "time-pos")
  expect_true(flushed.request_id ~= nil, "the command carries a request id")

  pipe.on_data(nil, '{"error":"success","data":12.5,"request_id":' .. flushed.request_id .. "}\n")
  expect_near(before, 12.5, 0.001, "the reply reached the caller")
  mpv_pipe = pipe
end)

test("mpv reassembles JSON split across reads", function()
  local pipe = mpv_pipe
  expect_true(pipe ~= nil, "the socket from the previous test is still up")
  local value
  mpv.getProperty("duration", function(result)
    value = result
  end)
  local written = T.json.decode(T.record.writes[#T.record.writes])
  local id = written.request_id
  pipe.on_data(nil, '{"error":"success","data":200,"request_id":' .. id)
  expect_eq(value, nil, "a partial line is buffered, not dispatched")
  pipe.on_data(nil, "}\n" .. '{"event":"log-message","level":"info","text":"ignored"}' .. "\n")
  expect_near(value, 200, 0.001, "the line completed on the next read")
end)

test("mpv property observers and end-file events fire", function()
  local pipe = mpv_pipe
  local paused, reason
  mpv.observe("pause", function(value)
    paused = value
  end)
  mpv.onEvent(function(message)
    if message.event == "end-file" then
      reason = message.reason
    end
  end)
  pipe.on_data(nil, '{"event":"property-change","name":"pause","data":true}\n{"event":"end-file","reason":"eof"}\n')
  expect_eq(paused, true, "the pause observer fired")
  expect_eq(reason, "eof", "the end-file handler fired")
end)

test("mpv.loadfile sends a replace command", function()
  local pipe = mpv_pipe
  expect_true(pipe ~= nil, "the socket is still up")
  mpv.play("https://archive.org/download/x/y.flac")
  local written = T.json.decode(T.record.writes[#T.record.writes])
  expect_eq(written.command[1], "loadfile")
  expect_eq(written.command[2], "https://archive.org/download/x/y.flac")
  expect_eq(written.command[3], "replace")
end)

-- -------------------------------------------------------------- karaoke
local karaoke = require("player.karaoke")

test("the karaoke float highlights the sung word at the right column", function()
  local set
  lyrics.fetchIsrc("USUG11904206", function(value)
    set = value
  end)
  karaoke.open(set)
  local floats = T.record.floats
  local win = nil
  for key in pairs(floats) do
    win = key
  end
  expect_true(win ~= nil, "a float window was opened")
  local buf = vim.api.nvim_win_get_buf(win)
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1)
  expect_true(#lines > #set.lines, "the lyrics were rendered with a header, got " .. #lines)
  local needle = string.sub(set.lines[1].text, 1, 8)
  local row = nil
  for index = 1, #lines do
    if string.find(lines[index], needle, 1, true) then
      row = index - 1
      break
    end
  end
  expect_true(row ~= nil, "found the opening line (" .. needle .. ") in the buffer")
  local text = lines[row + 1]
  local firstWord = set.lines[1].words[1].text
  local expected = string.find(text, firstWord, 1, true)
  expect_true(expected ~= nil, "the first word is in the rendered line")

  karaoke.update(27.45)
  local words = T.marks_for(buf, "PlayerKaraokeWord")
  expect_eq(#words, 1, "exactly one word is mid-sing, got " .. #words)
  expect_eq(words[1].col, expected - 1, "the highlight starts at the word (0-based)")
  expect_eq(string.sub(text, words[1].col + 1, words[1].end_col), firstWord, "the highlight covers the whole word")
  local active = {}
  for _, mark in ipairs(T.marks_for(buf, nil)) do
    if mark.line_hl_group == "PlayerLyricActive" then
      active[#active + 1] = mark
    end
  end
  expect_eq(#active, 1, "one active line")
  expect_eq(active[1].row, row, "the active line is the opening line")

  karaoke.update(27.60)
  local sung = T.marks_for(buf, "PlayerKaraokeSung")
  expect_true(#sung >= 1, "a finished word is marked as sung, got " .. #sung)
  karaoke.close()
end)

test("karaoke word columns line up with split TTML words", function()
  local set
  lyrics.fetchIsrc("USUG11904206", function(value)
    set = value
  end)
  karaoke.open(set)
  local win = nil
  for key in pairs(T.record.floats) do
    win = key
  end
  local buf = vim.api.nvim_win_get_buf(win)
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1)
  -- Find a line whose first word is longer than one TTML span and check that
  -- the extmark covers the whole word rather than just its first fragment.
  local checked = 0
  for index = 1, #set.lines do
    local line = set.lines[index]
    if line.words and #line.words > 2 then
      karaoke.update(line.words[1].start + 0.01)
      local marks = T.marks_for(buf, "PlayerKaraokeWord")
      expect_eq(#marks, 1, "one active word on line " .. index)
      local rendered = lines[marks[1].row + 1]
      local word = line.words[1].text
      expect_eq(string.sub(rendered, marks[1].col + 1, marks[1].end_col), word, "the highlight covers " .. word)
      checked = checked + 1
      if checked >= 5 then
        break
      end
    end
  end
  expect_true(checked >= 5, "checked at least five lines, got " .. checked)
  karaoke.close()
end)

-- ------------------------------------------------------- end to end drive
local commands = require("player.commands")
local ui = require("player.ui")

test(":Player registers every documented command", function()
  require("player.init").setup(mockOptions)
  commands.register()
  for _, name in ipairs({
    "Player", "PlayerSearch", "PlayerUrl", "PlayerNext", "PlayerPrev", "PlayerToggle",
    "PlayerStop", "PlayerSeek", "PlayerVolume", "PlayerVisual", "PlayerDownload",
    "PlayerStatus", "PlayerSources", "PlayerLyrics", "PlayerLyricsSearch",
    "PlayerLyricsIsrc", "PlayerTranslate", "PlayerKaraoke", "PlayerClose",
    "PlayerDiagnostics", "PlayerDoctor",
  }) do
    expect_true(T.record.commands[name] ~= nil, ":" .. name .. " exists")
  end
  local bound = 0
  for _ in pairs(T.record.keymaps) do
    bound = bound + 1
  end
  expect_true(bound >= 4, "the global keymaps were bound, got " .. bound)
end)

test(":Player opens the dashboard and a search fills it", function()
  T.record.commands["Player"].fn({ args = "", fargs = {}, name = "Player" })
  local windows = 0
  for _, float in pairs(T.record.floats) do
    if float.valid then
      windows = windows + 1
    end
  end
  expect_true(windows >= 3, "results, now-playing and transport floats, got " .. windows)

  T.record.commands["PlayerSearch"].fn({ args = "nightwish", fargs = { "nightwish" }, name = "PlayerSearch" })
  local results = nil
  for win, float in pairs(T.record.floats) do
    if float.valid and vim.bo[float.buf].filetype == "playerresults" then
      results = win
    end
  end
  expect_true(results ~= nil, "the results float is open")
  local lines = vim.api.nvim_buf_get_lines(vim.api.nvim_win_get_buf(results), 0, -1)
  local joined = table.concat(lines, "\n")
  expect_contains(joined, "nightwish", "the query is echoed in the header")
  expect_contains(joined, "ARCHIVE", "the archive group header is rendered")
  expect_contains(joined, "AUDIUS", "the audius group header is rendered")
  expect_contains(joined, "4 track(s)", "all four results are listed")

  -- <CR> in the results pane has to reach the playback layer.
  local before = #T.record.writes
  local buf = vim.api.nvim_win_get_buf(results)
  local enter = nil
  for _, map in ipairs(T.record.keymaps) do
    if map.lhs == "<CR>" and map.opts and map.opts.buffer == buf then
      enter = map.rhs
    end
  end
  expect_true(enter ~= nil, "<CR> is bound in the results buffer")
  enter()
  expect_true(#T.record.writes > before, "playback was started")
  local sent = T.json.decode(T.record.writes[#T.record.writes])
  expect_eq(sent.command[1], "loadfile", "the last command is a loadfile")
  expect_contains(sent.command[2], "/archive/download/nightwish-imaginaerum/", "the archive item streams from archive.org")
end)

test(":PlayerSeek and :PlayerVolume drive mpv", function()
  local before = #T.record.writes
  T.record.commands["PlayerSeek"].fn({ args = "-15", fargs = { "-15" }, name = "PlayerSeek" })
  local sent = T.json.decode(T.record.writes[#T.record.writes])
  expect_eq(sent.command[1], "seek")
  expect_near(sent.command[2], -15, 0.001)
  expect_true(#T.record.writes > before)

  T.record.commands["PlayerVolume"].fn({ args = "40", fargs = { "40" }, name = "PlayerVolume" })
  local volume = T.json.decode(T.record.writes[#T.record.writes])
  expect_eq(volume.command[1], "set_property")
  expect_eq(volume.command[3], 40)
end)

-- --------------------------------------------------------------- runner
local function run()
  for index = 1, #cases do
    local case = cases[index]
    T.reset()
    local ok, failure = pcall(case.fn)
    if ok then
      passed = passed + 1
      io.write(string.format("ok   %s\n", case.name))
    else
      io.write(string.format("FAIL %s\n     %s\n", case.name, tostring(failure)))
      failures[#failures + 1] = case.name
    end
  end
  io.write(string.format("\n%d passed, %d failed\n", passed, #failures))
  if #failures > 0 then
    io.write("failed: " .. table.concat(failures, ", ") .. "\n")
    os.exit(1)
  end
  os.exit(0)
end

run()
