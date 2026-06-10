// Mongo model for the singleton BrandProfile doc. Uses lyzr-architect's
// createModel + lazy-getter pattern per CLAUDE.md §2.

import { initDB, createModel } from 'lyzr-architect'

let _model: any = null

export default async function getBrandProfileModel() {
  if (!_model) {
    await initDB()
    _model = createModel('BrandProfile', {
      companyName: { type: String, required: true },
      tagline: { type: String, default: '' },
      categoryFrame: { type: String, default: '' },
      customerQuest: { type: String, default: '' },
      promiseOfValue: { type: String, default: '' },
      callToAction: { type: String, default: '' },
      portfolioPillars: { type: [String], default: [] },
      partnerPillars: { type: [String], default: [] },
      keyPhrase: { type: String, default: '' },
      voicePersonaBody: { type: String, default: '' },
      shortFormSummary: { type: String, default: '' },
      brandBibleText: { type: String, default: '' },
      // Access control flags. Existing docs without these read as false via the default.
      locked: { type: Boolean, default: false },
      unlockGranted: { type: Boolean, default: false },
    })
  }
  return _model
}
