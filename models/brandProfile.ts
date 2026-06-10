// Mongo model for the singleton BrandProfile doc. Uses lyzr-architect's
// createModel + lazy-getter pattern per CLAUDE.md §2.
//
// Admin variant (skipRLS) is needed by the unlock-request approve route which
// must update a different user's profile.

import { initDB, createModel } from 'lyzr-architect'

const SCHEMA = {
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
}

let _model: any = null
let _adminModel: any = null

export default async function getBrandProfileModel(opts?: { admin?: boolean }) {
  if (opts?.admin) {
    if (!_adminModel) {
      await initDB()
      _adminModel = createModel('BrandProfileAdmin', SCHEMA, {
        collection: 'brandprofiles',
        skipRLS: true,
      } as any)
    }
    return _adminModel
  }
  if (!_model) {
    await initDB()
    _model = createModel('BrandProfile', SCHEMA)
  }
  return _model
}
