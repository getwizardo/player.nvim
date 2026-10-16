-- Lua Library inline imports
local function __TS__ObjectAssign(target, ...)
    local sources = {...}
    for i = 1, #sources do
        local source = sources[i]
        if type(source) == "table" then
            for key in pairs(source) do
                target[key] = source[key]
            end
        end
    end
    return target
end
-- End of Lua Library inline imports
local ____exports = {}
--- Shared highlight groups: a dark, Apple-Music-flavoured palette that keeps
-- `default = true` so a user's colourscheme can still override it.
function ____exports.define()
    local function set(name, definition)
        return vim.api.nvim_set_hl(
            0,
            name,
            __TS__ObjectAssign({}, definition, {default = true})
        )
    end
    set("PlayerSurface", {bg = "#17151d", fg = "#eeeaf2"})
    set("PlayerBorder", {fg = "#d85c86", bg = "#17151d"})
    set("PlayerEyebrow", {fg = "#e58ca5", bold = true})
    set("PlayerTitle", {fg = "#fff7fb", bold = true})
    set("PlayerMuted", {fg = "#aaa1b2"})
    set("PlayerAccent", {fg = "#ff739b", bold = true})
    set("PlayerBar", {fg = "#b85e85"})
    set("PlayerLyricActive", {fg = "#fff7fb", bold = true})
    set("PlayerLyricInactive", {fg = "#8d8496"})
    set("PlayerTimestamp", {fg = "#7c7385"})
    set("PlayerKaraokeWord", {fg = "#ff7ba4", bold = true, underline = true})
    set("PlayerKaraokeSung", {fg = "#c9a7b6"})
    set("PlayerTranslation", {fg = "#9d94a6", italic = true})
    set("PlayerSection", {fg = "#e58ca5", bold = true})
end
--- Window-local highlight remap used by every float.
function ____exports.floatHighlights()
    return "Normal:PlayerSurface,NormalFloat:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow"
end
return ____exports
