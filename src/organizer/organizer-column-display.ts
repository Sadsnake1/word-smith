// Word-Smith — organizer-column-display: the column's display setting choices,
// shared by the settings page and the header context menus.

import { wsT } from '../core/ui-text';

export const ORG_COLUMN_DISPLAY_CHOICES = {
	target: {
		name: wsT('Target column shows'),
		desc: wsT('Words and target, or a percentage.'),
		key: 'orgTargetShow',
		options: [
			{ value: 'ratio', label: wsT('Words and target (2,145/5,000)') },
			{ value: 'percent', label: wsT('Percentage (43%)') }
		]
	},
	deadline: {
		name: wsT('Deadline column shows'),
		desc: wsT('The date and the working days left, or one of them. Both are on hover.'),
		key: 'orgDeadlineCell',
		options: [
			{ value: 'both', label: wsT('Both (8d left · 20 Oct 2026)') },
			{ value: 'days', label: wsT('Days left (8d left)') },
			{ value: 'date', label: wsT('The date (20 Oct 2026)') }
		]
	},
	include: {
		name: wsT('Include column shows'),
		desc: wsT('Use check and X icons or text.'),
		key: 'orgIncludeDisplay',
		options: [
			{ value: 'icons', label: wsT('Icons') },
			{ value: 'text', label: wsT('Text') }
		]
	}
} as const;

export const orgColumnDisplayOptions = (options: readonly { value: string; label: string }[]) =>
	Object.fromEntries(options.map(({ value, label }) => [value, label]));
