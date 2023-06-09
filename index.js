const { ReplSet } = require('mongodb-topology-manager');
const mongoose = require('mongoose');

// If you're not familiar with async/await, check out this article:
// http://bit.ly/node-async-await
run().catch(error => console.error(error));

async function run() {
  // Make sure you're using mongoose >= 5.0.0
  console.log(new Date(), `mongoose version: ${mongoose.version}`);

  await startReplicaSet();

  // Connect to the replica set
  const uri = 'mongodb://localhost:31000,localhost:31001,localhost:31002/' +
    'test?replicaSet=rs0';
  await mongoose.connect(uri);
  // For this example, need to explicitly create a collection, otherwise
  // you get "MongoError: cannot open $changeStream for non-existent database: test"
  await mongoose.connection.createCollection('Price');

  // Create a new mongoose model
  const priceSchema = new mongoose.Schema({
    ticker: String,
    price: Number
  });
  const Price = mongoose.model('Price', priceSchema, 'Price');

  let index = 0;
  const prices = [
    // First 10 seconds, prices are below 45
    44.5, 44.51, 44.67, 44.79, 44.52, 43.97, 44.55, 44.22, 44.11, 44.86,
    // Next 10 seconds, prices are above 45
    45.1, 45.22, 45.37, 45.26, 45.29, 45.99, 46.01, 45.65, 45.62, 45.02
  ];

  // To simulate real market data, insert a new stock price every second.
  // Every 10 seconds the price will cross between above 45 and below 45
  while (true) {
    console.log(new Date(), `Insert MDB price ${prices[index]}`);
    await Price.create({ ticker: 'MDB', price: prices[index] });
    index = (index + 1) % prices.length;
    // Pause execution for 1 second.
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}


run().catch(error => console.error(error));

async function run() {
  // Connect to the replica set
  const uri = 'mongodb://localhost:31000,localhost:31001,localhost:31002/' +
    'test?replicaSet=rs0';
  await mongoose.connect(uri);

  // Create mongoose models for prices and thresholds
  const thresholdSchema = new mongoose.Schema({
    ticker: String,
    price: String
  });
  const Threshold = mongoose.model('Threshold', thresholdSchema, 'Threshold');

  const priceSchema = new mongoose.Schema({
    ticker: String,
    price: Number
  });
  const Price = mongoose.model('Price', priceSchema, 'Price');

  // Store the threshold in the database
  await Threshold.create({ ticker: 'MDB', price: 45 });

  let lastPrice = -1;
  // The first argument to `watch()` is an aggregation pipeline. This
  // pipeline makes sure we only get notified of changes on the 'Price'
  // collection.
  const pipeline = [{ $match: { 'ns.db': 'test', 'ns.coll': 'Price' } }];
  Price.watch(pipeline).
    on('change', async (data) => {
      const newPrice = data.fullDocument.price;
      if (lastPrice === -1) {
        lastPrice = newPrice;
        return;
      }
      const ticker = data.fullDocument.ticker;
      const $gte = Math.min(lastPrice, newPrice);
      const $lte = Math.max(lastPrice, newPrice);
      // Make sure to set `lastPrice` **before** any async logic, in case
      // another `change` event comes in before the query is done
      lastPrice = newPrice;

      const threshold = await Threshold.findOne({
        ticker,
        price: { $gte, $lte }
      });
      if (threshold != null) {
        console.log(new Date(), `Threshold for ${threshold.ticker} ` +
          `${threshold.price} crossed: ${$gte}, ${$lte}`);
      }
    });
}
