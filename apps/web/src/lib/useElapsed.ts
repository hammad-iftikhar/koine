import { useEffect, useState } from 'react'

export function useElapsed(): number {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return Math.floor((now - start) / 1000)
}
