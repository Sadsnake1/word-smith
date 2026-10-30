# Syntax coloring and prose checks

[← Back to the README](../README.md)

**Syntax** gives nouns, verbs, adjectives, adverbs and conjunctions each their own color, the way a code editor shows you structure. Turn on **Pronouns** and *I, she, they, this, which* get a color of their own; off, they count with the nouns. It can mute everything else so one class carries the sentence. Too many adverbs reads as a rash.

**Prose checks** mark nine things worth a second look: filler words, passive voice, doubled words, easily confused pairs, vague pronouns, clichés, dialogue, sentence rhythm, and repeated uncommon words. **Clichés** are stock phrases like *at the end of the day*, *love at first sight* or *cold as ice*: sayings, idioms, similes, what fiction overuses, crutch phrases and stock lines of dialogue, about 500 in English and 200 in every other language pack. A phrase is found in the forms you write it (*bit the bullet*, *a chill ran down his spine*, *easy come, easy go*). Each check has its own switch and its own color. Marks are an underline by default, or a highlight, or colored text.

Both run on your machine. Both are guesswork. A mark is a nudge, not a verdict. English is built in; other languages come as [language packs](language-packs.md), one note each, and a language without one is marked nothing rather than marked wrongly.

## Dialogue

**Dialogue** colors what your characters say: everything inside quotes (straight, curly, « », „ “ and your language's own marks), and the speech after a dialogue dash in languages that write one. Apostrophes are not speech: girls', don't, 'em, 'til, '90s and rock 'n' roll stay plain, and so do Dutch 's and 't. A double or curly quote left open runs to the end of its line and no further.

Turn on **More speech marks** and italics and angle brackets count too, the way fantasy writes thoughts and telepathy: `*thought*`, `_thought_`, `‹whisper›`, `<mind speech>`. Bold, a list's star, a snake_case name and HTML tags are left alone.

## How the tagger works

A hand-written part-of-speech tagger. No API, no model, no bundled NLP library. Three passes over each visible line.

**Lexicon.** About a thousand words that suffix rules can't be trusted with: determiners, pronouns, prepositions, auxiliaries, irregular verbs, and common words that would otherwise be mis-tagged.

**Suffix rules.** Anything else is guessed from its ending. `-ly` is an adverb (minus the exceptions: family, reply, early). `-ing` and `-ed` are verbs. `-tion`, `-ment`, `-ness` are nouns. `-ous`, `-ful`, `-less` are adjectives. And so on.

**Context.** The pass that fixes what the first two got wrong, using the words either side. After a determiner, a verb becomes a noun (*the work*). An unknown word between a determiner and a noun is an adjective (*her difficult book*). After *to*, it's an infinitive. A *this* or *which* standing alone is a pronoun (*this is*, *which works*); before a noun it points (*this house*).

Results are drawn as editor decorations, so they never flicker while you type. On a desktop every line is colored as you type. On a phone or a tablet, redrawing the text under the caret makes the keyboard switch to capitals, so the line you're writing keeps its colors while you type and catches up when you move to another line. Only the lines on screen are tagged, and code, frontmatter and maths are skipped.

## What it gets wrong

Roughly nine words in ten: English scores 90% on the Universal Dependencies test sets, and every language's own figure is on the [language packs](language-packs.md) page. Weakest on dialogue-heavy fiction, fragments, and unusual proper nouns. That's why it's a writing aid and not a grammar checker.
