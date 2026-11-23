export function electionStore(db) {
  const read = () => db.prepare('SELECT body FROM election_state WHERE id = 1').first();
  const snapshot = (value) => ({ val: () => value ?? null });

  function ref(parts = []) {
    const locate = (root) => parts.reduce((value, key) => value?.[key], root);
    return {
      child: (path) => ref([...parts, ...path.split('/')]),
      async get() {
        const row = await read();
        return snapshot(row && locate(JSON.parse(row.body)));
      },
      async transaction(update) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const row = await read();
          if (!row) break;
          let state = JSON.parse(row.body);
          const value = update(locate(state) ?? null);
          if (value === undefined) break;
          if (!parts.length) state = value;
          else {
            let parent = state;
            for (const key of parts.slice(0, -1)) parent = (parent[key] ??= {});
            if (value === null) delete parent[parts.at(-1)];
            else parent[parts.at(-1)] = value;
          }
          const result = await db.prepare('UPDATE election_state SET body = ? WHERE id = 1 AND body = ?')
            .bind(JSON.stringify(state), row.body).run();
          if (result.meta.changes === 1) return { committed: true, snapshot: snapshot(value) };
        }
        return { committed: false };
      }
    };
  }
  return { ref };
}
