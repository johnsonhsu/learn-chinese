# Learn-Chinese — curriculum brain 🧠

The app's curriculum data ("brain"), exported from `content.db` to plain TSV so
it's browsable and diffable here. All Traditional Chinese / Taiwan Mandarin.
These TSVs are the human-readable view; the app itself runs from `platform/content.db`
in the same repo, so the project is reproducible end-to-end.

| File | What it holds | Rows |
|------|---------------|------|
| [`sentences.tsv`](sentences.tsv) | Practice sentence pairs — Traditional Chinese · English | ~10,952 |
| [`tocfl-words.tsv`](tocfl-words.tsv) | TOCFL word list — word, tier, level, zhuyin, pinyin, definition, … | 14,396 |
| [`char-words.tsv`](char-words.tsv) | Character → word mapping (which words each character appears in) | 29,244 |

Each file is tab-separated with a header row. Re-export from `content.db` to
update.
