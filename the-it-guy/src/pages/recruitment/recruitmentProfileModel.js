export const profileVersion = 'recruitment-profile-v1'
export const profileCountry = 'ZA'
export const experienceOptions = [['0','New to real estate'],['1','1 year'],['2','2 years'],['3','3 years'],['4','4 years'],['5','5 years'],['6-10','6 to 10 years'],['11-20','11 to 20 years'],['21+','21+ years']]
export const licenseOptions = [['valid','Valid'],['pending','Pending'],['expired','Expired']]
export const ffcTypeOptions = [['candidate','Candidate property practitioner'],['non_principal','Non-principal property practitioner'],['principal','Principal property practitioner']]
export const referralOptions = [['referral','Referral'],['social_media','Social media'],['website','Agency website'],['search','Search engine'],['event','Industry event'],['other','Other']]
export const provinceOptions = ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'].map(value => [value,value])
export const callingCodes = [['+27','South Africa'],['+1','United States / Canada'],['+44','United Kingdom'],['+61','Australia'],['+64','New Zealand'],['+91','India'],['+49','Germany'],['+33','France'],['+971','United Arab Emirates'],['+86','China'],['+234','Nigeria'],['+254','Kenya'],['+263','Zimbabwe'],['+267','Botswana'],['+264','Namibia'],['+258','Mozambique'],['+260','Zambia'],['+266','Lesotho'],['+268','Eswatini']]
export const homeSeekersPackageOptions = [['deals','Paid from your deals'],['monthly','Monthly debit order'],['upfront','Annual upfront payment'],['decide_later','Decide later']]
export const homeSeekersPackageNote = 'This is a starting preference, not a commitment. We’ll discuss the options with you before you decide.'
// Page descriptors also define the server whitelist; country-specific questions remain explicit.
export const profileFields = {
  firstName:{label:'First name',page:0,required:true,max:60}, middleName:{label:'Middle name',page:0,max:60}, lastName:{label:'Surname',page:0,required:true,max:60}, preferredName:{label:'Preferred name',page:0,max:60}, dateOfBirth:{label:'Date of birth',page:0,required:true,type:'birth',max:10},
  email:{label:'Email address',page:1,required:true,type:'email',max:254}, mobileCountryCode:{label:'Mobile country code',page:1,required:true,type:'code',max:4}, mobileNumber:{label:'Mobile phone number',page:1,required:true,type:'phone',max:30}, whatsappCountryCode:{label:'WhatsApp country code',page:1,type:'code',max:4}, whatsappNumber:{label:'WhatsApp number',page:1,type:'phone',max:30},
  yearsExperience:{label:'Years of experience',page:2,required:true,options:experienceOptions,max:5}, licenseStatus:{label:'License status',page:2,required:true,options:licenseOptions,max:10}, ffcNumber:{label:'FFC number',page:2,max:80}, ffcType:{label:'FFC practitioner type',page:2,options:ffcTypeOptions,max:20}, propertiesListed:{label:'Properties listed (last 12 months)',page:2,required:true,type:'count',max:3}, propertiesSold:{label:'Properties sold (last 12 months)',page:2,required:true,type:'count',max:3}, southAfricanCitizen:{label:'South African citizen',page:2,required:true,type:'yesno',max:3}, sequestrationStatus:{label:'Currently under sequestration or administration',page:2,required:true,type:'yesno',max:3},
  currentEmployer:{label:'Current brokerage / employer',page:3,required:true,max:100}, referralSource:{label:'How did you find out about us?',page:3,required:true,options:referralOptions,max:20}, streetAddress:{label:'Street address',page:3,required:true,max:200}, city:{label:'City / town',page:3,required:true,max:100}, province:{label:'Province',page:3,required:true,options:provinceOptions,max:30}, postalCode:{label:'Postal code',page:3,required:true,type:'postal',max:5}, expectedStartDate:{label:'Expected start date',page:3,required:true,type:'future',max:10},
  packagePreference:{label:'Home Seekers package preference',page:3,required:true,homeSeekersOnly:true,options:homeSeekersPackageOptions,max:14},
}
export const profilePages = ['Personal information','Contact information','Professional & legal details','Employment, address & start date']
export function recruitmentProfileSteps(answers, {homeSeekers = false} = {}) {
  return profilePages.map((label, page) => ({ label, page, complete: Object.keys(recruitmentProfileErrors(answers, { page, required: true, homeSeekers })).length === 0 }))
}
export function normalizeRecruitmentProfile(raw = {}) {
  const result = Object.fromEntries(Object.keys(profileFields).filter(key=>!profileFields[key].homeSeekersOnly || Object.hasOwn(raw || {},key)).map(key => [key, typeof raw?.[key] === 'string' || typeof raw?.[key] === 'number' ? String(raw[key]).trim() : '']))
  result.email = result.email.toLowerCase()
  if (result.licenseStatus !== 'valid') { result.ffcNumber = ''; result.ffcType = '' }
  // A dialling code alone does not mean an optional WhatsApp number was provided.
  if (!result.whatsappNumber) result.whatsappCountryCode = ''
  return result
}
function splitPhone(phone = '') {
  const digits = phone.replace(/[^\d+]/g,'')
  const code = digits.startsWith('+') ? [...callingCodes].sort((a,b)=>b[0].length-a[0].length).find(([value])=>digits.startsWith(value))?.[0] : '+27'
  if (code) return [code,digits.startsWith('+') ? digits.slice(code.length) : digits.replace(/^0/,'')]
  // Unknown international codes remain intact; the applicant chooses the country code.
  return ['',digits]
}
export function initialRecruitmentProfile(applicant) {
  if (applicant.profile?.answers) return normalizeRecruitmentProfile(applicant.profile.answers)
  const [mobileCountryCode,mobileNumber] = splitPhone(applicant.contact.phone)
  return normalizeRecruitmentProfile({...applicant.contact,mobileCountryCode,mobileNumber})
}
export function recruitmentProfileToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-')
}
const validDate = value => !value.startsWith('0000-') && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value
export function recruitmentProfileErrors(raw, {page, required = false, now = new Date(), homeSeekers = false} = {}) {
  const a = normalizeRecruitmentProfile(raw), errors = {}, today = recruitmentProfileToday(now)
  for (const [key,field] of Object.entries(profileFields)) {
    if (page !== undefined && field.page !== page) continue
    if (field.homeSeekersOnly) {
      if (!homeSeekers) { if (Object.hasOwn(raw || {},key)) errors[key] = 'Package preference is available only for Home Seekers.'; continue }
      if (Object.hasOwn(raw || {},key) && typeof raw[key] !== 'string') { errors[key] = 'Select an available package preference.'; continue }
    }
    if (['ffcNumber','ffcType'].includes(key) && a.licenseStatus !== 'valid') continue
    const value = a[key], mandatory = field.required || (['ffcNumber','ffcType'].includes(key) && a.licenseStatus === 'valid')
    if (!value) { if (required && mandatory) errors[key] = field.homeSeekersOnly ? 'Choose a package preference or decide later.' : `Enter ${field.label.toLowerCase()}.`; continue }
    if (value.length > field.max) { errors[key] = `Use no more than ${field.max} characters.`; continue }
    if (field.options && !field.options.some(([option])=>option === value)) errors[key] = 'Select an available option.'
    if (field.type === 'yesno' && !['yes','no'].includes(value)) errors[key] = 'Select yes or no.'
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[key] = 'Enter a valid email address.'
    if (field.type === 'code' && !/^\+[1-9]\d{0,2}$/.test(value)) errors[key] = 'Select or enter a country code, such as +27.'
    if (field.type === 'phone' && !/^[\d ()-]+$/.test(value)) errors[key] = 'Enter the number without the country code.'
    if (field.type === 'count' && !/^\d{1,3}$/.test(value)) errors[key] = 'Enter a whole number from 0 to 999.'
    if (field.type === 'postal' && !/^\d{4,5}$/.test(value)) errors[key] = 'Enter a 4 or 5 digit postal code.'
    if (['birth','future'].includes(field.type)) {
      if (!validDate(value)) errors[key] = 'Choose a valid date.'
      else if (field.type === 'future' && value <= today) errors[key] = 'Choose a future start date.'
      else if (field.type === 'birth') {
        let age = Number(today.slice(0,4))-Number(value.slice(0,4))
        if (today.slice(5)<value.slice(5)) age--
        if (age<18) errors[key] = 'You must be at least 18 years old to apply.'
      }
    }
  }
  if ((page === undefined || page === 0) && `${a.firstName} ${a.lastName}`.length > 120) errors.lastName = 'Keep your full name to 120 characters.'
  if (page === undefined || page === 1) {
    for (const prefix of ['mobile','whatsapp']) {
      const number = a[`${prefix}Number`], code = a[`${prefix}CountryCode`]
      if (number && (!code || !/^\+[1-9]\d{0,2}$/.test(code))) errors[`${prefix}CountryCode`] = 'Select or enter a country code.'
      if (number && code) {
        const length = `${code}${number}`.replace(/\D/g,'').length
        if (length<9 || length>15) errors[`${prefix}Number`] = 'Use 9 to 15 digits in total, including the country code.'
      }
    }
  }
  return errors
}
export function recruitmentProfileSummary(raw) {
  const a = normalizeRecruitmentProfile(raw)
  return Object.entries(profileFields).filter(([key])=>a[key]).map(([key,field])=>[field.label, field.options?.find(([value])=>value===a[key])?.[1] || (field.type === 'yesno' ? a[key] === 'yes' ? 'Yes' : 'No' : a[key])])
}
