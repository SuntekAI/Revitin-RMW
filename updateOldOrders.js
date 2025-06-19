import axios from "axios";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { createNewOrders } from "./getNewOrdersByCreatedAt.js";
dotenv.config();

const prisma = new PrismaClient();
const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

async function fetchAndProcessShopifyOrders(
  shopifyStoreUrl,
  accessToken,
  minTimestamp
) {
  const initialUrl = `${shopifyStoreUrl}/orders.json?updated_at_min=${minTimestamp}&updated_at_max=${
    new Date().toISOString().split(".")[0] + "Z"
  }&limit=250&status=any`;
  let nextUrl = initialUrl;
  let processedCount = 0;
  let latestUpdateTime = new Date(0);

  while (nextUrl) {
    try {
      const response = await axios.get(nextUrl, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      });

      const orders = response.data.orders;
      await processOrders(orders);
      processedCount += orders.length;
      console.log("Processed orders:", orders.length);
      console.log("Total orders processed so far:", processedCount);

      // Update latest update time
      const maxOrderTime = Math.max(
        ...orders.map((order) => new Date(order.updated_at).getTime())
      );
      latestUpdateTime = new Date(
        Math.max(latestUpdateTime.getTime(), maxOrderTime)
      );

      // Check for the next page URL in the Link header
      const linkHeader = response.headers.link;
      nextUrl = null;

      if (linkHeader) {
        const links = linkHeader.split(",");
        for (const link of links) {
          const [url, rel] = link.split(";");
          if (rel.includes('rel="next"')) {
            nextUrl = url.trim().slice(1, -1); // Remove < and >
            break;
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching orders: ${error.message}`);
      throw error;
    }
  }

  return { processedCount, latestUpdateTime };
}

async function processOrders(orders) {
  for (const order of orders) {
    await upsertOrder(order);
  }
}

async function upsertOrder(order) {
  console.log(`Upserting order ${order.id}`);
  const lineItemsData = order.line_items.map((item) => ({
    id: BigInt(item.id),
    sku: item.sku || null,
    name: item.name,
    grams: item.grams,
    price: parseFloat(item.price),
    title: item.title,
    vendor: item.vendor || null,
    taxable: item.taxable,
    quantity: item.quantity,
    gift_card: item.gift_card,
    price_set: JSON.stringify(item.price_set),
    tax_lines: JSON.stringify(item.tax_lines),
    product_id: item.product_id ? BigInt(item.product_id) : null,
    properties: JSON.stringify(item.properties),
    variant_id: item.variant_id ? BigInt(item.variant_id) : null,
    pre_tax_price: parseFloat(item.pre_tax_price),
    variant_title: item.variant_title || null,
    product_exists: item.product_exists,
    total_discount: parseFloat(item.total_discount),
    current_quantity: item.current_quantity,
    attributed_staffs: JSON.stringify(item.attributed_staffs),
    pre_tax_price_set: JSON.stringify(item.pre_tax_price_set),
    requires_shipping: item.requires_shipping,
    fulfillment_status: item.fulfillment_status || null,
    total_discount_set: JSON.stringify(item.total_discount_set),
    fulfillment_service: item.fulfillment_service || null,
    admin_graphql_api_id: item.admin_graphql_api_id || null,
    discount_allocations: JSON.stringify(item.discount_allocations),
    fulfillable_quantity: item.fulfillable_quantity,
    variant_inventory_management: item.variant_inventory_management || null,
  }));

  await prisma.orders.upsert({
    where: { orderId: order.id },
    update: {
      cancelReason: order.cancel_reason,
      cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
      closedAt: order.closed_at ? new Date(order.closed_at) : null,
      company:
        typeof order.company === "object"
          ? JSON.stringify(order.company)
          : order.company,
      confirmationNumber: order.confirmation_number || "",
      confirmed: order.confirmed,
      createdAt: new Date(order.created_at),
      currency: order.currency,
      currentSubtotalPrice: parseFloat(order.current_subtotal_price),
      currentSubtotalPriceSet: order.current_subtotal_price_set,
      currentTotalAdditionalFeesSet: order.current_total_additional_fees_set,
      currentTotalDiscounts: parseFloat(order.current_total_discounts),
      currentTotalDiscountsSet: order.current_total_discounts_set,
      currentTotalDutiesSet: order.current_total_duties_set,
      currentTotalPrice: parseFloat(order.current_total_price),
      currentTotalPriceSet: order.current_total_price_set,
      currentTotalTax: parseFloat(order.current_total_tax),
      currentTotalTaxSet: order.current_total_tax_set,
      fulfillmentStatus: order.fulfillment_status,
      name: order.name,
      note: order.note,
      noteAttributes: order.note_attributes,
      orderNumber: order.order_number,
      orderStatusUrl: order.order_status_url,
      presentmentCurrency: order.presentment_currency,
      processedAt: new Date(order.processed_at),
      reference: order.reference || "",
      subtotalPrice: parseFloat(order.subtotal_price),
      tags: order.tags,
      totalDiscounts: parseFloat(order.total_discounts),
      totalLineItemsPrice: parseFloat(order.total_line_items_price),
      totalOutstanding: parseFloat(order.total_outstanding),
      totalPrice: parseFloat(order.total_price),
      totalPriceSet: order.total_price_set,
      totalShippingPriceSet: order.total_shipping_price_set,
      totalTax: parseFloat(order.total_tax),
      totalTipReceived: parseFloat(order.total_tip_received),
      totalWeight: order.total_weight,
      updatedAt: new Date(order.updated_at),
      customerId: order?.customer?.id || null,
      sourceName: order.source_name,
      sourceIdentifier: order.source_identifier,
      sourceUrl: order.source_url,
      locationId: order.location_id,
      // Handle line items
      line_items: {
        deleteMany: {}, // Delete existing line items for this order
        createMany: {
          data: lineItemsData.map((lineItem) => ({
            ...lineItem, // Spread existing lineItem properties
            // The relationship to orders is handled automatically by Prisma
          })),
        },
      },

      giftCardOnly: lineItemsData.every((item) => item.gift_card === true),
      shippingAddress1: order.shipping_address?.address1 || null,
      shippingAddress2: order.shipping_address?.address2 || null,
      shippingCity: order.shipping_address?.city || null,
      shippingZip: order.shipping_address?.zip || null,
      shippingProvince: order.shipping_address?.province || null,
      shippingCountry: order.shipping_address?.country || null,
      shippingCompany: order.shipping_address?.company || null,
      shippingLatitude: order.shipping_address?.latitude || null,
      shippingLongitude: order.shipping_address?.longitude || null,
      shippingCountryCode: order.shipping_address?.country_code || null,
      shippingProvinceCode: order.shipping_address?.province_code || null,
    },
    create: {
      orderId: order.id,
      cancelReason: order.cancel_reason,
      cancelledAt: order.cancelled_at ? new Date(order.cancelled_at) : null,
      closedAt: order.closed_at ? new Date(order.closed_at) : null,
      company:
        typeof order.company === "object"
          ? JSON.stringify(order.company)
          : order.company,
      confirmationNumber: order.confirmation_number || "",
      confirmed: order.confirmed,
      createdAt: new Date(order.created_at),
      currency: order.currency,
      currentSubtotalPrice: parseFloat(order.current_subtotal_price),
      currentSubtotalPriceSet: order.current_subtotal_price_set,
      currentTotalAdditionalFeesSet: order.current_total_additional_fees_set,
      currentTotalDiscounts: parseFloat(order.current_total_discounts),
      currentTotalDiscountsSet: order.current_total_discounts_set,
      currentTotalDutiesSet: order.current_total_duties_set,
      currentTotalPrice: parseFloat(order.current_total_price),
      currentTotalPriceSet: order.current_total_price_set,
      currentTotalTax: parseFloat(order.current_total_tax),
      currentTotalTaxSet: order.current_total_tax_set,
      fulfillmentStatus: order.fulfillment_status,
      name: order.name,
      note: order.note,
      noteAttributes: order.note_attributes,
      orderNumber: order.order_number,
      orderStatusUrl: order.order_status_url,
      presentmentCurrency: order.presentment_currency,
      processedAt: new Date(order.processed_at),
      reference: order.reference || "",
      subtotalPrice: parseFloat(order.subtotal_price),
      tags: order.tags,
      totalDiscounts: parseFloat(order.total_discounts),
      totalLineItemsPrice: parseFloat(order.total_line_items_price),
      totalOutstanding: parseFloat(order.total_outstanding),
      totalPrice: parseFloat(order.total_price),
      totalPriceSet: order.total_price_set,
      totalShippingPriceSet: order.total_shipping_price_set,
      totalTax: parseFloat(order.total_tax),
      totalTipReceived: parseFloat(order.total_tip_received),
      totalWeight: order.total_weight,
      updatedAt: new Date(order.updated_at),
      customerId: order?.customer?.id || null,
      line_items: {
        createMany: {
          data: lineItemsData.map((lineItem) => ({
            ...lineItem, // Spread existing lineItem properties
            // The relationship to orders is handled automatically by Prisma
          })),
        },
      },
      sourceName: order.source_name,
      sourceIdentifier: order.source_identifier,
      sourceUrl: order.source_url,
      giftCardOnly: order.line_items.every((item) => item.gift_card === true),
      locationId: order.location_id,
      shippingAddress1: order.shipping_address?.address1 || null,
      shippingAddress2: order.shipping_address?.address2 || null,
      shippingCity: order.shipping_address?.city || null,
      shippingZip: order.shipping_address?.zip || null,
      shippingProvince: order.shipping_address?.province || null,
      shippingCountry: order.shipping_address?.country || null,
      shippingCompany: order.shipping_address?.company || null,
      shippingLatitude: order.shipping_address?.latitude || null,
      shippingLongitude: order.shipping_address?.longitude || null,
      shippingCountryCode: order.shipping_address?.country_code || null,
      shippingProvinceCode: order.shipping_address?.province_code || null,
    },
  });
}

async function main() {
  try {
    const lastUpdateTime = await createNewOrders();
    console.log(
      `Orders updated. Last update time in updateOldOrders: ${lastUpdateTime}`
    );

    const { processedCount, latestUpdateTime } =
      await fetchAndProcessShopifyOrders(
        shopifyStoreUrl,
        accessToken,
        lastUpdateTime
      );

    if (processedCount === 0) {
      console.log("No updated orders found");
      return;
    }

    console.log(`Processed ${processedCount} orders from Shopify`);

    // Update the last_order_update table with the latest update time
    await prisma.last_order_update.upsert({
      where: { id: 1 },
      update: {
        last_update: latestUpdateTime,
      },
      create: {
        id: 1,
        last_update: latestUpdateTime,
      },
    });

    console.log(
      `Updated last_order_update to ${latestUpdateTime.toISOString()}`
    );

    console.log(
      `Job completed successfully in updateOldOrders.js @ ${new Date().toISOString()}`
    );
  } catch (error) {
    console.error("Error in main function:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
