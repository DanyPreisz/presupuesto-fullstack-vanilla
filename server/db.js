import { MongoClient, ObjectId } from "mongodb";
const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "presupuesto";
let db;
export function isReady() { return Boolean(db); }
export async function connect() {
  if (!uri) throw new Error("Falta MONGODB_URI");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(dbName);
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("limits").createIndex({ userId: 1, period: 1, category: 1 }, { unique: true });
  await db.collection("moves").createIndex({ userId: 1, period: 1, spentAt: -1 });
  console.log(`MongoDB conectado (${dbName})`);
  return db;
}
export const users = () => db.collection("users");
export const limits = () => db.collection("limits");
export const moves = () => db.collection("moves");
export function toId(value) { return ObjectId.isValid(value) ? new ObjectId(String(value)) : null; }
export function mapMove(doc) {
  return { id: String(doc._id), title: doc.title, amount: doc.amount, kind: doc.kind, category: doc.category, period: doc.period, spentAt: doc.spentAt };
}
