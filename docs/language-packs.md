# Language packs

[← Back to the README](../README.md)

English is built in, and comes as a pack too, so you can see and extend its words. Every other language comes as a **language pack**: one note you download and drop in your vault. With a pack, Word-Smith colors that language's nouns, verbs, adjectives, adverbs and conjunctions, runs its prose checks (filler words, hedges, passive voice, commonly misused words, loose pronouns, dialogue), counts its sentences the way that language ends them, and gives its own reading grade.

## Install a pack

1. Download the pack for your language: its **download** link in the table below saves the file.
2. Put the file in the **Word-Smith** folder in your Vault, where `ws-structure.md` lives. Keep its name as it is (`ws-lang-de.md`, `ws-lang-ru.md`…): the name is how Word-Smith finds it.
3. In **Settings → Word-Smith → Prose → Language**, pick the language. The **{lang}** token on the bar and the menu's Language row switch between the languages you tick there.

A pack is a plain note. Open it and you can read every list it uses. If a word gets the wrong color, add it under the right heading and the change applies as you save.

## The packs

| Language | Pack | Reading grade | On our test | On independent text |
|----------|------|---------------|-------------|---------------------|
| English, the built-in’s words | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-en.md) · [read](../packs/ws-lang-en.md) | Flesch–Kincaid | 98% | 87–88% |
| Dansk (Danish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-da.md) · [read](../packs/ws-lang-da.md) | LIX | 91% | 85% |
| Deutsch (German) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-de.md) · [read](../packs/ws-lang-de.md) | Wiener Sachtextformel | 98% | 91% |
| Español (Spanish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-es.md) · [read](../packs/ws-lang-es.md) | Fernández-Huerta | 95% | 89% |
| Français (French) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-fr.md) · [read](../packs/ws-lang-fr.md) | Kandel and Moles | 98% | 90% |
| Italiano (Italian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-it.md) · [read](../packs/ws-lang-it.md) | Gulpease index | 97% | 89% |
| 日本語 (Japanese) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ja.md) · [read](../packs/ws-lang-ja.md) | Tateisi | 95% | 81–85% |
| 한국어 (Korean) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ko.md) · [read](../packs/ws-lang-ko.md) | LIX, for now | 94% | 79–81% |
| Nederlands (Dutch) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-nl.md) · [read](../packs/ws-lang-nl.md) | Douma | 95% | 88–89% |
| Norsk bokmål (Norwegian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-no.md) · [read](../packs/ws-lang-no.md) | LIX | 90% | 88% |
| Polski (Polish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-pl.md) · [read](../packs/ws-lang-pl.md) | FOG-PL (Pisarek) | 97% | 87% |
| Português (Portuguese) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-pt.md) · [read](../packs/ws-lang-pt.md) | Martins | 97% | 87–89% |
| Português (Brasil) (Brazilian Portuguese) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-pt-BR.md) · [read](../packs/ws-lang-pt-BR.md) | Martins, calibrated on Brazilian text | — | 88–90% |
| Română (Romanian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ro.md) · [read](../packs/ws-lang-ro.md) | Flesch, Spanish coefficients for now | 93% | 88% |
| Русский (Russian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ru.md) · [read](../packs/ws-lang-ru.md) | Oborneva | 98% | 82–87% |
| Svenska (Swedish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-sv.md) · [read](../packs/ws-lang-sv.md) | LIX | 97% | 84–87% |
| Українська (Ukrainian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-uk.md) · [read](../packs/ws-lang-uk.md) | Flesch, Russian coefficients for now | 98% | 83% |
| 简体中文 (Chinese, simplified) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-zh-Hans.md) · [read](../packs/ws-lang-zh-Hans.md) | Characters a sentence and rare characters | 91% | 73% |

English is built in: Word-Smith colors it with or without a pack. The English pack shows the words it knows, the UK’s spellings among them, and takes yours on top. US or UK quotes are set in Settings → Text → Typography → Quote style.

## How the figures were measured

About 1,000 words a language, each one checked by hand: half from a public-domain novel or story, half from that language's Wikipedia article on coffee. The figure is the share of words that get the color a reader would give them. The packs were improved using these same texts, so on your own writing expect a little less. The older books (Danish, Norwegian and Romanian among them) use old spellings, which no pack chases, so those three read lower than they would on modern prose.

Korean and Ukrainian have no settled reading-grade formula, so their grade is a stand-in until one is.

## Your language is missing?

Copy the pack closest to your language, rename it `ws-lang-<code>.md` with your language's code, and change its lists. The headings say what each part is for, in the pack's language and in English. If you build one, a pull request is welcome.

A dash under **On our test** means no hand-checked text of our own yet (Brazilian Portuguese).

**On independent text** is the honest figure. It is the share of words colored right on published test sets the packs never saw (the Universal Dependencies treebanks: news, Wikipedia, blogs, some fiction), scored on 8,000 to 128,000 words a language, characters for Chinese and Japanese. Expect your own prose near it. Two conventions are counted as Word-Smith states them: particles stay uncolored (Japanese は, が, を), and a possessive is an article (Swedish *min*, *hans*).
