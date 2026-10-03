// Local-only adapter: every table operation and RPC executes in isolated PostgreSQL.
// It is never imported by the application or a deployed API route.
export function rentalOnboardingClient(db, storage, actor, scoped = false) {
  const name = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(value))
      throw new Error('Invalid fixture identifier')
    return `"${value}"`
  }
  const value = (input) =>
    input && typeof input === 'object' ? JSON.stringify(input) : input
  async function execute(work) {
    try {
      return await db.transaction(async (tx) => {
        await tx.query("select set_config('test.actor',$1,true)", [
          scoped ? actor : '',
        ])
        if (scoped) await tx.exec('set local role authenticated')
        return { data: await work(tx), error: null }
      })
    } catch (error) {
      return { data: null, error }
    }
  }
  return {
    auth: {
      getUser: async (jwt) =>
        jwt === 'fixture-agent'
          ? { data: { user: { id: actor } } }
          : { error: new Error('Invalid fixture agent') },
    },
    storage,
    rpc: (fn, args = {}) =>
      execute(async (tx) => {
        const entries = Object.entries(args)
        const sql = `select ${name(fn)}(${entries.map(([key], index) => `${name(key)}=>$${index + 1}`).join(',')}) result`
        return (
          await tx.query(
            sql,
            entries.map(([, input]) => value(input)),
          )
        ).rows[0].result
      }),
    from: (table) => {
      let operation = 'select',
        payload,
        fields = '*',
        filters = [],
        ordering = [],
        single = false,
        conflict
      const q = {
        select: (selected = '*') => {
          fields = selected
          return q
        },
        eq: (key, input) => {
          filters.push([key, input])
          return q
        },
        order: (key, options = {}) => {
          ordering.push(
            `${name(key)} ${options.ascending === false ? 'desc' : 'asc'}`,
          )
          return q
        },
        insert: (input) => {
          operation = 'insert'
          payload = input
          return q
        },
        upsert: (input, options = {}) => {
          operation = 'insert'
          payload = input
          conflict = options.onConflict
          return q
        },
        update: (input) => {
          operation = 'update'
          payload = input
          return q
        },
        delete: () => {
          operation = 'delete'
          return q
        },
        maybeSingle: () => {
          single = true
          return run()
        },
        single: () => {
          single = true
          return run()
        },
        then: (resolve, reject) => run().then(resolve, reject),
        catch: (reject) => run().catch(reject),
      }
      async function run() {
        return execute(async (tx) => {
          const params = []
          const bind = (input) => {
            params.push(value(input))
            return `$${params.length}`
          }
          const columns =
            fields === '*'
              ? '*'
              : fields
                  .split(',')
                  .map((item) => name(item.trim()))
                  .join(',')
          let sql
          if (operation === 'insert') {
            const rows = Array.isArray(payload) ? payload : [payload]
            const keys = Object.keys(rows[0])
            sql = `insert into ${name(table)}(${keys.map(name).join(',')}) values ${rows.map((row) => '(' + keys.map((key) => bind(row[key])).join(',') + ')').join(',')}`
            if (conflict)
              sql += ` on conflict (${conflict.split(',').map(name).join(',')}) do nothing`
          } else if (operation === 'update')
            sql = `update ${name(table)} set ${Object.entries(payload)
              .map(([key, input]) => `${name(key)}=${bind(input)}`)
              .join(',')}`
          else if (operation === 'delete') sql = `delete from ${name(table)}`
          else sql = `select ${columns} from ${name(table)}`
          if (operation !== 'insert' && filters.length)
            sql +=
              ' where ' +
              filters
                .map(([key, input]) =>
                  input === null
                    ? `${name(key)} is null`
                    : `${name(key)}=${bind(input)}`,
                )
                .join(' and ')
          if (operation === 'select' && ordering.length)
            sql += ' order by ' + ordering.join(',')
          if (operation !== 'select') sql += ' returning ' + columns
          const rows = (await tx.query(sql, params)).rows
          return single ? rows[0] || null : rows
        })
      }
      return q
    },
  }
}
