/**
 * Minimal in-memory stand-in for the firebase-admin Firestore API surface the
 * server uses. Transactions apply writes immediately (tests run sequentially).
 */

export const DELETE = Symbol('FieldValue.delete');

type Data = Record<string, any>;
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function applyDeletes(target: Data, patch: Data, merge: boolean): Data {
  const out: Data = merge ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE) delete out[k];
    else if (merge && v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = applyDeletes(out[k], v, true);
    } else out[k] = v && typeof v === 'object' && !Array.isArray(v) ? applyDeletes({}, v, false) : clone(v);
  }
  return out;
}

function getPath(obj: Data, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export class FakeFirestore {
  collections = new Map<string, Map<string, Data>>();

  private col(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name)!;
  }

  reset() {
    this.collections.clear();
  }

  collection(name: string) {
    return new Query(this, name, [], undefined);
  }

  docRef(colName: string, id: string) {
    const db = this;
    const ref: any = {
      id,
      path: `${colName}/${id}`,
      async get() {
        const data = db.col(colName).get(id);
        return snapshot(ref, data);
      },
      async set(data: Data, opts?: { merge?: boolean }) {
        const cur = db.col(colName).get(id) || {};
        db.col(colName).set(id, applyDeletes(cur, data, !!opts?.merge));
      },
      async create(data: Data) {
        if (db.col(colName).has(id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
        db.col(colName).set(id, applyDeletes({}, data, false));
      },
      async update(data: Data) {
        const cur = db.col(colName).get(id);
        if (!cur) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
        const next = clone(cur);
        for (const [k, v] of Object.entries(data)) {
          const parts = k.split('.');
          let o = next;
          for (const p of parts.slice(0, -1)) o = o[p] ??= {};
          if (v === DELETE) delete o[parts.at(-1)!];
          else o[parts.at(-1)!] = clone(v);
        }
        db.col(colName).set(id, next);
      },
      async delete() {
        db.col(colName).delete(id);
      },
    };
    return ref;
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const tx = {
      get: (refOrQuery: any) => refOrQuery.get(),
      set: (ref: any, data: Data, opts?: any) => { ref.set(data, opts); },
      update: (ref: any, data: Data) => { ref.update(data); },
      create: (ref: any, data: Data) => {
        if (this.col(ref.path.split('/')[0]).has(ref.id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
        ref.create(data);
      },
      delete: (ref: any) => { ref.delete(); },
    };
    return fn(tx);
  }

  batch() {
    const ops: (() => Promise<void>)[] = [];
    const b = {
      set: (ref: any, data: Data, opts?: any) => { ops.push(() => ref.set(data, opts)); return b; },
      create: (ref: any, data: Data) => { ops.push(() => ref.create(data)); return b; },
      update: (ref: any, data: Data) => { ops.push(() => ref.update(data)); return b; },
      delete: (ref: any) => { ops.push(() => ref.delete()); return b; },
      commit: async () => { for (const op of ops) await op(); },
    };
    return b;
  }

  _all(colName: string) {
    return Array.from(this.col(colName).entries());
  }
}

function snapshot(ref: any, data: Data | undefined) {
  return {
    id: ref.id,
    ref,
    exists: data !== undefined,
    data: () => clone(data),
    get: (field: string) => (data ? getPath(data, field) : undefined),
  };
}

class Query {
  constructor(private db: FakeFirestore, private colName: string, private filters: [string, any][], private max?: number) {}

  doc(id: string) {
    return this.db.docRef(this.colName, id);
  }

  where(field: string, _op: '==', value: any) {
    return new Query(this.db, this.colName, [...this.filters, [field, value]], this.max);
  }

  limit(n: number) {
    return new Query(this.db, this.colName, this.filters, n);
  }

  select(..._fields: string[]) {
    return this;
  }

  async get() {
    let rows = this.db._all(this.colName).filter(([, d]) => this.filters.every(([f, v]) => getPath(d, f) === v));
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    const docs = rows.map(([id, d]) => snapshot(this.db.docRef(this.colName, id), d));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  count() {
    return {
      get: async () => {
        const { size } = await this.get();
        return { data: () => ({ count: size }) };
      },
    };
  }
}
