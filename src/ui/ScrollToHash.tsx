import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * HashRouter already uses the URL hash for the route, so in-page anchors ride in the
 * pathname's own hash ("#/cases/NC-1021#contact-x"). Scroll to it, or to the top on navigation.
 */
export function ScrollToHash() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])
  return null
}
