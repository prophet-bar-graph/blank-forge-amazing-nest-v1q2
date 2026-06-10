// Admin-side raw MongoDB collection accessors. Bypasses Mongoose entirely
// (and therefore lyzr-architect's RLS plugin) so admin routes can read/write
// across the per-user owner_user_id boundary.
//
// Background: lyzr-architect installs its RLS plugin globally via
// `mongoose.plugin(rlsPlugin)`. The plugin reads only `ctx.userId` from the
// async-local context; there is no `isAdmin` escape hatch and the schema-level
// `skipRLS: true` option is not honored (Mongoose's `mongoose.plugin(fn)` does
// not pass schema-construction options through). Operations on the raw
// MongoDB Collection skip Mongoose middleware entirely, which is the only
// working way to read across the owner_user_id boundary in this codebase.

import mongoose from 'mongoose'
import getBrandUnlockRequestModel from '@/models/brandUnlockRequest'
import getBrandProfileModel from '@/models/brandProfile'

/**
 * Ensures both user-side models are registered so we can borrow their
 * collection names. (Mongoose pluralizes 'BrandUnlockRequest' → 'brandunlockrequests';
 * pulling the actual name off the registered model is safer than hardcoding.)
 */
async function ensureModelsRegistered() {
  await getBrandUnlockRequestModel()
  await getBrandProfileModel()
}

export async function adminBrandUnlockRequestsCollection() {
  await ensureModelsRegistered()
  const db = mongoose.connection.db
  if (!db) throw new Error('mongoose connection not initialized')
  const name = mongoose.models['BrandUnlockRequest']?.collection?.name
  if (!name) throw new Error('BrandUnlockRequest model not registered')
  return db.collection(name)
}

export async function adminBrandProfilesCollection() {
  await ensureModelsRegistered()
  const db = mongoose.connection.db
  if (!db) throw new Error('mongoose connection not initialized')
  const name = mongoose.models['BrandProfile']?.collection?.name
  if (!name) throw new Error('BrandProfile model not registered')
  return db.collection(name)
}

// Re-export ObjectId for route handlers that need to construct one from a URL param.
export { ObjectId } from 'mongodb'
