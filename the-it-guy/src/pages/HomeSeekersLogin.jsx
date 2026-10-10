import Auth from './Auth'
import useHomeSeekersBranding from './recruitment/useHomeSeekersBranding'
import './HomeSeekersLogin.css'

export default function HomeSeekersLogin() {
  useHomeSeekersBranding({ title: 'Log in | Home Seekers', description: 'Log in to your Home Seekers application or agent workspace.' })
  return <Auth homeSeekers />
}
