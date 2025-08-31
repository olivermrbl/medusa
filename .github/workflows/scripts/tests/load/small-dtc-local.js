import { check, group, sleep } from "k6"
import http from "k6/http"

const publishableKey = __ENV.K6_PUBLISHABLE_KEY
const regionId = __ENV.K6_REGION_ID
const endpoint = "http://localhost:9000"

if (!publishableKey || !endpoint || !regionId) {
  throw new Error("Missing environment variables")
}

const params = {
  headers: {
    "Content-Type": "application/json",
    "x-publishable-api-key": publishableKey,
  },
}

/*
 * k6 load test for small DTC ecommerce site (10 orders/day, ~333 daily visitors, 3% conversion).
 * Simulates  load (~50 VUs: 40 browser, 7 shopper, 3 buyer) in 5 min (30s ramp-up, 4m steady, 30s ramp-down).
 * Tests: browsing, cart operations, checkout. Metrics: p95 <500ms, error rate <1%.
 */
export const options = {
  scenarios: {
    browseCatalog: {
      executor: "ramping-vus",
      exec: "browseCatalog",
      startTime: "0s",
      stages: [
        { duration: "30s", target: 40 },
        { duration: "4m", target: 40 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "browseCatalog" },
    },
    addToCart: {
      executor: "ramping-vus",
      exec: "addToCart",
      startTime: "0s",
      stages: [
        { duration: "30s", target: 7 },
        { duration: "4m", target: 7 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "addToCart" },
    },
    completeCart: {
      executor: "ramping-vus",
      exec: "completeCart",
      startTime: "0s",
      stages: [
        { duration: "30s", target: 3 },
        { duration: "4m", target: 3 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "completeCart" },
    },
  },
  thresholds: {
    "http_req_duration{scenario:browseCatalog}": ["p(95)<600"],
    "http_req_duration{scenario:addToCart}": ["p(95)<800"],
    "http_req_duration{scenario:completeCart}": ["p(95)<1200"],
    http_req_failed: ["rate<0.01"],
  },
}

// We only treat 5xx responses as errors, some 401 are expected
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 401 }))

export function browseCatalog() {
  return group("Browse Flow", () => {
    // Load homepage data (collections, categories, regions, cart, customer)
    http.batch([
      { method: "GET", url: `${endpoint}/store/regions`, params },
      { method: "GET", url: `${endpoint}/store/collections`, params },
      { method: "GET", url: `${endpoint}/store/product-categories`, params },
      { method: "GET", url: `${endpoint}/store/customers/me`, params },
    ])

    const productsParams = `region_id=${regionId}&fields=*variants.calculated_price,+variants.inventory_quantity,+metadata,+tags`

    // Browse collections and productions
    let res = http.get(`${endpoint}/store/collections`, params)
    check(res, { "collections ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    res = http.get(`${endpoint}/store/products?${productsParams}`, params)
    check(res, { "products list ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    const products = JSON.parse(res.body).products

    res = http.get(`${endpoint}/store/products/${products[0].id}`, params)
    check(res, { "product details ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    return products
  })
}

export function addToCart() {
  return group("Shop Flow", () => {
    // Browse catalog
    const products = browseCatalog()

    const cartParams =
      "fields=*items,*region,*items.product,*items.variant,*items.thumbnail,*items.metadata,+items.total,*promotions,+shipping_methods.name"
    // Create a cart
    let res = http.post(
      `${endpoint}/store/carts`,
      JSON.stringify({
        region_id: regionId,
      }),
      params
    )
    check(res, { "create cart ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    const cart = JSON.parse(res.body).cart

    res = http.post(
      `${endpoint}/store/carts/${cart.id}/line-items`,
      JSON.stringify({
        variant_id: products[3].variants[0].id,
        quantity: 3,
      }),
      params
    )
    check(res, { "add to cart ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    let updatedCart = JSON.parse(res.body).cart

    // Go to cart
    res = http.get(
      `${endpoint}/store/carts/${updatedCart.id}?${cartParams}`,
      params
    )
    check(res, { "view cart ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    res = http.post(
      `${endpoint}/store/carts/${updatedCart.id}/line-items/${updatedCart.items[0].id}`,
      JSON.stringify({
        quantity: 4,
      }),
      params
    )
    check(res, { "change cart quantity ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    return JSON.parse(res.body).cart
  })
}

export function completeCart() {
  return group("Checkout", () => {
    const updatedCart = addToCart()
    // Go to Checkout, load cart, payment options, delivery options
    const [res, paymentProvidersResp, shippingOptionsResp] = http.batch([
      {
        method: "GET",
        url: `${endpoint}/store/carts/${updatedCart.id}`,
        params,
      },
      {
        method: "GET",
        url: `${endpoint}/store/payment-providers?region_id=${regionId}`,
        params,
      },
      {
        method: "GET",
        url: `${endpoint}/store/shipping-options?cart_id=${updatedCart.id}`,
        params,
      },
    ])
    check(res, { "view cart ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    // Set shipping address
    http.post(
      `${endpoint}/store/carts/${updatedCart.id}`,
      JSON.stringify({
        shipping_address: {
          first_name: "John",
          last_name: "Doe",
          address_1: "Some street.",
          address_2: "Some alley",
          company: "ACME",
          postal_code: "13456",
          city: "Berlin",
          country_code: "de",
          province: "QC",
          phone: "1234567",
        },
        email: "john.doe@example.com",
      }),
      params
    )
    sleep(Math.random() * 3)

    // Select delivery option
    http.post(
      `${endpoint}/store/carts/${updatedCart.id}/shipping-methods`,
      JSON.stringify({
        option_id: JSON.parse(shippingOptionsResp.body).shipping_options[0].id,
      }),
      params
    )
    sleep(Math.random() * 3)

    // Select payment method, update cart
    let paymentCollectionRes = http.post(
      `${endpoint}/store/payment-collections`,
      JSON.stringify({
        cart_id: updatedCart.id,
      }),
      params
    )
    check(paymentCollectionRes, {
      "create payment collection ok": (r) => r.status === 200,
    })
    sleep(2 + Math.random() * 3)

    const paymentCollection = JSON.parse(
      paymentCollectionRes.body
    ).payment_collection

    let paymentSessionRes = http.post(
      `${endpoint}/store/payment-collections/${paymentCollection.id}/payment-sessions`,
      JSON.stringify({
        provider_id: JSON.parse(paymentProvidersResp.body).payment_providers[0]
          .id,
      }),
      params
    )
    check(paymentSessionRes, {
      "create payment session ok": (r) => r.status === 200,
    })
    sleep(2 + Math.random() * 3)

    const paymentSession = JSON.parse(paymentSessionRes.body).payment_session
    sleep(Math.random() * 3)

    let orderRes = http.post(
      `${endpoint}/store/carts/${updatedCart.id}/complete`,
      JSON.stringify({}),
      params
    )
    check(orderRes, { "create order ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    const order = JSON.parse(orderRes.body).order
    sleep(Math.random() * 3)

    // Order confirmation, load order
    orderRes = http.get(`${endpoint}/store/orders/${order.id}`, params)
    check(res, { "view order ok": (r) => r.status === 200 })
    sleep(2 + Math.random() * 3)

    return order
  })
}
