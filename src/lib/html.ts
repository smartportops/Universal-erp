const allowed = new Set(["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "blockquote", "div", "span"]);
const rename: Record<string, string> = { b: "strong", i: "em", div: "p" };

/** Keeps simple formatting, drops scripts, styles, handlers and unknown tags. */
export function cleanHtml(input: string) {
  let html = input.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const raw = rawTag.toLowerCase();
    if (!allowed.has(raw)) return "";
    const tag = rename[raw] ?? raw;
    const closing = match.startsWith("</");
    if (closing) return `</${tag}>`;
    if (tag === "a") {
      const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrs);
      const url = (href?.[1] ?? href?.[2] ?? "").trim();
      if (/^(https?:|mailto:|\/)/i.test(url)) return `<a href="${url.replace(/"/g, "&quot;")}" rel="noopener">`;
      return "<a>";
    }
    if (tag === "span") return "";
    return tag === "br" ? "<br>" : `<${tag}>`;
  });
  return html
    .replace(/<\/?span>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<p>(<(?:ul|ol|h[1-6]|blockquote)>[\s\S]*?<\/(?:ul|ol|h[1-6]|blockquote)>)<\/p>/g, "$1")
    .trim();
}

export function htmlToText(html: string) {
  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
