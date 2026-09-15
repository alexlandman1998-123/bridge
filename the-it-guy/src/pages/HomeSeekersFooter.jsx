import { ArrowRight, MapPin } from 'lucide-react'
import './HomeSeekersFooter.css'

export default function HomeSeekersFooter() {
  return <footer className="hs-site-footer">
    <div className="hs-site-footer__top">
      <div className="hs-site-footer__brand"><img src="/brand/homeseekers/home-seekers-vertical-white-tag.svg" alt="Home Seekers — Move Forward, Faster" /><p>Every move deserves a better way forward.</p></div>
      <nav aria-label="Footer navigation"><div><span>Explore</span><a href="/demo/homeseekers/selling">Selling</a><a href="/demo/homeseekers/buying">Buying</a><a href="/demo/homeseekers/renting">Renting</a></div><div><span>Discover</span><a href="/demo/homeseekers/areas">Areas</a><a href="/demo/homeseekers/about">About Home Seekers</a><a href="/demo/homeseekers/join">Join us</a></div></nav>
      <address><span>Start a conversation</span><a href="tel:+27128803127">+27 12 880 3127</a><a href="mailto:info@homeseeker.co.za">info@homeseeker.co.za</a><p><MapPin size={14} /> 786 Witdoring Avenue<br />Moreleta Park, Pretoria</p></address>
    </div>
    <div className="hs-site-footer__bottom"><p>© 2026 Home Seekers</p><div><a href="/demo/homeseekers/about">Privacy</a><a href="/demo/homeseekers/about">POPIA</a><a href="/demo/homeseekers/selling">Guarantee terms</a></div><span>MOVE FORWARD, FASTER.</span></div>
  </footer>
}
