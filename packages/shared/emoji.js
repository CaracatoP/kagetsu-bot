const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
function normalizeEmoji(value) {
  return String(value || "").trim();
}
function isDiscordEmoji(value) {
  const emoji = normalizeEmoji(value);
  if (!emoji) return true;
  if (/^(?:<a?:[a-zA-Z0-9_]{2,32}:\d{16,22}>|\d{16,22})$/.test(emoji))
    return true;
  return (
    [...segmenter.segment(emoji)].length === 1 &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji)
  );
}
module.exports = { normalizeEmoji, isDiscordEmoji };
