# Syntax coloring and prose checks

[← Back to the README](../README.md)

**Syntax** gives nouns, verbs, adjectives, adverbs and conjunctions each their own color, the way a code editor shows you structure. It can mute everything else so one class carries the sentence. Too many adverbs reads as a rash.

**Prose checks** mark eight things worth a second look: filler words, passive voice, doubled words, easily confused pairs, vague pronouns, dialogue, sentence rhythm, and repeated uncommon words. Each check has its own switch and its own color. Marks are an underline by default, or a highlight, or colored text.

Both run on your machine. Both are guesswork. A mark is a nudge, not a verdict. English is built in; other languages come as [language packs](language-packs.md), one note each, and a language without one is marked nothing rather than marked wrongly.

## Dialogue

**Dialogue** colors what your characters say: everything inside quotes (straight, curly, « », „ “ and your language's own marks), and the speech after a dialogue dash in languages that write one. Apostrophes are not speech: girls', don't, 'em, 'til, '90s and rock 'n' roll stay plain, and so do Dutch 's and 't. A double or curly quote left open runs to the end of its line and no further.

Turn on **More speech marks** and italics and angle brackets count too, the way fantasy writes thoughts and telepathy: `*thought*`, `_thought_`, `‹whisper›`, `<mind speech>`. Bold, a list's star, a snake_case name and HTML tags are left alone.

## How the tagger works

A hand-written part-of-speech tagger. No API, no model, no bundled NLP library. Three passes over each visible line.

**Lexicon.** About a thousand words that suffix rules can't be trusted with: determiners, pronouns, prepositions, auxiliaries, irregular verbs, and common words that would otherwise be mis-tagged.

**Suffix rules.** Anything else is guessed from its ending. `-ly` is an adverb (minus the exceptions: family, reply, early). `-ing` and `-ed` are verbs. `-tion`, `-ment`, `-ness` are nouns. `-ous`, `-ful`, `-less` are adjectives. And so on.

**Context.** The pass that fixes what the first two got wrong, using the words either side. After a determiner, a verb becomes a noun (*the work*). An unknown word between a determiner and a noun is an adjective (*her difficult book*). After *to*, it's an infinitive.

Results are drawn as editor decorations, so they never flicker while you type. The line you're writing in keeps its colors while you type, and catches up when you move to another line. On iPhone and iPad, redrawing the text under the caret makes the keyboard switch to capitals, so nothing there is redrawn while you type. Only the lines on screen are tagged, and code, frontmatter and maths are skipped.

## What it gets wrong

Roughly nine words in ten on ordinary prose, in my own testing, not benchmarked against a tagged corpus. Weakest on dialogue-heavy fiction, fragments, and unusual proper nouns. That's why it's a writing aid and not a grammar checker.
