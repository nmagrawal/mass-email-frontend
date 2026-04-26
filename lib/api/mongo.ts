import { MongoClient, Db } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URI!;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri, options);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;


export async function getDb(dbName: string): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
}

// Collection for SMS/text templates
import { Collection, ObjectId } from "mongodb";
export interface TextTemplateDoc {
  _id?: ObjectId;
  name: string;
  body: string;
}

export async function getTextTemplatesCollection(): Promise<Collection<TextTemplateDoc>> {
  const db = await getDb(process.env.MONGODB_DB || "opgov");
  return db.collection<TextTemplateDoc>("text_templates");
}
