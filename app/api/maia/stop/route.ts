import { NextRequest, NextResponse } from 'next/server'

const LYZR_AGENT_BASE_URL = process.env.LYZR_AGENT_BASE_URL || 'https://agent.maia.prophet.com'
const LYZR_API_KEY = process.env.LYZR_API_KEY

export async function POST(request: NextRequest) {
  try {
    if (!LYZR_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'LYZR_API_KEY not configured' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { session_id } = body

    if (!session_id) {
      return NextResponse.json(
        { success: false, error: 'session_id is required' },
        { status: 400 }
      )
    }

    const stopUrl = `${LYZR_AGENT_BASE_URL}/v3/inference/session/${session_id}/stop`

    const stopRes = await fetch(stopUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LYZR_API_KEY,
      },
    })

    if (!stopRes.ok) {
      const stopText = await stopRes.text()
      return NextResponse.json(
        {
          success: false,
          error: `Stop request failed with status ${stopRes.status}`,
          details: stopText,
        },
        { status: stopRes.status }
      )
    }

    const response = await stopRes.json()

    return NextResponse.json({
      success: true,
      message: 'Session stopped successfully',
      response,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    )
  }
}
