// @vitest-environment jsdom
import {render,screen,within,cleanup} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import MobileDeveloperMarketingCards from '../MobileDeveloperMarketingCards.jsx'
vi.mock('../../../services/mobileDeveloperMarketingService.js',()=>({loadMobileDeveloperMarketing:vi.fn(async()=>({property24:{metrics:{views:{available:true,value:12}}},website:{metrics:{views:{available:true,value:152},enquiries:{available:true,value:4}}},privateProperty:{metrics:{views:{available:true,value:8}}}}))}))
afterEach(cleanup)
it('shows P24, Website and Private Property cards with actual counts and the 30 day period',async()=>{
 render(<MobileDeveloperMarketingCards organisationId="org" developmentIds={['dev']} />)
 expect(await screen.findByText('152')).toBeTruthy()
 expect(screen.getAllByRole('article').map(card=>within(card).getByRole('heading').textContent)).toEqual(['P24','Website','Private Property'])
 expect(screen.getByText('Last 30 days')).toBeTruthy()
 expect(screen.getByRole('region',{name:/Swipe through P24/})).toBeTruthy()
})
