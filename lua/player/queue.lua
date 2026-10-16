--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____format = require("player.format")
local sourceLabel = ____format.sourceLabel
local ____lua_2Dutil = require("player.lua-util")
local clear = ____lua_2Dutil.clear
local push = ____lua_2Dutil.push
local removeAt = ____lua_2Dutil.removeAt
--- Create an empty queue.
function ____exports.createQueue()
    return {
        items = {},
        current = -1,
        history = {},
        shuffle = false,
        ["repeat"] = "off"
    }
end
--- Append a track to the queue and return its index.
function ____exports.addItem(state, source, label)
    local item = {
        source = source,
        label = label ~= nil and label ~= "" and label or sourceLabel(source)
    }
    state.items[#state.items + 1] = item
    return #state.items - 1
end
--- Remove a track from the queue. Returns false when the index is invalid.
function ____exports.removeItem(state, index)
    if index < 0 or index >= #state.items then
        return false
    end
    removeAt(state.items, index)
    if state.current > index then
        state.current = state.current - 1
    elseif state.current == index then
        state.current = #state.items > index and index or #state.items - 1
    end
    do
        local position = 0
        while position < #state.history do
            if state.history[position + 1] > index then
                local ____state_history_0, ____temp_1 = state.history, position + 1
                ____state_history_0[____temp_1] = ____state_history_0[____temp_1] - 1
            elseif state.history[position + 1] == index then
                removeAt(state.history, position)
                position = position - 1
            end
            position = position + 1
        end
    end
    return true
end
--- Remove every track and reset the playback position.
function ____exports.clearQueue(state)
    clear(state.items)
    state.current = -1
    clear(state.history)
end
--- Index of the track that should play next.
-- 
-- Returns undefined when the queue is exhausted. `random` is injected so that
-- the shuffle behaviour stays deterministic in tests.
function ____exports.nextIndex(state, random)
    local total = #state.items
    if total == 0 then
        return nil
    end
    if state.current < 0 then
        return 0
    end
    if state.shuffle and total > 1 then
        local candidate = math.floor(random() * total)
        if candidate > total - 1 then
            candidate = total - 1
        end
        if candidate < 0 then
            candidate = 0
        end
        if candidate == state.current then
            candidate = (candidate + 1) % total
        end
        return candidate
    end
    if state.current + 1 < total then
        return state.current + 1
    end
    if state["repeat"] == "queue" then
        return 0
    end
    return nil
end
--- Index of the track that should play when the user asks for the previous
-- one. The playback history wins over the queue order.
function ____exports.previousIndex(state)
    if #state.history > 0 then
        local index = state.history[#state.history]
        removeAt(state.history, #state.history - 1)
        if index >= 0 and index < #state.items then
            return index
        end
    end
    if state.current > 0 then
        return state.current - 1
    end
    return nil
end
--- Remember the track that was playing before switching to another one.
function ____exports.recordHistory(state, index)
    if index < 0 then
        return
    end
    push(state.history, index)
end
--- Enable or disable shuffle and return the new state.
function ____exports.setShuffle(state, enabled)
    state.shuffle = enabled
    return state.shuffle
end
--- Set or cycle the repeat mode and return the new mode.
function ____exports.cycleRepeat(state, mode)
    if mode ~= nil and mode ~= "" then
        if mode == "off" or mode == "queue" or mode == "track" then
            state["repeat"] = mode
        end
        return state["repeat"]
    end
    if state["repeat"] == "off" then
        state["repeat"] = "queue"
    elseif state["repeat"] == "queue" then
        state["repeat"] = "track"
    else
        state["repeat"] = "off"
    end
    return state["repeat"]
end
--- Snapshot of the queue, used by the dashboard and by `:PlayerStatus`.
function ____exports.describe(state)
    return {count = #state.items, current = state.current + 1, shuffle = state.shuffle, ["repeat"] = state["repeat"]}
end
local shared = ____exports.createQueue()
--- The queue the player is using.
function ____exports.state()
    return shared
end
--- Snapshot of the queue, used by the dashboard and by `:PlayerStatus`.
function ____exports.queueInfo()
    return ____exports.describe(shared)
end
--- Find the index of a queued track by source.
function ____exports.findSource(state, source)
    do
        local index = 0
        while index < #state.items do
            if state.items[index + 1].source == source then
                return index
            end
            index = index + 1
        end
    end
    return -1
end
return ____exports
