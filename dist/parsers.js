function decodeXml(value) {
    return value
        .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function xmlAttribute(attrs, key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
}
function timing(value, frameRate, tickRate) {
    if (!value)
        return 0;
    const clock = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (clock)
        return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    const frames = value.match(/^(\d+):(\d+):(\d+):(\d+(?:\.\d+)?)$/);
    if (frames)
        return Number(frames[1]) * 3600 + Number(frames[2]) * 60 + Number(frames[3]) + Number(frames[4]) / frameRate;
    const offset = value.match(/^(\d+(?:\.\d+)?)(ms|s|t)$/);
    if (offset) {
        const amount = Number(offset[1]);
        return offset[2] === "ms" ? amount / 1000 : offset[2] === "t" ? amount / tickRate : amount;
    }
    return Number(value) || 0;
}
function plainText(value) {
    return decodeXml(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function tagBlocks(xml, localName) {
    const tag = new RegExp(`<([\\w.-]+:)?${localName}\\b([^>]*)>([\\s\\S]*?)<\\/([\\w.-]+:)?${localName}\\s*>`, "gi");
    return [...xml.matchAll(tag)].map((match) => ({ attrs: match[2], body: match[3] }));
}
export function parseTtml(xml) {
    const rootAttrs = xml.match(/<(?:[\w.-]+:)?tt\b([^>]*)>/i)?.[1] ?? "";
    const rateMatch = xmlAttribute(rootAttrs, "ttp:frameRate")?.match(/^(\d+)(?:\s+(\d+)\s+(\d+))?$/);
    const frameRate = rateMatch ? Number(rateMatch[1]) * (rateMatch[2] ? Number(rateMatch[2]) / Number(rateMatch[3]) : 1) : 30;
    const tickRate = Number(xmlAttribute(rootAttrs, "ttp:tickRate")) || frameRate;
    const rows = [];
    for (const paragraph of tagBlocks(xml, "p")) {
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
                    if (word.finish === 0)
                        word.finish = row.words?.[index + 1]?.start ?? finish;
                });
            }
            rows.push(row);
        }
    }
    return rows.sort((a, b) => a.start - b.start);
}
export function parseLrc(lrc) {
    const rows = [];
    for (const line of lrc.split(/\r?\n/)) {
        const stamp = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/);
        if (!stamp)
            continue;
        const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
        const text = stamp[4].trim();
        if (text)
            rows.push({ start: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, finish: 0, text });
    }
    return rows.sort((a, b) => a.start - b.start);
}
