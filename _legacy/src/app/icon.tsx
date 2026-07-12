import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'
export const runtime = 'edge'

/**
 * Inline favicon — a rounded indigo tile with "B".
 * Avoids the /favicon.ico 404 spam in the console.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'system-ui',
          fontWeight: 700,
          borderRadius: 8,
        }}
      >
        B
      </div>
    ),
    { ...size }
  )
}
