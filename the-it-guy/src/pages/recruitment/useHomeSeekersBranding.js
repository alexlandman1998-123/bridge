import { useEffect } from 'react'

export default function useHomeSeekersBranding({ title: pageTitle = 'My Profile | Home Seekers', description = 'Your Home Seekers application, profile and supporting documents in one place.' } = {}) {
  useEffect(() => {
    const title = document.title
    document.title = pageTitle
    const changes = []
    const change = (selector, attributes) => document.querySelectorAll(selector).forEach(node => {
      const previous = Object.fromEntries(Object.keys(attributes).map(key => [key, node.getAttribute(key)]))
      changes.push(() => Object.entries(previous).forEach(([key, value]) => value === null ? node.removeAttribute(key) : node.setAttribute(key, value)))
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value))
    })
    change('link[rel="icon"]', { href: '/brand/homeseekers/applicant-icon.svg', type: 'image/svg+xml' })
    change('link[rel="apple-touch-icon"]', { href: '/brand/homeseekers/logo.png' })
    change('link[rel="manifest"]', { href: '/brand/homeseekers/applicant.webmanifest' })
    change('meta[name="apple-mobile-web-app-title"]', { content: 'Home Seekers' })
    change('meta[name="theme-color"]', { content: '#171717' })
    change('meta[name="description"]', { content: description })
    const fonts = document.createElement('link')
    fonts.rel = 'stylesheet'; fonts.href = 'https://fonts.googleapis.com/css2?family=Asap:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap'
    document.head.appendChild(fonts)
    return () => { document.title = title; changes.reverse().forEach(restore => restore()); fonts.remove() }
  }, [pageTitle, description])
}
