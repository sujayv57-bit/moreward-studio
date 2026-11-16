import { useEffect, useRef } from 'react'

/** Small damped spring for selected interactive details. */
export function useSpringArrow(distance = 5) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    const owner = element?.closest('a,button')
    if (!owner || matchMedia('(max-width: 768px), (hover: none), (prefers-reduced-motion: reduce)').matches) return
    let x = 0, velocity = 0, target = 0, frame = 0, previous = 0
    const tick = time => {
      const dt = Math.min((time - (previous || time)) / 1000, .032)
      previous = time
      velocity += (-300 * (x - target) - 20 * velocity) * dt
      x += velocity * dt
      element.style.transform = `translate(${x.toFixed(2)}px, ${(-x * .36).toFixed(2)}px)`
      if (Math.abs(x - target) > .02 || Math.abs(velocity) > .02) frame = requestAnimationFrame(tick)
      else { frame = 0; previous = 0 }
    }
    const move = value => { target = value; if (!frame) frame = requestAnimationFrame(tick) }
    const enter = () => move(distance), leave = () => move(0)
    owner.addEventListener('pointerenter', enter)
    owner.addEventListener('pointerleave', leave)
    return () => { owner.removeEventListener('pointerenter',enter); owner.removeEventListener('pointerleave',leave); cancelAnimationFrame(frame) }
  }, [distance])
  return ref
}
