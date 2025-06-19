const variantsQuery = `
  query fetchVariants($productId: ID!, $firstVariants: Int!, $afterVariantCursor: String) {
    product(id: $productId) {
      variants(first: $firstVariants, after: $afterVariantCursor) {
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
`;

export default variantsQuery;
