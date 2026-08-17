import { getStore } from "@netlify/blobs";

const store = getStore("daily-sales-tracker");
const dataKey = "sales-data";
const defaultData = {
  products: ["Product One", "Product Two", "Product Three", "Product Four"],
  entries: []
};

export default async (request) => {
  if (request.method === "GET") {
    return Response.json((await store.get(dataKey, { type: "json" })) ?? defaultData);
  }

  if (request.method !== "PUT") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT" } });
  }

  const data = await request.json();
  const valid = Array.isArray(data?.products) && data.products.length === 4 && Array.isArray(data?.entries);
  if (!valid) return Response.json({ error: "Invalid sales data" }, { status: 400 });

  await store.setJSON(dataKey, { products: data.products, entries: data.entries });
  return new Response(null, { status: 204 });
};
