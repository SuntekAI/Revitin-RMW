const lineItemSellingPlanQuery = `
  query getSellingPlan($id: ID!){
    order(id: $id) {
      lineItems(first: 100) {
        nodes {
          id
          sellingPlan {
            sellingPlanId
            name
          }
        }
      }
    }
  }
`;

export default lineItemSellingPlanQuery;
