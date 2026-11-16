import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { capabilities } from './data.js'

export function HomeHero() {
  const videoRef = useRef(null)
  const heroRef = useRef(null)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const observer = new IntersectionObserver(([entry]) => {
      if (reduced || document.hidden || !entry.isIntersecting || !playing) video.pause()
      else video.play().catch(() => {})
    }, { threshold: 0.05 })
    observer.observe(heroRef.current)
    const visibility = () => { if (document.hidden || reduced || !playing) video.pause(); else video.play().catch(() => {}) }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [playing, reduced])
  return <section ref={heroRef} id="hero" className="m-hero" aria-labelledby="home-title">
    <div className={'m-hero__plate' + (reduced ? ' m-hero__plate--still' : '')} role="img" aria-label="Dark architectural space crossed by a single precise line of light"><video ref={videoRef} className="m-hero__video" autoPlay={!reduced} muted loop playsInline preload="metadata" poster="/media/hero-poster.webp" aria-hidden="true"><source src="/media/hero-mobile.webm" type="video/webm" media="(max-width: 600px)"/><source src="/media/hero-mobile.mp4" type="video/mp4" media="(max-width: 600px)"/><source src="/media/hero-desktop.webm" type="video/webm"/><source src="/media/hero-desktop.mp4" type="video/mp4"/></video></div>
    <div className="m-hero__content"><p className="m-hero__eyebrow">INDEPENDENT CREATIVE &amp; TECHNOLOGY STUDIO</p><h1 id="home-title" tabIndex="-1" className="m-hero__headline">Direction, made visible.</h1><p className="m-hero__sub">We shape how brands look and speak, put them in front of the right people, and build the systems that turn attention into business.</p><a className="m-hero__ghost" href="#capabilities">SEE WHAT WE DO</a></div>
    {!reduced && <button className="m-hero__video-control" type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause background video' : 'Play background video'}>{playing ? 'Pause' : 'Play'} video</button>}
    <div className="m-hero__disciplines" aria-label="Moreward disciplines">{capabilities.map(item => <Link key={item.slug} to={'/capabilities/' + item.slug}><b>{item.number}</b> {item.name.toUpperCase()}</Link>)}</div>
  </section>
}
