import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend from 'i18next-http-backend'

void i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'lt', 'ru'],
    defaultNS: 'common',
    ns: [
      'common',
      'auth',
      'webinars',
      'landing',
      'funnels',
      'public',
      'recordings',
      'billing',
      'ai',
    ],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  })
  .then(() => {
    // #region agent log
    fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
      body: JSON.stringify({
        sessionId: '85756a',
        id: 'log_i18n_init',
        runId: 'initial',
        hypothesisId: 'C',
        location: 'src/i18n/config.ts:6',
        message: 'i18n initialized',
        data: { language: i18n.language, loadedLanguages: i18n.languages },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  })
  .catch((err) => {
    // #region agent log
    fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
      body: JSON.stringify({
        sessionId: '85756a',
        id: 'log_i18n_error',
        runId: 'initial',
        hypothesisId: 'C',
        location: 'src/i18n/config.ts:6',
        message: 'i18n init failed',
        data: { error: String(err) },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  })

export default i18n
