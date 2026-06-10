// Mongo model for one user's request to unlock their BrandProfile for re-configuration.
// Lifecycle: pending → approved → consumed | denied. RLS auto-scopes find/update by
// owner_user_id (same field BrandProfile uses), so users only see their own requests.
//
// Admin routes need to read/update across users, so we also export an admin
// variant of the same collection with `skipRLS: true` — bypasses the RLS plugin's
// auto-scoping. The two models share the same collection in MongoDB.

import { initDB, createModel } from 'lyzr-architect'

export type BrandUnlockRequestStatus = 'pending' | 'approved' | 'denied' | 'consumed'

const SCHEMA = {
  requesterEmail: { type: String, required: true },
  reason: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'consumed'],
    default: 'pending',
    required: true,
  },
  denialReason: { type: String, default: '' },
  decidedBy: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
}

let _model: any = null
let _adminModel: any = null

export default async function getBrandUnlockRequestModel(opts?: { admin?: boolean }) {
  if (opts?.admin) {
    if (!_adminModel) {
      await initDB()
      _adminModel = createModel('BrandUnlockRequestAdmin', SCHEMA, {
        collection: 'brandunlockrequests',
        timestamps: { createdAt: true, updatedAt: false },
        skipRLS: true,
      } as any)
    }
    return _adminModel
  }
  if (!_model) {
    await initDB()
    _model = createModel('BrandUnlockRequest', SCHEMA, {
      timestamps: { createdAt: true, updatedAt: false },
    })
  }
  return _model
}
