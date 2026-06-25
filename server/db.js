// Zero-dependency JSON-file data store.
// Production target is Postgres (see docs/PRD.md §13); this keeps the MVP
// fully runnable in any environment with no native binaries or cloud services.
const fs = require('fs');
const path = require('path');

const FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
const COLLECTIONS = ['users', 'connections', 'placements', 'events', 'attendance'];

let data = null;

function load() {
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    data = {};
  }
  for (const c of COLLECTIONS) if (!Array.isArray(data[c])) data[c] = [];
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

load();

module.exports = {
  col: (name) => data[name],
  find: (name, pred) => data[name].find(pred),
  filter: (name, pred) => data[name].filter(pred),
  insert: (name, row) => {
    data[name].push(row);
    save();
    return row;
  },
  update: (name, id, patch) => {
    const r = data[name].find((x) => x.id === id);
    if (r) {
      Object.assign(r, patch);
      save();
    }
    return r;
  },
  remove: (name, pred) => {
    data[name] = data[name].filter((x) => !pred(x));
    save();
  },
  save,
  reset: () => {
    data = {};
    for (const c of COLLECTIONS) data[c] = [];
    save();
  },
};
