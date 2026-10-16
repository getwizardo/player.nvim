--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local function noop()
    return
end
local function noopUrl(_url)
    return
end
local empty = {
    toggle_pause = noop,
    play_next = noop,
    play_previous = noop,
    show_lyrics = noop,
    search_lyrics = noop,
    search_jiosaavn = noop,
    toggle_visualizer = noop,
    configure_filter = noop,
    configure_eq = noop,
    show_queue = noop,
    toggle_shuffle = noop,
    cycle_repeat = noop,
    pick_local = noop,
    volume_down = noop,
    volume_up = noop,
    close_lyrics = noop,
    translate_lyrics = noop,
    toggle_follow = noop,
    play_url = noopUrl
}
local registry = empty
--- Register the actions the floating windows may trigger.
function ____exports.setActions(actions)
    registry = actions
end
--- The registered actions.
function ____exports.actions()
    return registry
end
return ____exports
