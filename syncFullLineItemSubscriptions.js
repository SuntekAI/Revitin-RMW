import dotenv from "dotenv";
import logWithTime from "./logger.js";
import { PrismaClient } from "@prisma/client";
import client from "./graphql/client.js";
import sellingPlanQuery from "./graphql/queries/selling_plan.js";

dotenv.config();

const prisma = new PrismaClient();

async function getSellingPlanDetails(shopifyOrderId, lineItemId) {
  const id = "gid://shopify/Order/" + shopifyOrderId;
  const variables = { id };

  const response = await client.request(sellingPlanQuery, {
    variables,
  });

  const items = response.data?.order?.lineItems?.nodes;

  if (!items) return { sellingPlanId: null, sellingPlanName: null };

  const match = items.find((node) => {
    const idPart = node.id.split("/").pop();
    return BigInt(idPart) === lineItemId;
  });

  return {
    sellingPlanId: match?.sellingPlan?.sellingPlanId ?? null,
    sellingPlanName: match?.sellingPlan?.name ?? null,
  };
}

const RECHARGE_API = "https://api.rechargeapps.com";

const HEADERS = {
  "X-Recharge-Version": "2021-11",
  "X-Recharge-Access-Token": process.env.RECHARGE_API_TOKEN,
};

async function fetchAllRechargeOrders() {
  let page = 1;
  let hasMore = true;
  let highestOrderIdInThisBatch = 0n;

  while (hasMore) {
    const res = await fetch(
      `${RECHARGE_API}/orders?limit=250&page=${page}&sort_by=id-desc`,
      {
        method: "GET",
        headers: HEADERS,
      }
    );

    const { orders } = await res.json();

    if (!orders || orders.length === 0) break;

    for (const order of orders) {
      const rechargeOrderId = BigInt(order.id);
      if (highestOrderIdInThisBatch === 0n) {
        highestOrderIdInThisBatch = rechargeOrderId;
      }

      const shopifyOrderId = BigInt(order.external_order_id.ecommerce);

      for (const item of order.line_items) {
        if (item.purchase_item_type === "subscription") {
          const subscriptionId = item.purchase_item_id;

          // Now fetch subscription details
          const subRes = await fetch(
            `${RECHARGE_API}/subscriptions/${subscriptionId}`,
            {
              method: "GET",
              headers: HEADERS,
            }
          );

          const { subscription } = await subRes.json();
          if (!subscription) continue;

          // Try to find local line item using product/variant/sku/title
          const localLineItem = await prisma.line_items.findFirst({
            where: {
              order_id: shopifyOrderId,
              title: item.title,
              sku: item.sku ?? undefined,
              variant_id: BigInt(subscription.external_variant_id.ecommerce),
            },
          });

          if (!localLineItem) {
            logWithTime(
              "warn",
              `⚠️ Could not match line item for Shopify Order ID ${shopifyOrderId}`
            );
            continue;
          }

          const { sellingPlanId, sellingPlanName } =
            await getSellingPlanDetails(
              order.external_order_id.ecommerce,
              localLineItem.id
            );

          // Upsert into subscription table
          const updatedOrCreated = await prisma.line_item_subscriptions.upsert({
            where: { line_item_id: localLineItem.id },
            update: {
              is_subscription: true,
              selling_plan_id: sellingPlanId,
              selling_plan_name: sellingPlanName,
              subscription_contract_id: subscription.id?.toString(),
              contract_status: subscription.status,
              next_billing_date: subscription.next_charge_scheduled_at
                ? new Date(subscription.next_charge_scheduled_at)
                : undefined,
              billing_interval: subscription.order_interval_unit,
              billing_interval_count: subscription.order_interval_frequency
                ? parseInt(subscription.order_interval_frequency)
                : undefined,
              delivery_interval: subscription.charge_interval_unit,
              delivery_interval_count: subscription.charge_interval_frequency
                ? parseInt(subscription.charge_interval_frequency)
                : undefined,
              created_at: subscription.created_at,
              updated_at: subscription.updated_at,
            },
            create: {
              line_item_id: localLineItem.id,
              is_subscription: true,
              selling_plan_id: sellingPlanId,
              selling_plan_name: sellingPlanName,
              subscription_contract_id: subscription.id?.toString(),
              contract_status: subscription.status,
              next_billing_date: subscription.next_charge_scheduled_at
                ? new Date(subscription.next_charge_scheduled_at)
                : undefined,
              billing_interval: subscription.order_interval_unit,
              billing_interval_count: subscription.order_interval_frequency
                ? parseInt(subscription.order_interval_frequency)
                : undefined,
              delivery_interval: subscription.charge_interval_unit,
              delivery_interval_count: subscription.charge_interval_frequency
                ? parseInt(subscription.charge_interval_frequency)
                : undefined,
              created_at: subscription.created_at,
              updated_at: subscription.updated_at,
            },
          });

          logWithTime(
            "info",
            `✅ Updated subscription for line_item_id ${localLineItem.id}`
          );
        }
      }
    }

    page += 1;
    hasMore = orders.length === 250;
  }

  if (highestOrderIdInThisBatch > 0n) {
    await prisma.recharge_order_id.create({
      data: { last_order_id: highestOrderIdInThisBatch },
    });

    logWithTime(
      "info",
      `🔄 Updated last processed Recharge Order ID to ${highestOrderIdInThisBatch}`
    );
  }

  logWithTime("info", "✅ All orders processed.");
  await prisma.$disconnect();
}

fetchAllRechargeOrders().catch((e) => {
  logWithTime("error", e);
  prisma.$disconnect();
});
