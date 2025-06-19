const productsQuery = `
  query fetchProducts($firstProducts: Int!, $afterProductCursor: String) {
    products(first: $firstProducts, after: $afterProductCursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        totalInventory
        tags
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        description
        priceRangeV2 {
          maxVariantPrice {
            amount
          }
        }
        productType
        status
        vendor
        updatedAt
        variants(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            sku
            price
            inventoryQuantity
          }
        }
      }
    }
  }
`;

export default productsQuery;
