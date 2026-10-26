# Test fixtures — synthetic, NOT real products

These CSV files imitate the *column layout* of Awin product feeds so the importer can be tested
without credentials. Every brand, retailer, price, GTIN (GS1 restricted 200-prefix), link and
image URL in them is invented and uses `.invalid`/test values. They are never loaded by the app.

`dummyjson-products.json` is a **synthetic** file in the same shape as the public DummyJSON `/products`
response (ids, field names), used so sample mode can be tested offline. Titles, prices and image paths are invented.
