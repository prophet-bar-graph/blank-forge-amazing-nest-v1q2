// The fixed set of marketing channels. Used in the channel-pill selector
// inside Compose's and Refine's Brief cards. Order matches the wireframe's
// 3-up + 2-up grid layout: Social / Web / Ad on the first row, Email /
// Non-Specific on the second.

export const CHANNELS = ['Social', 'Web', 'Ad', 'Email', 'Non-Specific'] as const
export type Channel = typeof CHANNELS[number]
