# Embedded document font

`NotoSans.ttf` is an unmodified copy of Google Fonts' `NotoSans[wdth,wght].ttf`.
Use the default regular instance (weight400, width100). The original name,
copyright and SIL Open Font License1.1 are retained; see `OFL.txt` (one upstream
trailing space normalized; license wording unchanged).

- Source revision: `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`.
- [Upstream font](https://github.com/google/fonts/blob/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf).
- [Upstream license](https://github.com/google/fonts/blob/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notosans/OFL.txt).
- SHA-256: `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d`.
- Size: 2,049,096 bytes; 3,094 mapped Unicode codepoints, 64 coverage ranges.

Owner approved Noto Sans for PDF only on2026-09-15 after inspection found no
tenge glyph in the available/current Roboto files. Web typography and DOCX
are unchanged. No system font installation, network call, npm dependency or
font conversion is needed to run the renderer. PDFKit embeds/subsets this font.
Nest copies the whole directory to `dist/src/modules/documents/fonts`.

`coverage.json` records the asset/license hashes, pinned upstream URLs and
contiguous Unicode ranges generated from the exact TTF cmap. PDF generation
uses the font binary unchanged; the license hash uses normalized LF line endings.
The renderer
rejects unmapped characters explicitly (existing document failure handling),
without substituting another currency or silently dropping text. Newlines,
carriage returns and tabs are layout controls. This is not an all-Unicode font.

When intentionally updating this asset, verify its license/source, regenerate
the coverage from the font cmap and run the renderer regression + compiled
artifact/PDF visual checks. A matching hash proves the coverage belongs to
the shipped binary, not to CSS unicode-range declarations.

Offline generation recipe for the ranges (using PDFKit's already installed
fontkit parser, not a new production dependency):

```js
const { createRequire } = require("node:module");
const fontkit = createRequire(require.resolve("pdfkit"))("fontkit");
const font = fontkit.openSync("NotoSans.ttf");
const ranges = [];
for (const code of [...font.characterSet].sort((a, b) => a - b)) {
  const last = ranges.at(-1);
  if (last && last[1] + 1 === code) last[1] = code;
  else ranges.push([code, code]);
}
```
