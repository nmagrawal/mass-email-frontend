// Script to remove invalid_phone: true from all voters in the MongoDB collection
// Usage: node remove_invalid_phone.js

const { MongoClient } = require('mongodb');


require('dotenv').config({ path: '.env.local' });
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'opgov';
const collectionName = 'voters';

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const result = await collection.updateMany(
      { invalid_phone: true },
      { $unset: { invalid_phone: "" } }
    );
    console.log(`Updated ${result.modifiedCount} documents.`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
