// ── THE SETTINGS' TRANSLATIONS, BUILT INTO main.js (A692) ─────────────────────────
//
// One JSON file a language in ts/locales, English line to translation (English is the key: ui-text.ts). esbuild
// puts them in main.js, as the writer asked ("we ship translation in main.js"); ws-dev/ui-lines.js lists what each
// one lacks. A language is a file here and a line below.

import de from '../../locales/de.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import it from '../../locales/it.json';
import pt from '../../locales/pt.json';
import pt_BR from '../../locales/pt-BR.json';
import ro from '../../locales/ro.json';
import nl from '../../locales/nl.json';
import pl from '../../locales/pl.json';
import sv from '../../locales/sv.json';
import da from '../../locales/da.json';
import no from '../../locales/no.json';
import ja from '../../locales/ja.json';
import zh_Hans from '../../locales/zh-Hans.json';
import ru from '../../locales/ru.json';
import uk from '../../locales/uk.json';
import ko from '../../locales/ko.json';
// THREE MORE (A767, the writer: "We'll do Turkish, traditional chinese, indonesian.")
import tr from '../../locales/tr.json';
import id from '../../locales/id.json';
import zh_Hant from '../../locales/zh-Hant.json';
// TWO MORE, RIGHT TO LEFT (A846, the writer: "A new user wants Persian lang pack and some rtl fixes … Including Arabic";
// Obsidian has no Hindi interface, so Hindi has its pack and no table)
import ar from '../../locales/ar.json';
import fa from '../../locales/fa.json';

export const WS_LOCALES: Record<string, Record<string, string>> = {
	de: de,
	es: es,
	fr: fr,
	it: it,
	pt: pt,
	'pt-BR': pt_BR,
	ro: ro,
	nl: nl,
	pl: pl,
	sv: sv,
	da: da,
	no: no,
	ja: ja,
	'zh-Hans': zh_Hans,
	ru: ru,
	uk: uk,
	ko: ko,
	tr: tr,
	id: id,
	'zh-Hant': zh_Hant,
	ar: ar,
	fa: fa,
};
