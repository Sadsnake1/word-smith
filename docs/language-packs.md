# Language packs

[← Back to the README](../README.md)

A language pack is one note that teaches Word-Smith a language: its word colors, its prose checks, where its sentences end and its reading grade. English is built in, and comes as a pack too so you can see and extend its words.

## Install a pack

1. Download your language from the table below.
2. Put it in the **Word-Smith** folder in your Vault. Keep its name (`ws-lang-de.md`): that is how Word-Smith finds it.
3. Pick it in **Settings → Word-Smith → Prose → Language**. The **{lang}** token and the menu's Language row switch between the languages you tick there.

A pack is a plain note. If a word gets the wrong color, add it under the right heading and it applies as you save.

Found a bad translation, or something the syntax and prose checks get wrong? Post it in the [languages issue](https://github.com/Sadsnake1/word-smith/issues/59), so everyone gets the fix.

## The packs

| Language | Pack | Reading grade | Accuracy |
|----------|------|---------------|----------|
| English | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-en.md) · [read](../packs/ws-lang-en.md) | Flesch–Kincaid | 87–88% |
| Dansk (Danish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-da.md) · [read](../packs/ws-lang-da.md) | LIX | 85% |
| Deutsch (German) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-de.md) · [read](../packs/ws-lang-de.md) | Wiener Sachtextformel | 91% |
| Español (Spanish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-es.md) · [read](../packs/ws-lang-es.md) | Fernández-Huerta | 89% |
| Français (French) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-fr.md) · [read](../packs/ws-lang-fr.md) | Kandel and Moles | 90% |
| Italiano (Italian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-it.md) · [read](../packs/ws-lang-it.md) | Gulpease | 89% |
| 日本語 (Japanese) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ja.md) · [read](../packs/ws-lang-ja.md) | Tateisi | 81–85% |
| 한국어 (Korean) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ko.md) · [read](../packs/ws-lang-ko.md) | LIX, for now | 79–81% |
| Nederlands (Dutch) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-nl.md) · [read](../packs/ws-lang-nl.md) | Douma | 88–89% |
| Norsk bokmål (Norwegian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-no.md) · [read](../packs/ws-lang-no.md) | LIX | 88% |
| Polski (Polish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-pl.md) · [read](../packs/ws-lang-pl.md) | FOG-PL | 87% |
| Português (Portuguese) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-pt.md) · [read](../packs/ws-lang-pt.md) | Martins | 87–89% |
| Português (Brasil) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-pt-BR.md) · [read](../packs/ws-lang-pt-BR.md) | Martins, Brazilian | 88–90% |
| Română (Romanian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ro.md) · [read](../packs/ws-lang-ro.md) | Flesch, for now | 88% |
| Русский (Russian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-ru.md) · [read](../packs/ws-lang-ru.md) | Oborneva | 82–87% |
| Svenska (Swedish) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-sv.md) · [read](../packs/ws-lang-sv.md) | LIX | 84–87% |
| Українська (Ukrainian) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-uk.md) · [read](../packs/ws-lang-uk.md) | Flesch, for now | 83% |
| 简体中文 (Chinese) | [download](https://github.com/Sadsnake1/word-smith/releases/latest/download/ws-lang-zh-Hans.md) · [read](../packs/ws-lang-zh-Hans.md) | Sentence length and rare characters | 73% |

**Accuracy** is the share of words that get the right color on published text the packs never saw (the Universal Dependencies test sets). "For now" means the language has no settled reading-grade formula yet.

## Your language is missing?

Copy the closest pack, rename it `ws-lang-<code>.md` and change its lists. If you build one, a pull request is welcome.
