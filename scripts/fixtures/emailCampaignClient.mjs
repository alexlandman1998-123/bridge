// Test-only PostgREST-shaped adapter. The application handlers execute their
// queries/RPCs against isolated PostgreSQL; network providers remain fixtures.
const identifier = value => {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value)) throw new Error('Invalid fixture SQL identifier')
  return `"${value}"`
}
export function emailCampaignClient({ db, before, user }) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    async rpc(name, args = {}) {
      try {
        await before()
        const entries = Object.entries(args)
        const result = await db.query(`select * from public.${identifier(name)}(${entries.map(([key],index) => `${identifier(key)} => $${index+1}`).join(',')})`, entries.map(([,value]) => value))
        const set = ['email_campaign_claim_dispatch_jobs','email_save_platform_sender','email_save_sender','email_campaign_list_assets'].includes(name)
        return { data: set ? name === 'email_campaign_claim_dispatch_jobs' || name === 'email_campaign_list_assets' ? result.rows : result.rows[0] : result.rows[0]?.[name], error: null }
      } catch (error) { return { data: null, error } }
    },
    from(table) {
      let operation = 'select', values, columns = '*', conflict, max, offset = 0, exact = false, single = false
      const filters = [], orders = []
      let anyFilters = []
      const run = async () => {
        try {
          await before()
          const params = []
          const parameter = value => { params.push(value); return `$${params.length}` }
          const where = () => (filters.length || anyFilters.length) ? ` where ${[...filters.map(([key,operator,value]) => `t.${identifier(key)} ${operator === 'in' ? `= any(${parameter(value)})` : `${operator} ${parameter(value)}`}`), ...(anyFilters.length ? ['('+anyFilters.map(([field,pattern]) => `${field === 'recipient_snapshot->>full_name' ? `t."recipient_snapshot"->>'full_name'` : `t.${identifier(field)}`} ilike ${parameter(pattern)}`).join(' or ')+')'] : [])].join(' and ')}` : ''
          let sql, count
          if (operation === 'select') {
            const embedded = columns.includes('email_sender_identities(')
            sql = `select t.*${embedded ? ',to_jsonb(i) as email_sender_identities' : ''} from public.${identifier(table)} t${embedded ? ' left join email_sender_identities i on i.id=t.sender_identity_id' : ''}${where()}`
            if (exact) count = Number((await db.query(`select count(*) n from (${sql}) counted`,params)).rows[0].n)
            if (orders.length) sql += ` order by ${orders.map(([key,ascending]) => `t.${identifier(key)} ${ascending ? 'asc' : 'desc'}`).join(',')}`
            if (max) sql += ` limit ${Number(max)}`
            if (offset) sql += ` offset ${Number(offset)}`
          } else if (operation === 'update') {
            sql = `update public.${identifier(table)} t set ${Object.entries(values).map(([key,value]) => `${identifier(key)}=${parameter(value)}`).join(',')}${where()} returning t.*`
          } else {
            const keys = Object.keys(values)
            sql = `insert into public.${identifier(table)}(${keys.map(identifier).join(',')}) values(${keys.map(key=>parameter(values[key])).join(',')})`
            if (conflict) sql += ` on conflict(${conflict.split(',').map(identifier).join(',')}) do update set ${keys.map(key=>`${identifier(key)}=excluded.${identifier(key)}`).join(',')}`
            sql += ' returning *'
          }
          const result = await db.query(sql,params)
          return { count, data: single ? result.rows[0] || null : result.rows, error: single === 'required' && !result.rows[0] ? { code: 'PGRST116' } : null }
        } catch (error) { return { data: null, error } }
      }
      const query = {
        select(value = '*', options = {}) { columns = value; exact = options.count === 'exact'; return query },
        eq(key,value) { filters.push([key,'=',value]); return query },
        or(expression) { anyFilters = expression.split(',').map(part => part.split('.ilike.')); if (anyFilters.some(([field]) => !['email','status','recipient_snapshot->>full_name'].includes(field))) throw Error('Unsupported fixture search'); return query },
        in(key,value) { filters.push([key,'in',value]); return query },
        order(key,{ascending = true} = {}) { orders.push([key,ascending]); return query },
        range(first,last) { offset = first; max = last - first + 1; return query },
        limit(value) { max = value; return query },
        insert(value) { operation = 'insert'; values = value; return query },
        upsert(value,options) { operation = 'insert'; values = value; conflict = options?.onConflict; return query },
        update(value) { operation = 'update'; values = value; return query },
        single() { single = 'required'; return run() },
        maybeSingle() { single = true; return run() },
        then(resolve,reject) { return run().then(resolve,reject) },
      }
      return query
    },
  }
}
