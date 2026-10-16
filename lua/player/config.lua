local M = {}

M.defaults = {
  mpv = "mpv",
  yt_dlp = "yt-dlp",
  node = "node",
  jiosaavn_api = "https://saavn.sumit.co",
  translator = {
    url = "http://127.0.0.1:5000",
    api_key = "",
    source = "auto",
  },
  use_telescope = true,
  download_dir = vim.fn.expand("~/Music"),
  default_volume = 75,
  eq = {
    enabled = false,
    bands = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
    frequencies = { 31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 },
  },
  filter = { enabled = false, type = "off", frequency = 1000, width = 1 },
  mpv_args = {},
  lyric = { source = "lrc.red", follow = true },
  keymaps = {
    play_pause = "<Space>", next = "]n", previous = "[n", lyrics = "l",
  },
}

M.options = vim.deepcopy(M.defaults)

function M.setup(options)
  M.options = vim.tbl_deep_extend("force", vim.deepcopy(M.defaults), options or {})
  return M.options
end

return M
