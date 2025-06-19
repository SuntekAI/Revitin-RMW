import { createAdminApiClient } from "@shopify/admin-api-client";
import { config } from "dotenv";
config();

const client = createAdminApiClient({
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
  apiVersion: "2025-04",
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
});

export default client;
