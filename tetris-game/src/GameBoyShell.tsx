import React, { useRef, useCallback, useEffect } from 'react'
import './styles/GameBoyShell.css'

type Props = { children: React.ReactNode }

export default function GameBoyShell({ children }: Props) {
  const dispatch = useCallback((e: string) => () =>
    window.dispatchEvent(new Event(`tetris-${e}`)), [])

  const dropInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleDownStart = (e: React.PointerEvent) => {
    e.preventDefault()
    dispatch('down')()
    if (!dropInterval.current) {
      dropInterval.current = setInterval(() => dispatch('down')(), 50)
    }
  }
  const handleDownEnd = () => {
    if (dropInterval.current) {
      clearInterval(dropInterval.current)
      dropInterval.current = null
    }
  }

  // Clean interval si unmount
  useEffect(() => () => {
    if (dropInterval.current) {
      clearInterval(dropInterval.current)
    }
  }, [])

  return (
    <div className="gb">
      <div className="gb-top-bar" />

      <div className="gb-screen">
        {children}
      </div>

      <div className="gb-label">Nintendo GAME BOY™</div>

      <div className="gb-dpad">
        <div className="gb-dpad-vertical" />
        <div className="gb-dpad-horizontal" />

        <div
          className="gb-dpad-up"
          onClick={dispatch('rotate')}
        />

        <div
          className="gb-dpad-down"
          onPointerDown={handleDownStart}
          onPointerUp={handleDownEnd}
          onPointerLeave={handleDownEnd}
        />

        <div
          className="gb-dpad-left"
          onClick={dispatch('left')}
        />
        <div
          className="gb-dpad-right"
          onClick={dispatch('right')}
        />
      </div>

      <div className="gb-buttons">
        <div className="gb-btn-container">
          <div
            className="gb-btn gb-btn-b"
            onClick={dispatch('down')}
          />
          <span className="gb-btn-label">B</span>
        </div>
        <div className="gb-btn-container">
          <div
            className="gb-btn gb-btn-a"
            onClick={dispatch('rotate')}
          />
          <span className="gb-btn-label">A</span>
        </div>
      </div>

      <div className="gb-select-start">
        <div className="gb-select-container">
          <div
            className="gb-small-btn"
            onClick={dispatch('toggle-music')}
          />
          <span className="gb-select-label">SELECT</span>
        </div>
        <div className="gb-select-container">
          <div
            className="gb-small-btn"
            onClick={dispatch('toggle-pause')}
          />
          <span className="gb-start-label">START</span>
        </div>
      </div>

      <div className="gb-speaker">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="gb-speaker-hole" />
        ))}
      </div>
    </div>
  )
}
