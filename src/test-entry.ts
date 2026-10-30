// THE TESTS' ENTRY: the plugin class with the module-level names the tests
// reach as statics. Bundled to ws-dev/main.js by `node esbuild.config.mjs
// test`; never shipped. `export default`, and the test build's footer makes
// it `module.exports` itself (`export =` is not an ES module; esbuild would
// refuse it).
import WordSmith, { wsWireDocument, wsWireVault, wsWireWorkspace, wsOnLayoutReady, wsWatchTheme, wsRegisterCommands } from './plugin/plugin';
import { WordSmithSettingTab } from './plugin/settings-tab';
import { WsWelcomeModal, wsWhatsNewInto, wsWelcomeText } from './plugin/welcome';
import { WS_WHATS_NEW } from './core/whats-new';
import { wsCompat, wsCompatText, WS_INTERNALS } from './core/obsidian-internals';
import { wsOrgTicksMake } from './organizer/organizer-ticks';
import { wsOrgRowsMake } from './organizer/organizer-rows';
import { wsOrgReadingsMake } from './organizer/organizer-readings';
import {
	wsCountFootnotes, wsOrgAgg, wsOrgDistinct, wsOrgDropBefore, wsOrgFolderWords, wsOrgIndex, wsOrgPathsUnder, wsOrgPut,
	wsOrgRemove, wsOrgRename, wsOrgStale, wsUnderIndex, wsUnderRow,
} from './organizer/org-index';
import {
	BAR_DIRECTIVE_BG, BAR_DIRECTIVE_TEXT, BAR_KEYS, BAR_KEYS_INERT, BAR_KEYS_LIVE, BAR_SHARE_VERSION,
	WS_AXIS_MED_MULT, WS_AXIS_PCT, wsAxisBound, wsQuantile,
	barCodeToPreset, barPresetToCode, barPresetWithDefaults, barShareFields,
	DEFAULT_BAR_PRESETS, DEFAULT_SETTINGS, HISTORY_HEAT, mixColors, parseColorRGB, pickBar,
	PL_BG_COUNT, PL_THEME_BGS, readBarDirective,
	WS_FLAG_SHAPES, WS_NARROW_FLIPS, WS_STATE_IDS, WS_STORM_PASSES,
	wsCatch, wsCatchReset, wsCatchSeen, wsTimedRead, wsSlowReads, wsSlowReadsReset, WS_SLOW_READS_KEPT, wsColPrefCh, wsCtxScope, wsDeepestLevel, wsDemoteHeadings, wsHeadNumbers, wsNoteHeadings, wsPageOfPart, WS_HEAD_TOKENS, wsHeadFill, wsContactLines, wsParaSpacing, wsDropHeadings, wsNumbered,
	wsExportRoot, wsFileHeadLevel, wsFitCols, wsFlagSvg, wsForDisk, wsGuard, wsGuardReport,
	wsGuardReset, wsGuardSeen, wsGuardTell, wsLabelCh, wsLineOfSnippet, wsPlainLine, maskMarkup, maskForCounting, wsTailMatch, WsMenuView, wsNarrowDecide,
	wsNarrowState, WsOutlinerView, wsPassState, wsPassStorm, wsRepairSettings, wsSecHeadLevel,
	wsSessionLens, wsSessionNew, wsShareText, wsStatusLabel, wsStatusNext, wsTaskSay, wsTocSteps,
	wsEpubCheck,
	wsPageStarts, WS_TARGET_MAX, wsIsRtl, wsRelPath, wsPageNumAt, wsTocTitle, wsHdrFtrXml, wsPageBoxesCss, wsTocPagesMeasure, wsTocPagesApply, wsBuildDocx, wsBuildEpub, wsEpubUuid, wsDataUrlBytes, wsFormatHasPages, wsStylesXml, wsBlocksFromMarkdown, wsInlineRuns, wsParseImageRef, wsSplitFigures, wsFigureHtml, wsHtmlBlocks, wsFigureSources, WS_INLINE_MATH, wsFootnoteDefs, wsRunsHtml, wsPara, wsPaperOf, wsTwipIn, WS_PAPERS,
	wsLineTwips, wsJoinMark, wsZip, wsUtf8, wsCrc32, wsXml, wsTable, wsHeaderXml, wsAnchorId, wsRoundWords,
	wsFontMatches, wsProbeInstalledFonts, wsUniqueFonts, WS_SAFE_FONTS, wsTitleWords, findDialogue, wsDialoguePairs, BAR_THEMES,
	tokenizeLine, tagTokens, countSyllables, splitSentences, WS_EXPORT_PREVIEW_AUTO_BYTES, wsSentenceStart, posBucket,
	wsCursorMarkSvg, wsHueRotate, wsWheelStep, wsIconPick, wsDayKey, wsDayOf, wsWorkDaysLeft, wsGoalPlan,
	POS_LEX, FILLER_STRONG, WS_CLICHES_EN, FILLER_SOFT, FILLER_PHRASES, MISUSED_ALWAYS, MISUSED_PHRASES, findMisused,
	wsMaskCitations, wsCiteKeyText, wsEpubCss, wsFootNotes, wsColumnOf, wsTocPagesFill,
} from './core/preamble';
import { wsParsePack, wsPackCode, WS_PACK_FORMAT, WS_PACK_PARTS, wsIsPackPath, wsPackQuotes, wsPackSpaces, wsPackCovers, wsPackPick, WS_PACKS_URL, WS_PACK_FORMULAS } from './core/language';
import { WS_RULES_EN } from './core/rules-en';
import { WS_PAPER_TEXTURES, WS_INK_EFFECTS, WS_PAPER_INK_VARS, WS_INK_FULL, wsPaperCss, wsInkCss } from './core/paper-ink';
import { wsPackEngine, wsEnglishPackEngine, WS_ENGLISH_ENGINE, wsPhraseRe, wsPhraseSpans, wsPhraseSpansFor, wsPhraseFold, wsPackLearned, wsPackRules, wsApplyRules, wsEnglishTagWith, wsEaseToGrade, wsGradeOf, wsPackGradeName, wsPackGradeFrom } from './core/lang-engine';
import { wsCiteSearch, wsMakeCiteSuggest, WS_CITE_TRIGGER } from './editor/cite-suggest';
import { wsT, wsTq, wsTIn, wsNumIn, wsUiSet, wsUiPick, wsUiLang, wsUiMissed, wsUiEcho, wsUiEchoOn, wsUiJoin, wsUiDate, wsUiLocale } from './core/ui-text';
import { WS_LOCALES } from './core/ui-locales';
import { wsCiteEntryText } from './core/citations';
import { wsCiteSections } from './core/citations';
import { wsParseBibtex, wsParseCslJson, wsParseLibrary, wsBibNames, wsTexText, wsFindCitations, wsCiter, wsCiteThin, wsCiteThinText, wsCiteTemplate, WS_CITE_STYLES, WS_CITE_TOKENS, WS_CITE_CUSTOM_DEFAULT, WS_CITE_PRESET_TOKENS, WS_CITE_SAMPLES, wsCiteTermsFor, WS_CITE_TERMS, wsCiteMissing } from './core/citations';

export default Object.assign(WordSmith, {
	// the 47 the slices exported
	wsStatusNext, wsStatusLabel, wsFlagSvg, WS_FLAG_SHAPES, wsCountFootnotes, WsOutlinerView,
	wsRepairSettings, wsLineOfSnippet, wsPlainLine, maskMarkup, maskForCounting, wsTailMatch, wsCtxScope, HISTORY_HEAT, WS_STATE_IDS, wsLabelCh,
	wsNarrowDecide, wsPassStorm, wsGuard, wsGuardReset, wsGuardSeen, wsGuardTell, wsGuardReport,
	wsCatch, wsCatchSeen, wsCatchReset, wsTimedRead, wsSlowReads, wsSlowReadsReset, WS_SLOW_READS_KEPT, wsCompat, wsCompatText, WS_INTERNALS, wsPassState,
	WS_STORM_PASSES, wsNarrowState, WS_NARROW_FLIPS, wsColPrefCh, wsFitCols, wsExportRoot,
	WS_HEAD_TOKENS, wsHeadFill, wsContactLines, wsParaSpacing, wsDropHeadings, wsNumbered,
	wsDemoteHeadings, wsHeadNumbers, wsNoteHeadings, wsPageOfPart, wsFileHeadLevel, wsSecHeadLevel, wsDeepestLevel, wsTocSteps, WsMenuView,
	wsSessionLens, wsTaskSay, DEFAULT_BAR_PRESETS, wsShareText, barCodeToPreset,
	DEFAULT_SETTINGS, wsSessionNew, wsForDisk,
	// the welcome and About's notes (A743)
	WsWelcomeModal, wsWhatsNewInto, wsWelcomeText, WS_WHATS_NEW,
	// the sixteen the bar probes reached through a `__test` line
	WordSmithSettingTab, PL_THEME_BGS, PL_BG_COUNT, readBarDirective, BAR_DIRECTIVE_BG,
	BAR_DIRECTIVE_TEXT, BAR_KEYS, BAR_KEYS_INERT, BAR_KEYS_LIVE, barPresetToCode,
	barPresetWithDefaults, pickBar, barShareFields, BAR_SHARE_VERSION, mixColors, parseColorRGB,
	// the fifteen the suites reached by rewriting the export line
	wsAxisBound, wsQuantile, WS_AXIS_PCT, WS_AXIS_MED_MULT, wsOrgDropBefore, wsOrgIndex, wsOrgPut,
	wsOrgRemove, wsOrgRename, wsOrgStale, wsOrgPathsUnder, wsOrgAgg, wsOrgDistinct, wsUnderIndex,
	wsUnderRow, wsOrgFolderWords,
	// the twenty-three the Word export audit and probe evaluated out of a slice of the text
	wsEpubCheck,
	wsPageStarts, WS_TARGET_MAX, wsIsRtl, wsRelPath, wsPageNumAt, wsTocTitle, wsHdrFtrXml, wsPageBoxesCss, wsTocPagesMeasure, wsTocPagesApply, wsBuildDocx, wsBuildEpub, wsEpubUuid, wsDataUrlBytes, wsFormatHasPages, wsStylesXml, wsBlocksFromMarkdown, wsInlineRuns, wsParseImageRef, wsSplitFigures, wsFigureHtml, wsHtmlBlocks, wsFigureSources, WS_INLINE_MATH, wsFootnoteDefs, wsRunsHtml, wsPara, wsPaperOf, wsTwipIn, WS_PAPERS,
	wsLineTwips, wsJoinMark, wsZip, wsUtf8, wsCrc32, wsXml, wsTable, wsHeaderXml, wsAnchorId, wsRoundWords,
	wsFontMatches, wsProbeInstalledFonts, wsUniqueFonts, WS_SAFE_FONTS, wsTitleWords,
	// the dialogue finder the menu probe evaluated out of the text, the bar themes the theme probe did
	findDialogue, wsDialoguePairs, BAR_THEMES,
	// paper and ink (GitHub #105, A901)
	WS_PAPER_TEXTURES, WS_INK_EFFECTS, WS_PAPER_INK_VARS, WS_INK_FULL, wsPaperCss, wsInkCss,
	// the tagger's own words, for the accents suite (A482)
	tokenizeLine, tagTokens, countSyllables, splitSentences, posBucket,
	// the language packs' reader (A571)
	wsParsePack, wsPackCode, WS_PACK_FORMAT, WS_PACK_PARTS, wsIsPackPath, wsPackQuotes, wsPackSpaces, wsPackCovers, wsPackPick, WS_PACKS_URL, WS_PACK_FORMULAS,
	wsPackEngine, WS_ENGLISH_ENGINE, WS_RULES_EN, wsPhraseRe, wsPhraseSpans, wsPhraseSpansFor, wsPhraseFold, wsPackLearned, wsPackRules, wsApplyRules, wsEnglishTagWith, wsEaseToGrade, wsGradeOf, wsPackGradeName, wsPackGradeFrom,
	// English's own lists and its pack engine (A691): what ws-dev/gen-english-packs.js writes the English packs from
	// the settings in Obsidian's language (A692)
	wsT, wsTq, wsTIn, wsNumIn, wsUiSet, wsUiPick, wsUiLang, wsUiMissed, wsUiEcho, wsUiEchoOn, wsUiJoin, wsUiDate, wsUiLocale, WS_LOCALES,
	wsEnglishPackEngine, POS_LEX, FILLER_STRONG, WS_CLICHES_EN, FILLER_SOFT, FILLER_PHRASES, MISUSED_ALWAYS, MISUSED_PHRASES, findMisused,
	// citations (A572)
	wsCiteSearch, wsMakeCiteSuggest, WS_CITE_TRIGGER, wsCiteEntryText,
	wsCiteSections, wsCiteMissing, wsMaskCitations, wsCiteKeyText, wsEpubCss, wsFootNotes, wsColumnOf, wsTocPagesFill,
	wsParseBibtex, wsParseCslJson, wsParseLibrary, wsBibNames, wsTexText, wsFindCitations, wsCiter, wsCiteThin, wsCiteThinText, wsCiteTemplate, WS_CITE_STYLES, WS_CITE_TOKENS, WS_CITE_CUSTOM_DEFAULT, WS_CITE_PRESET_TOKENS, WS_CITE_SAMPLES, wsCiteTermsFor, WS_CITE_TERMS,
	// onload's phases, driven by the phases suite (A488)
	wsWireDocument, wsWireVault, wsWireWorkspace, wsOnLayoutReady, wsWatchTheme, wsRegisterCommands,
	// the export's tick memory and the preview's size, driven by the big-vault suite (A516)
	wsOrgTicksMake, WS_EXPORT_PREVIEW_AUTO_BYTES,
	// the Organizer's walk, driven by the own-folder suite (A733)
	wsOrgRowsMake, wsOrgReadingsMake,
	// the sentence rule, for the capitalize suite (A519)
	wsSentenceStart,
	// a Cursor-Smith preset drawn beside its name in the Cursors lists
	wsCursorMarkSvg,
	// the colour a hue-rotate() filter turns, for a token following Cursor-Smith’s flip
	wsHueRotate,
	// a wheel's zoom steps, a trackpad's small deltas added up (the Mac audit for issue #56)
	wsWheelStep,
	// the first icon name this Obsidian bundles (A681)
	wsIconPick,
	// goals with a date (A700)
	wsDayKey, wsDayOf, wsWorkDaysLeft, wsGoalPlan,
});
