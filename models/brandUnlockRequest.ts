// Mongo model for one user's request to unlock their BrandProfile for re-configuration.
// Lifecycle: pending → approved → consumed | denied. RLS auto-scopes find/update by
// owner_user_id (same field BrandProfile uses), so users only see their own requests.
// Admin routes bypass this via `runWithContext({ isAdmin: true })`.

import { initDB, createModel } from 'lyzr-architect'

export type BrandUnlockRequestStatus = 'pending' | 'approved' | 'denied' | 'consumed'

let _model: any = null

export default async function getBrandUnlockRequestModel() {
  if (!_model) {
    await initDB()
    _model = createModel('BrandUnlockRequest', {
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
    }, {
      timestamps: { createdAt: true, updatedAt: false },
    })
  }
  return _model
}
