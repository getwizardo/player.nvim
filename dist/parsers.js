/**
 * The TTML and LRC parsers.
 *
 * They are deliberately small: the helper only needs the timed lines and the
 * word level timings of a karaoke document.
 */
/** Decode the XML entities of a text. */
export function decodeXml(value) {
    return value
        .replace(/&#x([\da-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, decimal) => safeCodePoint(parseInt(decimal, 10)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}
/** The character of a code point, or a replacement character. */
function safeCodePoint(code) {
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
        return "�";
    }
    return String.fromCodePoint(code);
}
/** Read an attribute of a tag. */
export function xmlAttribute(attrs, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
    return match?.[2];
}
/** Convert a TTML time expression into seconds. */
export function timing(value, frameRate, tickRate) {
    if (!value) {
        return 0;
    }
    const clock = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (clock) {
        return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    }
    const frames = value.match(/^(\d+):(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (frames) {
        return (Number(frames[1]) * 3600 +
            Number(frames[2]) * 60 +
            Number(frames[3]) +
            Number(frames[4]) / (frameRate || 30));
    }
    const offset = value.match(/^(\d+(?:\.\d+)?)(ms|s|t)$/);
    if (offset) {
        const amount = Number(offset[1]);
        if (offset[2] === "ms") {
            return amount / 1000;
        }
        if (offset[2] === "t") {
            return amount / (tickRate || 30);
        }
        return amount;
    }
    return Number(value) || 0;
}
/** The readable text of a fragment of XML. */
export function plainText(value) {
    return decodeXml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
}
/** Every block of a tag, self closing tags included. */
export function tagBlocks(xml, localName) {
    const name = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const paired = new RegExp(`<([\\w.-]+:)?${name}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/([\\w.-]+:)?${name}\\s*>)`, "gi");
    const blocks = [];
    for (const match of xml.matchAll(paired)) {
        const attrs = match[2] ?? "";
        const body = match[3] ?? "";
        if (!body && !/\/>\s*$/.test(match[0])) {
            // A self closing tag: keep the attributes, there is no body.
            continue;
        }
        blocks.push({ attrs, body });
    }
    return blocks;
}
/** Parse a TTML document into timed lyric lines. */
export function parseTtml(xml) {
    const rootAttrs = xml.match(/<(?:[\w.-]+:)?tt\b([^>]*)>/i)?.[1] ?? "";
    const rateMatch = xmlAttribute(rootAttrs, "ttp:frameRate")?.match(/^(\d+)(?:\s+(\d+)\s+(\d+))?$/);
    const frameRate = rateMatch
        ? Number(rateMatch[1]) * (rateMatch[2] ? Number(rateMatch[2]) / Number(rateMatch[3]) : 1)
        : 30;
    const tickRate = Number(xmlAttribute(rootAttrs, "ttp:tickRate")) || frameRate;
    const rows = [];
    const paragraphs = tagBlocks(xml, "p");
    for (const paragraph of paragraphs) {
        const start = timing(xmlAttribute(paragraph.attrs, "begin"), frameRate, tickRate);
        const finish = timing(xmlAttribute(paragraph.attrs, "end"), frameRate, tickRate);
        const words = [];
        for (const span of tagBlocks(paragraph.body, "span")) {
            const text = plainText(span.body);
            const begin = xmlAttribute(span.attrs, "begin");
            const end = xmlAttribute(span.attrs, "end");
            const rawStart = timing(begin, frameRate, tickRate);
            const rawFinish = timing(end, frameRate, tickRate);
            if (text && (begin || end)) {
                const wordStart = rawStart < start ? start + rawStart : rawStart;
                const wordFinish = rawFinish > 0 && rawFinish < start ? start + rawFinish : rawFinish;
                words.push({ start: wordStart, finish: wordFinish, text });
            }
        }
        const text = plainText(paragraph.body);
        if (text) {
            const row = { start, finish, text };
            if (words.length) {
                row.words = words.sort((a, b) => a.start - b.start);
                row.words.forEach((word, index) => {
                    if (word.finish === 0) {
                        word.finish = row.words?.[index + 1]?.start ?? finish;
                    }
                });
            }
            rows.push(row);
        }
    }
    rows.sort((a, b) => a.start - b.start);
    // A paragraph without an end inherits the start of the next one.
    for (let index = 0; index < rows.length - 1; index += 1) {
        if (!rows[index].finish) {
            rows[index].finish = rows[index + 1].start;
        }
    }
    return rows;
}
/** Parse a synced LRC document into timed lyric lines. */
export function parseLrc(lrc) {
    const rows = [];
    for (const line of lrc.split(/\r?\n/)) {
        const stamps = [];
        let rest = line;
        // A line may carry several timestamps, for example [00:01.00][01:00.00] text
        while (true) {
            const stamp = rest.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/);
            if (!stamp) {
                break;
            }
            const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
            stamps.push(Number(stamp[1]) * 60 + Number(stamp[2]) + fraction);
            rest = rest.slice(stamp[0].length);
        }
        if (!stamps.length) {
            continue;
        }
        const text = rest.trim();
        if (!text) {
            continue;
        }
        for (const start of stamps) {
            rows.push({ start, finish: 0, text });
        }
    }
    return rows.sort((a, b) => a.start - b.start);
}
