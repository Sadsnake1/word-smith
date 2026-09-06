# Syntax colouring and prose checks

[← Back to the README](../README.md)

**Syntax** gives nouns, verbs, adjectives, adverbs and conjunctions each their own colour, and can mute everything else so one class carries the sentence.

**Prose checks** mark seven things worth a second look: filler words, passive voice, doubled words, easily confused pairs, vague pronouns, sentence rhythm, and repeated uncommon words.

Both run entirely on your machine, and both are guesswork. A mark is a nudge, not a verdict. Both are English-only; in a right-to-left script they mark nothing rather than marking it wrongly.

## How the tagger works

A hand-written part-of-speech tagger. No API, no model, no bundled NLP library. Each visible line is tagged in three passes.

**Lexicon**: about 800 words that suffix rules can't be trusted with: determiners, pronouns, prepositions, auxiliaries, irregular verbs, and common words that would otherwise be mis-tagged.

**Suffix rules**: anything not in the lexicon is guessed from its ending, in order of reliability:

| Ending | Tag | |
|---|---|---|
| `-ly` | adverb | minus ~90 exceptions: `family`, `reply`, `early` |
| `-ing` `-ed` | verb | |
| `-est` | adjective | |
| `-tion` `-ment` `-ness` `-ity` `-ism` | noun | |
| `-ous` `-ful` `-less` `-ive` `-able` | adjective | |
| `-ize` `-ate` `-ify` | verb | |
| `-s` | noun or verb | depending on whether the singular is a known verb |

**Context**: the pass that fixes what the first two get wrong, using the words either side:

- After a determiner or preposition, a verb becomes a noun: *the **work***, *in **place***.
- An unknown word between a determiner and a noun is an adjective: *her **difficult** book*.
- After `to`, a candidate becomes an infinitive: *to **write***.
- A sentence-initial word followed by a determiner is an imperative: ***Check** the file*.

Results are drawn as CodeMirror decorations, so they render in the editor's own pipeline and never flicker while you type.

Articles and possessive determiners are deliberately left uncoloured, because highlighting adjectives shouldn't light up every `the`, `a` and `her`. Pronouns count as nouns, prepositions as conjunctions.

## What it gets wrong

**Accuracy** is roughly nine words in ten on ordinary prose, in my own testing, not benchmarked against a tagged corpus. It's weakest on dialogue-heavy fiction, sentence fragments, and unusual proper nouns. That's why it's a writing aid and not a grammar checker.

**Performance:** only the lines on screen are tagged, and code, frontmatter and maths are skipped. About 2ms per repaint on a 110,000-word note.
