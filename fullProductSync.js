import { PrismaClient } from "@prisma/client";
import client from "./graphql/client.js";
import productsQuery from "./graphql/queries/products.js";
import variantsQuery from "./graphql/queries/variants.js";

// Instantiate PrismaClient
const prisma = new PrismaClient();

class ShopifyProductSyncGraphQL {
  constructor() {
    this.client = client;
  }

  async fetchProducts(first = 250, after = null) {
    const variables = {
      firstProducts: first,
      afterProductCursor: after,
    };

    try {
      const response = await this.client.request(productsQuery, {
        variables,
      });

      if (response.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
      }

      return response.data.products;
    } catch (error) {
      console.error("GraphQL fetch error:", error);
      throw error;
    }
  }

  async fetchVariantsForProduct(productId, first = 250, after = null) {
    const variables = {
      productId,
      firstVariants: first,
      afterVariantCursor: after,
    };

    try {
      const response = await this.client.request(variantsQuery, {
        variables,
      });

      if (response.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
      }

      return response.data.product.variants;
    } catch (error) {
      console.error("GraphQL fetch variants error:", error);
      throw error;
    }
  }

  async fetchAllProducts() {
    let hasNextPage = true;
    let after = null;
    let totalProductsFetched = 0;

    console.log("Starting Shopify Product Synchronization with GraphQL...");

    // Clear existing tables before sync
    await this.clearExistingData();

    while (hasNextPage) {
      try {
        const products = await this.fetchProducts(250, after);

        if (products.nodes.length > 0) {
          // Handle products with more than 250 variants
          const processedProducts = await this.processProductsWithPagination(
            products.nodes
          );

          await this.saveProductsToDatabase(processedProducts);
          totalProductsFetched += products.nodes.length;
          console.log(
            `Fetched ${products.nodes.length} products. Total: ${totalProductsFetched}`
          );
        }

        // Update pagination
        hasNextPage = products.pageInfo.hasNextPage;
        after = products.pageInfo.endCursor;

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error("Sync Error:", error);
        hasNextPage = false;
      }
    }

    console.log(
      `Product Sync Completed. Total Products: ${totalProductsFetched}`
    );
  }

  async processProductsWithPagination(products) {
    const processedProducts = [];

    for (const product of products) {
      let allVariants = [...product.variants.nodes];

      // If there are more variants to fetch
      if (product.variants.pageInfo.hasNextPage) {
        let hasMoreVariants = true;
        let variantAfter = product.variants.pageInfo.endCursor;

        while (hasMoreVariants) {
          const moreVariants = await this.fetchVariantsForProduct(
            product.id,
            250,
            variantAfter
          );

          allVariants = [...allVariants, ...moreVariants.nodes];
          hasMoreVariants = moreVariants.pageInfo.hasNextPage;
          variantAfter = moreVariants.pageInfo.endCursor;

          // Rate limiting for variant pagination
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      processedProducts.push({
        ...product,
        variants: { nodes: allVariants },
      });
    }

    return processedProducts;
  }

  async clearExistingData() {
    try {
      // Delete all variants first due to foreign key constraint
      await prisma.variants.deleteMany();

      // Then delete all products
      await prisma.products.deleteMany();

      console.log("Existing product and variant data cleared successfully.");
    } catch (error) {
      console.error("Error clearing existing data:", error);
      throw error;
    }
  }

  async saveProductsToDatabase(products) {
    try {
      // Save products
      const productData = products.map((product) => ({
        id: BigInt(product.id.split("/").pop()),
        gid: product.id,
        title: product.title,
        inventoryAvailableQty: product.totalInventory || 0,
        tags: product.tags ? product.tags.join(",") : null,
        imgSrc: product.featuredMedia?.preview?.image?.url,
        description: product.description || "",
        maximumPrice: product.priceRangeV2?.maxVariantPrice
          ? parseFloat(product.priceRangeV2.maxVariantPrice.amount)
          : 0,
        type: product.productType || "",
        status: product.status || "",
        vendor: product.vendor,
        updatedAt: new Date(product.updatedAt),
      }));

      await prisma.products.createMany({
        data: productData,
        skipDuplicates: true,
      });

      // Save variants
      const variantData = products.flatMap((product) =>
        product.variants.nodes.map((variant) => ({
          id: BigInt(variant.id.split("/").pop()),
          gid: variant.id,
          productId: BigInt(product.id.split("/").pop()),
          price: parseFloat(variant.price) || 0,
          sku: variant.sku || "",
          inventoryQty: variant.inventoryQuantity || 0,
        }))
      );

      await prisma.variants.createMany({
        data: variantData,
        skipDuplicates: true,
      });

      console.log("Products and variants stored in the database successfully.");
    } catch (error) {
      console.error(
        "Error storing products and variants in the database:",
        error
      );
    }
  }
}

async function main() {
  const productSync = new ShopifyProductSyncGraphQL();
  await productSync.fetchAllProducts();
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());

export default ShopifyProductSyncGraphQL;
