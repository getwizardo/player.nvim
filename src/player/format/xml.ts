/**
 * A tiny, allocation-light XML reader.
 *
 * lrc.red serves TTML (Apple-style word-synced lyrics) which nests spans inside
 * paragraphs inside `<div>` song sections, and puts metadata in namespaced
 * elements (`ttm:agent`, `lrc:songPart`). A regex tag scan gets nesting wrong,
 * so the plugin walks the document properly instead.
 */

import { decodeXmlEntities, indexOf, match, matchPairs, sub, trim } from "../util";

export interface XmlNode {
  /** Full name including any namespace prefix, e.g. `ttm:agent`. */
  name: string;
  /** Name without the prefix, e.g. `agent`. */
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Decoded text of the direct text children. */
  text: string;
  /** Raw inner markup. */
  inner: string;
}

function localName(name: string): string {
  const parts = match(name, "^[%w_.%-]+:([%w_.%-]+)$");
  return parts[0] ?? name;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of matchPairs(source, '([%w_.:%-]+)%s*=%s*"([^"]*)"')) attrs[key] = value;
  for (const [key, value] of matchPairs(source, "([%w_.:%-]+)%s*=%s*'([^']*)'")) {
    if (attrs[key] === undefined) attrs[key] = value;
  }
  return attrs;
}

interface Cursor {
  xml: string;
  pos: number;
}

function isBlank(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

/** Skip whitespace, XML declarations, processing instructions and comments. */
function skipIgnorable(cursor: Cursor): void {
  const xml = cursor.xml;
  let moved = true;
  while (moved) {
    moved = false;
    while (cursor.pos <= xml.length && isBlank(sub(xml, cursor.pos, cursor.pos))) cursor.pos += 1;
    if (sub(xml, cursor.pos, cursor.pos + 1) === "<?") {
      const close = indexOf(xml, "?>", cursor.pos);
      cursor.pos = close === undefined ? xml.length + 1 : close + 2;
      moved = true;
    } else if (sub(xml, cursor.pos, cursor.pos + 3) === "<!--") {
      const close = indexOf(xml, "-->", cursor.pos);
      cursor.pos = close === undefined ? xml.length + 1 : close + 3;
      moved = true;
    } else if (sub(xml, cursor.pos, cursor.pos + 1) === "<!") {
      const close = indexOf(xml, ">", cursor.pos);
      cursor.pos = close === undefined ? xml.length + 1 : close + 1;
      moved = true;
    }
  }
}

/**
 * Position of `</name`, ignoring look-alikes: `</tt` must not match `</ttm:name`.
 * The character after the tag name has to be a boundary (space, `>`, `/` or end
 * of input) for the tag to count.
 */
function findCloseTag(xml: string, name: string, from: number): number | undefined {
  const needle = `</${name}`;
  let at = indexOf(xml, needle, from);
  while (at !== undefined) {
    const after = sub(xml, at + needle.length, at + needle.length);
    if (after === "" || isBlank(after) || after === ">" || after === "/") return at;
    at = indexOf(xml, needle, at + 1);
  }
  return undefined;
}

function parseElement(cursor: Cursor): XmlNode | undefined {
  const xml = cursor.xml;
  skipIgnorable(cursor);
  if (sub(xml, cursor.pos, cursor.pos) !== "<") return undefined;
  const name = match(sub(xml, cursor.pos + 1), "^([%w_.:%-]+)")[0];
  if (name === undefined) return undefined;
  const afterName = cursor.pos + 1 + name.length;
  const openEnd = indexOf(xml, ">", afterName);
  if (openEnd === undefined) return undefined;
  let rawAttrs = sub(xml, afterName, openEnd - 1);
  const selfClosing = sub(rawAttrs, -1) === "/";
  if (selfClosing) rawAttrs = sub(rawAttrs, 1, -2);
  const node: XmlNode = {
    name,
    local: localName(name),
    attrs: parseAttributes(rawAttrs),
    children: [],
    text: "",
    inner: "",
  };
  cursor.pos = openEnd + 1;
  if (selfClosing) return node;

  const contentStart = cursor.pos;
  const openTag = `<${name}`;
  let depth = 1;
  let search = cursor.pos;
  let contentEnd: number | undefined;
  while (true) {
    const nextOpen = indexOf(xml, openTag, search);
    const nextClose = findCloseTag(xml, name, search);
    if (nextClose === undefined) break;
    if (nextOpen !== undefined && nextOpen < nextClose) {
      const after = sub(xml, nextOpen + openTag.length, nextOpen + openTag.length);
      if (isBlank(after) || after === "/" || after === ">") depth += 1;
      search = nextOpen + 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      contentEnd = nextClose - 1;
      const tagEnd = indexOf(xml, ">", nextClose);
      cursor.pos = tagEnd === undefined ? xml.length + 1 : tagEnd + 1;
      break;
    }
    search = nextClose + 1;
  }
  if (contentEnd === undefined) {
    // Malformed document: treat the rest of the input as the element body.
    node.inner = sub(xml, contentStart);
    cursor.pos = xml.length + 1;
    return node;
  }
  node.inner = sub(xml, contentStart, contentEnd);
  const inner: Cursor = { xml, pos: contentStart };
  while (inner.pos <= contentEnd) {
    skipIgnorable(inner);
    if (inner.pos > contentEnd) break;
    if (sub(xml, inner.pos, inner.pos) === "<") {
      const child = parseElement(inner);
      if (child === undefined) break;
      node.children.push(child);
      continue;
    }
    const nextTag = indexOf(xml, "<", inner.pos);
    const stop = nextTag === undefined || nextTag > contentEnd + 1 ? contentEnd + 1 : nextTag;
    node.text += decodeXmlEntities(sub(xml, inner.pos, stop - 1));
    inner.pos = stop;
  }
  return node;
}

/** Parse an XML document, returning its root element or `undefined`. */
export function parseXml(xml: string): XmlNode | undefined {
  return parseElement({ xml, pos: 1 });
}

/** Attribute lookup that ignores namespace prefixes (`begin`, `lrc:key`, ...). */
export function attr(node: XmlNode, name: string): string | undefined {
  const direct = node.attrs[name];
  if (direct !== undefined) return direct;
  const bare = localName(name);
  for (const key in node.attrs) {
    if (localName(key) === bare) return node.attrs[key];
  }
  return undefined;
}

/** Depth-first search for the first descendant with the given local name. */
export function findFirst(node: XmlNode, local: string): XmlNode | undefined {
  for (const child of node.children) {
    if (child.local === local) return child;
  }
  for (const child of node.children) {
    const found = findFirst(child, local);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Every descendant (in document order) with the given local name. */
export function findAll(node: XmlNode, local: string): XmlNode[] {
  const found: XmlNode[] = [];
  const walk = (current: XmlNode): void => {
    for (const child of current.children) {
      if (child.local === local) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

/** Direct children with the given local name. */
export function childrenNamed(node: XmlNode, local: string): XmlNode[] {
  const found: XmlNode[] = [];
  for (const child of node.children) {
    if (child.local === local) found.push(child);
  }
  return found;
}

/** Decoded text of an element including all nested text. */
export function textOf(node: XmlNode): string {
  let text = node.text;
  for (const child of node.children) text += textOf(child);
  return trim(text);
}
