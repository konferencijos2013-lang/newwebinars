import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import Backend from 'i18next-http-backend'
import { currentLocale } from '@/i18n/localePath'

void i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    lng: currentLocale(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'lt', 'ru'],
    defaultNS: 'common',
    ns: [
      'common',
      'auth',
      'webinars',
      'landing',
      'legal',
      'funnels',
      'public',
      'recordings',
      'billing',
      'ai',
      'mail',
    ],
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  })
  .then(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language
  })
  .catch(() => {})

export default i18n
