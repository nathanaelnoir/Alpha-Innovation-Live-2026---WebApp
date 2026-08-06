import type { ActiveQuestion } from './types'

export type Language = 'en' | 'de' | 'it'

export const languages: Language[] = ['en', 'de', 'it']

export const copy = {
  en: {
    languageSelector: 'Choose language',
    privacyStatus: 'PSEUDONYMOUS / ACTIVE',
    loadingTitle: 'Loading the question…',
    loadingBody: 'This will only take a moment.',
    loadingIndicator: 'LOADING…',
    waitingEyebrow: 'Session status',
    waitingTitle: 'Waiting for the next session',
    waitingBody: 'Keep this page open. The next session will appear automatically.',
    checkAgain: 'Check again',
    connectionEyebrow: 'Connection interrupted',
    connectionTitle: 'Unable to load the survey',
    loadError: 'Check your connection and try again.',
    tryAgain: 'Try again',
    completionTitle: 'All responses submitted',
    completionBody: (title: string) => `Your responses for ${title} have been securely recorded.`,
    completionStatus: 'COMPLETED',
    completionOthers: 'OTHER RESPONSES',
    completionYours: 'YOUR RESPONSE',
    completionNote: 'Keep this page open until the organizer closes the session.',
    livePosition: 'LIVE POSITION',
    currentPosition: 'Current coordinate position',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    saving: 'Saving your response…',
    responseError: 'Your response could not be saved. Please try again.',
    sending: 'Sending…',
    retrySending: 'Try sending again',
    sendResponse: 'Send response',
    privacyNote: 'No name or contact details are collected.',
    identityFooter: 'PSEUDONYMOUS SESSION',
    signalFooter: 'NORMALIZED RESPONSE [0.000000—1.000000]',
    readyFooter: 'SYSTEM READY',
    coordinatePlane: {
      ariaLabel: 'Choose your response on the coordinate plane',
      selectedPoint: 'Selected point',
      noPoint: 'No point selected',
      tapHint: '[ TAP OR DRAG TO RESPOND ]',
      horizontal: 'horizontal',
      vertical: 'vertical',
    },
  },
  de: {
    languageSelector: 'Sprache auswählen',
    privacyStatus: 'PSEUDONYM / AKTIV',
    loadingTitle: 'Frage wird geladen…',
    loadingBody: 'Dies dauert nur einen Moment.',
    loadingIndicator: 'LADEN…',
    waitingEyebrow: 'Sitzungsstatus',
    waitingTitle: 'Warten auf die nächste Sitzung',
    waitingBody: 'Lassen Sie diese Seite geöffnet. Die nächste Sitzung erscheint automatisch.',
    checkAgain: 'Erneut prüfen',
    connectionEyebrow: 'Verbindung unterbrochen',
    connectionTitle: 'Umfrage konnte nicht geladen werden',
    loadError: 'Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
    tryAgain: 'Erneut versuchen',
    completionTitle: 'Alle Antworten übermittelt',
    completionBody: (title: string) => `Ihre Antworten für ${title} wurden sicher gespeichert.`,
    completionStatus: 'ABGESCHLOSSEN',
    completionOthers: 'ANDERE ANTWORTEN',
    completionYours: 'IHRE ANTWORT',
    completionNote: 'Lassen Sie diese Seite geöffnet, bis die Sitzung beendet wird.',
    livePosition: 'AKTUELLE POSITION',
    currentPosition: 'Aktuelle Position im Koordinatenfeld',
    horizontal: 'Horizontal',
    vertical: 'Vertikal',
    saving: 'Ihre Antwort wird gespeichert…',
    responseError: 'Ihre Antwort konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',
    sending: 'Wird gesendet…',
    retrySending: 'Erneut senden',
    sendResponse: 'Antwort senden',
    privacyNote: 'Es werden weder Namen noch Kontaktdaten erfasst.',
    identityFooter: 'PSEUDONYME SITZUNG',
    signalFooter: 'NORMALISIERTE ANTWORT [0.000000—1.000000]',
    readyFooter: 'SYSTEM BEREIT',
    coordinatePlane: {
      ariaLabel: 'Antwort im Koordinatenfeld auswählen',
      selectedPoint: 'Ausgewählter Punkt',
      noPoint: 'Kein Punkt ausgewählt',
      tapHint: '[ TIPPEN ODER ZIEHEN ]',
      horizontal: 'horizontal',
      vertical: 'vertikal',
    },
  },
  it: {
    languageSelector: 'Seleziona la lingua',
    privacyStatus: 'PSEUDONIMO / ATTIVO',
    loadingTitle: 'Caricamento della domanda…',
    loadingBody: 'Ci vorrà solo un momento.',
    loadingIndicator: 'CARICAMENTO…',
    waitingEyebrow: 'Stato della sessione',
    waitingTitle: 'In attesa della prossima sessione',
    waitingBody: 'Mantenga aperta questa pagina. La prossima sessione apparirà automaticamente.',
    checkAgain: 'Controlla di nuovo',
    connectionEyebrow: 'Connessione interrotta',
    connectionTitle: 'Impossibile caricare il sondaggio',
    loadError: 'Controlli la connessione e riprovi.',
    tryAgain: 'Riprova',
    completionTitle: 'Tutte le risposte sono state inviate',
    completionBody: (title: string) => `Le sue risposte per ${title} sono state registrate in modo sicuro.`,
    completionStatus: 'COMPLETATO',
    completionOthers: 'ALTRE RISPOSTE',
    completionYours: 'LA SUA RISPOSTA',
    completionNote: 'Mantenga aperta questa pagina finché la sessione non viene chiusa.',
    livePosition: 'POSIZIONE ATTUALE',
    currentPosition: 'Posizione attuale nel piano cartesiano',
    horizontal: 'Orizzontale',
    vertical: 'Verticale',
    saving: 'Salvataggio della risposta…',
    responseError: 'Non è stato possibile salvare la risposta. Riprovi.',
    sending: 'Invio in corso…',
    retrySending: 'Invia di nuovo',
    sendResponse: 'Invia risposta',
    privacyNote: 'Non vengono raccolti nomi o dati di contatto.',
    identityFooter: 'SESSIONE PSEUDONIMA',
    signalFooter: 'RISPOSTA NORMALIZZATA [0.000000—1.000000]',
    readyFooter: 'SISTEMA PRONTO',
    coordinatePlane: {
      ariaLabel: 'Seleziona la risposta sul piano cartesiano',
      selectedPoint: 'Punto selezionato',
      noPoint: 'Nessun punto selezionato',
      tapHint: '[ TOCCA O TRASCINA ]',
      horizontal: 'orizzontale',
      vertical: 'verticale',
    },
  },
} as const

const LANGUAGE_STORAGE_KEY = 'conference-survey-language-v1'

export function loadLanguage(): Language {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return languages.includes(stored as Language) ? (stored as Language) : 'en'
}

export function saveLanguage(language: Language): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
}

export function localizeQuestion(question: ActiveQuestion, language: Language) {
  if (language === 'de') {
    return {
      prompt: question.prompt_de ?? question.prompt,
      xAxisLabel: question.x_axis_label_de ?? question.x_axis_label,
      yAxisLabel: question.y_axis_label_de ?? question.y_axis_label,
    }
  }
  if (language === 'it') {
    return {
      prompt: question.prompt_it ?? question.prompt,
      xAxisLabel: question.x_axis_label_it ?? question.x_axis_label,
      yAxisLabel: question.y_axis_label_it ?? question.y_axis_label,
    }
  }
  return {
    prompt: question.prompt,
    xAxisLabel: question.x_axis_label,
    yAxisLabel: question.y_axis_label,
  }
}
