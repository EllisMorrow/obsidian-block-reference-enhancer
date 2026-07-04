import { EN_MESSAGES, type TranslationKey, type TranslationParams } from './en';
import { ZH_CN_MESSAGES } from './zh-cn';

export type SupportedLocale = 'en' | 'zh-cn';

let activeLocale: SupportedLocale = 'en';

export function resolveSupportedLocale(language: string | null | undefined): SupportedLocale {
	const normalized = (language ?? '').trim().toLowerCase();
	return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh-cn' : 'en';
}

export function initializeI18n(language: string | null | undefined): SupportedLocale {
	activeLocale = resolveSupportedLocale(language);
	return activeLocale;
}

export function getActiveLocale(): SupportedLocale {
	return activeLocale;
}

export function t(key: TranslationKey, params: TranslationParams = {}): string {
	const dictionary = activeLocale === 'zh-cn' ? ZH_CN_MESSAGES : EN_MESSAGES;
	const template = dictionary[key] ?? EN_MESSAGES[key];
	return template.replace(/\{([A-Za-z0-9_]+)\}/gu, (match, name: string) => {
		const value = params[name];
		return value === undefined ? match : String(value);
	});
}

export { EN_MESSAGES, ZH_CN_MESSAGES };
export type { TranslationKey, TranslationParams };
