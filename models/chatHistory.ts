// Mongo model for a ChatHistory doc — one per "Generate my copy" session.
// Uses lyzr-architect's createModel + lazy-getter pattern per CLAUDE.md §2,
// mirroring models/brandProfile.ts. RLS adds owner_user_id automatically and
// scopes every query to the current user.
//
// A chat embeds its originating brief, the generated variations, and the
// ordered list of saved versions (compose seed + refine/override commits).
// Embedded arrays keep a chat a single-document read/write.

import { initDB, createModel } from 'lyzr-architect'

let _model: any = null

export default async function getChatHistoryModel() {
  if (!_model) {
    await initDB()
    _model = createModel(
      'ChatHistory',
      {
        title: { type: String, default: 'Untitled' },
        channel: { type: String, default: '' },
        audience: { type: String, default: '' },
        brief: {
          contentObjective: { type: String, default: '' },
          supportingMessages: { type: String, default: '' },
          callToAction: { type: String, default: '' },
          mandatories: { type: [String], default: [] },
          tone: { type: Number, default: 5 },
        },
        // [{ label, differentiator, copy, scores:{voice,messaging,strategy}, word_count }]
        variations: { type: Array, default: [] },
        // [{ copy, scores:{voice,messaging,strategy}, source, note, createdAt }]
        // source ∈ 'compose' | 'refine' | 'override'
        versions: { type: Array, default: [] },
      },
      { timestamps: true }
    )
  }
  return _model
}
